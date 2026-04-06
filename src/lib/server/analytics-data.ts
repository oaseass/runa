import { db } from "./db";

/* ── period helper ──────────────────────────────────────────── */
export type Period = "1d" | "7d" | "30d" | "90d" | "365d";

function sinceClause(p: Period): string {
  const map: Record<Period, string> = {
    "1d":  "'-1 day'",
    "7d":  "'-7 days'",
    "30d": "'-30 days'",
    "90d": "'-90 days'",
    "365d":"'-365 days'",
  };
  return `date('now', ${map[p]})`;
}

/* ─────────────────────────────────────────────────────────────
   A. Visit / Activity
   ─────────────────────────────────────────────────────────── */

export type VisitSummary = {
  totalPV: number;
  uniqueSessions: number;
  uniqueUsers: number;
  hasData: boolean;
};

export function getVisitSummary(period: Period): VisitSummary {
  const since = sinceClause(period);
  const row = db.prepare(`
    SELECT
      COUNT(*)                        AS pv,
      COUNT(DISTINCT session_id)      AS sessions,
      COUNT(DISTINCT user_id)         AS users
    FROM page_views
    WHERE created_at >= ${since}
  `).get() as { pv: number; sessions: number; users: number };
  return {
    totalPV:        row.pv       ?? 0,
    uniqueSessions: row.sessions ?? 0,
    uniqueUsers:    row.users    ?? 0,
    hasData:        (row.pv ?? 0) > 0,
  };
}

export type DailyPoint = { date: string; value: number };

export function getDailyPV(days: number): DailyPoint[] {
  return db.prepare(`
    SELECT date(created_at) AS date, COUNT(*) AS value
    FROM page_views
    WHERE created_at >= date('now', '-' || ? || ' days')
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all(days) as DailyPoint[];
}

export function getDailySignups(days: number): DailyPoint[] {
  return db.prepare(`
    SELECT date(created_at) AS date, COUNT(*) AS value
    FROM users
    WHERE created_at >= date('now', '-' || ? || ' days')
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all(days) as DailyPoint[];
}

export type HourPoint = { hour: number; pv: number };

export function getHourlyPV(date: string): HourPoint[] {
  return db.prepare(`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS pv
    FROM page_views
    WHERE date(created_at) = ?
    GROUP BY hour
    ORDER BY hour ASC
  `).all(date) as HourPoint[];
}

/* DAU / WAU / MAU from page_views; falls back to unique new users if no tracking */
export type ActivityMetrics = {
  dau: number;
  wau: number;
  mau: number;
  stickiness: number;
  fromTracking: boolean;
};

export function getActivityMetrics(): ActivityMetrics {
  const pvCount = (db.prepare("SELECT COUNT(*) AS c FROM page_views").get() as { c: number }).c;

  if (pvCount > 0) {
    const dau = (db.prepare(
      "SELECT COUNT(DISTINCT session_id) AS c FROM page_views WHERE created_at >= date('now')"
    ).get() as { c: number }).c;
    const wau = (db.prepare(
      "SELECT COUNT(DISTINCT session_id) AS c FROM page_views WHERE created_at >= date('now', '-7 days')"
    ).get() as { c: number }).c;
    const mau = (db.prepare(
      "SELECT COUNT(DISTINCT session_id) AS c FROM page_views WHERE created_at >= date('now', '-30 days')"
    ).get() as { c: number }).c;
    return {
      dau, wau, mau,
      stickiness: mau > 0 ? Math.round((dau / mau) * 100) : 0,
      fromTracking: true,
    };
  }

  /* fallback: count distinct users active (new signups as proxy) */
  const dau = (db.prepare("SELECT COUNT(*) AS c FROM users WHERE created_at >= date('now')").get() as { c: number }).c;
  const wau = (db.prepare("SELECT COUNT(*) AS c FROM users WHERE created_at >= date('now', '-7 days') OR id IN (SELECT DISTINCT user_id FROM void_analysis_requests WHERE created_at >= date('now', '-7 days')) OR id IN (SELECT DISTINCT user_id FROM orders WHERE created_at >= date('now', '-7 days'))").get() as { c: number }).c;
  const mau = (db.prepare("SELECT COUNT(*) AS c FROM users WHERE created_at >= date('now', '-30 days') OR id IN (SELECT DISTINCT user_id FROM void_analysis_requests WHERE created_at >= date('now', '-30 days')) OR id IN (SELECT DISTINCT user_id FROM orders WHERE created_at >= date('now', '-30 days'))").get() as { c: number }).c;

  return {
    dau, wau, mau,
    stickiness: mau > 0 ? Math.round((dau / mau) * 100) : 0,
    fromTracking: false,
  };
}

/* ─────────────────────────────────────────────────────────────
   B. Page Analytics
   ─────────────────────────────────────────────────────────── */

export type PageStat = {
  path: string;
  pv: number;
  uv: number;
  avgDurationSec: number;
};

export function getPageStats(period: Period): PageStat[] {
  const since = sinceClause(period);
  const rows = db.prepare(`
    SELECT
      page_path,
      COUNT(*)                                        AS pv,
      COUNT(DISTINCT session_id)                      AS uv,
      COALESCE(AVG(CASE WHEN duration_ms > 0 THEN duration_ms END), 0) AS avg_dur
    FROM page_views
    WHERE created_at >= ${since}
    GROUP BY page_path
    ORDER BY pv DESC
    LIMIT 30
  `).all() as { page_path: string; pv: number; uv: number; avg_dur: number }[];
  return rows.map((r) => ({
    path: r.page_path,
    pv: r.pv,
    uv: r.uv,
    avgDurationSec: Math.round((r.avg_dur ?? 0) / 1000),
  }));
}

/* ─────────────────────────────────────────────────────────────
   C. Funnels
   ─────────────────────────────────────────────────────────── */

export type FunnelStep = { label: string; count: number; rate: number };

/* 가입 퍼널: 가입 → 출생정보 → 별지도 → 첫Void → 첫결제 */
export function getSignupFunnel(period: Period): FunnelStep[] {
  const since = sinceClause(period);

  const signups = (db.prepare(
    `SELECT COUNT(*) AS c FROM users WHERE created_at >= ${since}`
  ).get() as { c: number }).c;

  const profiles = (db.prepare(
    `SELECT COUNT(*) AS c FROM users u
     JOIN onboarding_profiles op ON op.user_id = u.id
     WHERE u.created_at >= ${since} AND op.birth_date IS NOT NULL`
  ).get() as { c: number }).c;

  const charts = (db.prepare(
    `SELECT COUNT(*) AS c FROM users u
     JOIN natal_charts nc ON nc.user_id = u.id
     WHERE u.created_at >= ${since}`
  ).get() as { c: number }).c;

  const firstVoid = (db.prepare(
    `SELECT COUNT(DISTINCT v.user_id) AS c
     FROM void_analysis_requests v
     JOIN users u ON u.id = v.user_id
     WHERE u.created_at >= ${since}`
  ).get() as { c: number }).c;

  const firstPaid = (db.prepare(
    `SELECT COUNT(DISTINCT o.user_id) AS c
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.status = 'paid' AND u.created_at >= ${since}`
  ).get() as { c: number }).c;

  const steps = [
    { label: "\uc2e0\uaddc \uac00\uc785",       count: signups  },
    { label: "\ucd9c\uc0dd\uc815\ubcf4 \uc785\ub825", count: profiles },
    { label: "\ubcc4 \uc9c0\ub3c4 \uc0dd\uc131", count: charts   },
    { label: "\uccab Void \uc0ac\uc6a9",    count: firstVoid },
    { label: "\uccab \uacb0\uc81c",         count: firstPaid },
  ];
  return steps.map((s) => ({
    label: s.label,
    count: s.count,
    rate: signups > 0 ? Math.round((s.count / signups) * 100) : 0,
  }));
}

/* 결제 퍼널 */
export type PaymentFunnel = {
  created: number;
  paid: number;
  failed: number;
  conversionRate: number;
  failureRate: number;
};

export function getPaymentFunnel(period: Period): PaymentFunnel {
  const since = sinceClause(period);
  const row = db.prepare(`
    SELECT
      COUNT(*) AS created,
      SUM(CASE WHEN status = 'paid'   THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM orders WHERE created_at >= ${since}
  `).get() as { created: number; paid: number; failed: number };
  const c = row.created ?? 0;
  const p = row.paid    ?? 0;
  const f = row.failed  ?? 0;
  return {
    created:        c,
    paid:           p,
    failed:         f,
    conversionRate: c > 0 ? Math.round((p / c) * 100) : 0,
    failureRate:    c > 0 ? Math.round((f / c) * 100) : 0,
  };
}

/* Void 퍼널 */
export type VoidFunnel = {
  started: number;
  generating: number;
  completed: number;
  failed: number;
  completionRate: number;
  failureRate: number;
};

export function getVoidFunnel(period: Period): VoidFunnel {
  const since = sinceClause(period);
  const row = db.prepare(`
    SELECT
      COUNT(*) AS started,
      SUM(CASE WHEN status = 'generating' THEN 1 ELSE 0 END) AS generating,
      SUM(CASE WHEN status = 'complete'   THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'failed'     THEN 1 ELSE 0 END) AS failed
    FROM void_analysis_requests WHERE created_at >= ${since}
  `).get() as { started: number; generating: number; completed: number; failed: number };
  const s = row.started   ?? 0;
  const c = row.completed ?? 0;
  const f = row.failed    ?? 0;
  return {
    started:        s,
    generating:     row.generating ?? 0,
    completed:      c,
    failed:         f,
    completionRate: s > 0 ? Math.round((c / s) * 100) : 0,
    failureRate:    s > 0 ? Math.round((f / s) * 100) : 0,
  };
}

/* ─────────────────────────────────────────────────────────────
   D. Retention / Segments
   ─────────────────────────────────────────────────────────── */

export type CohortRow = {
  cohort: string;
  size: number;
  w0: number;
  w1: number;
  w2: number;
  w3: number;
  w4: number;
};

export function getCohortRetention(): CohortRow[] {
  /* activity = any void (complete) OR any paid order */
  const rows = db.prepare(`
    WITH cohorts AS (
      SELECT id, strftime('%Y-W%W', created_at) AS cohort_week, created_at AS signed_up
      FROM users WHERE created_at >= date('now', '-10 weeks')
    ),
    activity AS (
      SELECT user_id, created_at AS act_at
      FROM void_analysis_requests WHERE status = 'complete'
      UNION ALL
      SELECT user_id, paid_at AS act_at
      FROM orders WHERE status = 'paid' AND paid_at IS NOT NULL
    )
    SELECT
      c.cohort_week AS cohort,
      COUNT(DISTINCT c.id) AS size,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.signed_up)) / 7 AS INTEGER) = 0 THEN c.id END) AS w0,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.signed_up)) / 7 AS INTEGER) = 1 THEN c.id END) AS w1,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.signed_up)) / 7 AS INTEGER) = 2 THEN c.id END) AS w2,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.signed_up)) / 7 AS INTEGER) = 3 THEN c.id END) AS w3,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.signed_up)) / 7 AS INTEGER) = 4 THEN c.id END) AS w4
    FROM cohorts c
    LEFT JOIN activity a ON a.user_id = c.id AND a.act_at >= c.signed_up
    GROUP BY c.cohort_week
    ORDER BY c.cohort_week DESC
    LIMIT 10
  `).all() as CohortRow[];
  return rows.map((r) => ({
    cohort: r.cohort,
    size:   r.size ?? 0,
    w0: r.size > 0 ? Math.round(((r.w0 ?? 0) / r.size) * 100) : 0,
    w1: r.size > 0 ? Math.round(((r.w1 ?? 0) / r.size) * 100) : 0,
    w2: r.size > 0 ? Math.round(((r.w2 ?? 0) / r.size) * 100) : 0,
    w3: r.size > 0 ? Math.round(((r.w3 ?? 0) / r.size) * 100) : 0,
    w4: r.size > 0 ? Math.round(((r.w4 ?? 0) / r.size) * 100) : 0,
  }));
}

export type UserSegment = { label: string; count: number; pct: number; color: string };

export function getUserSegments(): UserSegment[] {
  const total = (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
  if (total === 0) return [];

  /* subscribed: has paid membership or yearly */
  const subscribed = (db.prepare(
    "SELECT COUNT(DISTINCT user_id) AS c FROM orders WHERE status='paid' AND product_id IN ('membership','yearly')"
  ).get() as { c: number }).c;

  /* paid: has any paid order but not membership */
  const paid = (db.prepare(
    "SELECT COUNT(DISTINCT user_id) AS c FROM orders WHERE status='paid'"
  ).get() as { c: number }).c;

  /* high-active: 5+ void completes in last 30 days */
  const highActive = (db.prepare(
    "SELECT COUNT(*) AS c FROM (SELECT user_id FROM void_analysis_requests WHERE status='complete' AND created_at >= date('now','-30 days') GROUP BY user_id HAVING COUNT(*) >= 5)"
  ).get() as { c: number }).c;

  /* churn-risk: paid/subscribed but zero activity in last 30 days */
  const churnRisk = (db.prepare(
    `SELECT COUNT(DISTINCT u.id) AS c FROM users u
     JOIN orders o ON o.user_id = u.id
     WHERE o.status = 'paid'
       AND u.id NOT IN (
         SELECT DISTINCT user_id FROM void_analysis_requests WHERE created_at >= date('now','-30 days')
         UNION
         SELECT DISTINCT user_id FROM orders WHERE created_at >= date('now','-30 days')
       )`
  ).get() as { c: number }).c;

  const free = total - paid;
  const paidOnly = paid - subscribed;

  const segs: { label: string; count: number; color: string }[] = [
    { label: "\ubb34\ub8cc",       count: free,       color: "#6b7280" },
    { label: "\uc77c\ud68c\uacb0\uc81c", count: paidOnly,   color: "#6366f1" },
    { label: "\uad6c\ub3c5",       count: subscribed, color: "#8b5cf6" },
    { label: "\uace0\ud65c\uc131",  count: highActive, color: "#059669" },
    { label: "\uc774\ud0c8\uc704\ud5d8", count: churnRisk, color: "#dc2626" },
  ];
  return segs.map((s) => ({
    ...s,
    pct: Math.round((s.count / total) * 100),
  }));
}

/* ─────────────────────────────────────────────────────────────
   E. LUNA 특화 지표
   ─────────────────────────────────────────────────────────── */

export type LunaMetrics = {
  totalUsers: number;
  profileCompleted: number;      /* has birth_date */
  birthTimeEntered: number;      /* has birth_hour */
  profileCompletionRate: number;
  birthTimeRate: number;
  chartGenerated: number;
  chartRate: number;
  voidByDomain: { domain: string; label: string; count: number; pct: number }[];
  productConversion: {
    productId: string;
    label: string;
    created: number;
    paid: number;
    rate: number;
    revenue: number;
  }[];
};

const DOMAIN_LABEL: Record<string, string> = {
  self:   "\ub098",
  love:   "\uc5f0\uc560",
  work:   "\uc77c/\ub8e8\ud2f4",
  social: "\uc0ac\uace0/\ud45c\ud604",
};

const PRODUCT_LABEL: Record<string, string> = {
  membership: "\uba64\ubc84\uc2ed",
  yearly:     "\uc5f0\uac04 \uad6c\ub3c5",
  area:       "\uc601\uc5ed \ubcf4\uace0\uc11c",
  question:   "\ub2e8\uc77c \uc9c8\ubb38",
};

export function getLunaMetrics(): LunaMetrics {
  const totalUsers = (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;

  const profileCompleted = (db.prepare(
    "SELECT COUNT(*) AS c FROM onboarding_profiles WHERE birth_date IS NOT NULL"
  ).get() as { c: number }).c;

  const birthTimeEntered = (db.prepare(
    "SELECT COUNT(*) AS c FROM onboarding_profiles WHERE birth_hour IS NOT NULL"
  ).get() as { c: number }).c;

  const chartGenerated = (db.prepare(
    "SELECT COUNT(*) AS c FROM natal_charts"
  ).get() as { c: number }).c;

  const voidDomainRaw = db.prepare(
    "SELECT category, COUNT(*) AS cnt FROM void_analysis_requests GROUP BY category ORDER BY cnt DESC"
  ).all() as { category: string; cnt: number }[];

  const totalVoid = voidDomainRaw.reduce((s, r) => s + r.cnt, 0);

  const productRaw = db.prepare(
    `SELECT product_id,
       COUNT(*) AS created,
       SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paid,
       SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) AS revenue
     FROM orders GROUP BY product_id ORDER BY paid DESC`
  ).all() as { product_id: string; created: number; paid: number; revenue: number }[];

  return {
    totalUsers,
    profileCompleted,
    birthTimeEntered,
    profileCompletionRate: totalUsers > 0 ? Math.round((profileCompleted / totalUsers) * 100) : 0,
    birthTimeRate: profileCompleted > 0 ? Math.round((birthTimeEntered / profileCompleted) * 100) : 0,
    chartGenerated,
    chartRate: totalUsers > 0 ? Math.round((chartGenerated / totalUsers) * 100) : 0,
    voidByDomain: voidDomainRaw.map((r) => ({
      domain: r.category,
      label:  DOMAIN_LABEL[r.category] ?? r.category,
      count:  r.cnt,
      pct:    totalVoid > 0 ? Math.round((r.cnt / totalVoid) * 100) : 0,
    })),
    productConversion: productRaw.map((r) => ({
      productId: r.product_id,
      label:     PRODUCT_LABEL[r.product_id] ?? r.product_id,
      created:   r.created,
      paid:      r.paid ?? 0,
      rate:      r.created > 0 ? Math.round(((r.paid ?? 0) / r.created) * 100) : 0,
      revenue:   r.revenue ?? 0,
    })),
  };
}

/* ─────────────────────────────────────────────────────────────
   F. 품질 / 운영
   ─────────────────────────────────────────────────────────── */

export type QualityMetrics = {
  paymentFailureRate: number;
  voidFailureRate: number;
  voidStuck: number;           /* generating > 10 min */
  recentOrderFails: { time: string; productId: string; code: string | null; msg: string | null }[];
  recentVoidFails: { time: string; category: string; userId: string }[];
};

export function getQualityMetrics(): QualityMetrics {
  const orderRow = db.prepare(
    "SELECT SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed, COUNT(*) AS total FROM orders"
  ).get() as { failed: number; total: number };

  const voidRow = db.prepare(
    "SELECT SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed, COUNT(*) AS total FROM void_analysis_requests"
  ).get() as { failed: number; total: number };

  const voidStuck = (db.prepare(
    "SELECT COUNT(*) AS c FROM void_analysis_requests WHERE status='generating' AND created_at <= datetime('now', '-10 minutes')"
  ).get() as { c: number }).c;

  const recentOrderFails = db.prepare(
    "SELECT created_at AS time, product_id, fail_code AS code, fail_message AS msg FROM orders WHERE status='failed' ORDER BY created_at DESC LIMIT 10"
  ).all() as { time: string; product_id: string; code: string | null; msg: string | null }[];

  const recentVoidFails = db.prepare(
    "SELECT created_at AS time, category, user_id FROM void_analysis_requests WHERE status='failed' ORDER BY created_at DESC LIMIT 10"
  ).all() as { time: string; category: string; user_id: string }[];

  return {
    paymentFailureRate:
      orderRow.total > 0 ? Math.round(((orderRow.failed ?? 0) / orderRow.total) * 100) : 0,
    voidFailureRate:
      voidRow.total > 0 ? Math.round(((voidRow.failed ?? 0) / voidRow.total) * 100) : 0,
    voidStuck,
    recentOrderFails: recentOrderFails.map((r) => ({
      time: r.time, productId: r.product_id, code: r.code, msg: r.msg,
    })),
    recentVoidFails: recentVoidFails.map((r) => ({
      time: r.time, category: r.category, userId: r.user_id,
    })),
  };
}

/* ─────────────────────────────────────────────────────────────
   G. event tracking helpers (called from track API)
   ─────────────────────────────────────────────────────────── */

export function insertPageView(
  sessionId: string,
  pagePath: string,
  userId: string | null,
  referrerPath: string | null,
  durationMs: number | null,
): void {
  db.prepare(
    `INSERT INTO page_views (user_id, session_id, page_path, referrer_path, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run([userId, sessionId, pagePath, referrerPath, durationMs]);
}

export function insertAnalyticsEvent(
  sessionId: string,
  eventName: string,
  userId: string | null,
  pagePath: string | null,
  properties: Record<string, unknown> | null,
): void {
  db.prepare(
    `INSERT INTO analytics_events (user_id, session_id, event_name, page_path, properties, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run([
    userId,
    sessionId,
    eventName,
    pagePath,
    properties ? JSON.stringify(properties) : null,
  ]);
}

/* ─────────────────────────────────────────────────────────────
   H. 기간 비교 — 매출 / 가입 / Void
   ─────────────────────────────────────────────────────────── */

export type PeriodComparison = {
  current:  number;
  previous: number;
  delta:    number;   // current - previous
  changePct: number;  // % change (NaN safe → 0 when previous=0)
};

/** 두 기간 매출 비교 (지정 기간 vs 직전 같은 길이 기간) */
export function getRevenuePeriodComparison(period: Period): {
  revenue:  PeriodComparison;
  orders:   PeriodComparison;
  newUsers: PeriodComparison;
  voidCompleted: PeriodComparison;
} {
  const daysMap: Record<Period, number> = { "1d": 1, "7d": 7, "30d": 30, "90d": 90, "365d": 365 };
  const d = daysMap[period];

  const rev = db.prepare(`
    SELECT
      SUM(CASE WHEN paid_at >= date('now', '-' || ? || ' days')
               THEN amount ELSE 0 END) AS cur,
      SUM(CASE WHEN paid_at >= date('now', '-' || ? || ' days')
               AND paid_at  <  date('now', '-' || ? || ' days')
               THEN amount ELSE 0 END) AS prev
    FROM orders WHERE status = 'paid'
  `).get([d, d * 2, d]) as { cur: number | null; prev: number | null };

  const ord = db.prepare(`
    SELECT
      SUM(CASE WHEN created_at >= date('now', '-' || ? || ' days') THEN 1 ELSE 0 END) AS cur,
      SUM(CASE WHEN created_at >= date('now', '-' || ? || ' days')
               AND created_at  <  date('now', '-' || ? || ' days') THEN 1 ELSE 0 END) AS prev
    FROM orders WHERE status = 'paid'
  `).get([d, d * 2, d]) as { cur: number | null; prev: number | null };

  const usr = db.prepare(`
    SELECT
      SUM(CASE WHEN created_at >= date('now', '-' || ? || ' days') THEN 1 ELSE 0 END) AS cur,
      SUM(CASE WHEN created_at >= date('now', '-' || ? || ' days')
               AND created_at  <  date('now', '-' || ? || ' days') THEN 1 ELSE 0 END) AS prev
    FROM users
  `).get([d, d * 2, d]) as { cur: number | null; prev: number | null };

  const vod = db.prepare(`
    SELECT
      SUM(CASE WHEN created_at >= date('now', '-' || ? || ' days') THEN 1 ELSE 0 END) AS cur,
      SUM(CASE WHEN created_at >= date('now', '-' || ? || ' days')
               AND created_at  <  date('now', '-' || ? || ' days') THEN 1 ELSE 0 END) AS prev
    FROM void_analysis_requests WHERE status = 'complete'
  `).get([d, d * 2, d]) as { cur: number | null; prev: number | null };

  function cmp(cur: number | null, prev: number | null): PeriodComparison {
    const c = cur ?? 0;
    const p = prev ?? 0;
    return {
      current:   c,
      previous:  p,
      delta:     c - p,
      changePct: p > 0 ? Math.round(((c - p) / p) * 100) : 0,
    };
  }

  return {
    revenue:       cmp(rev.cur,  rev.prev),
    orders:        cmp(ord.cur,  ord.prev),
    newUsers:      cmp(usr.cur,  usr.prev),
    voidCompleted: cmp(vod.cur,  vod.prev),
  };
}

/* ─────────────────────────────────────────────────────────────
   I. IAP 이벤트 로그 (구독 생애주기)
   ─────────────────────────────────────────────────────────── */

export type IapEvent = {
  userId:        string;
  platform:      string;
  skuId:         string;
  status:        string;
  purchaseDate:  string;
  expiresDate:   string | null;
  transactionId: string;
};

export function getRecentIapEvents(limit = 20): IapEvent[] {
  const rows = db.prepare(`
    SELECT user_id, platform, sku_id, status, purchase_date, expires_date, transaction_id
    FROM iap_receipts
    ORDER BY purchase_date DESC
    LIMIT ?
  `).all(limit) as {
    user_id: string; platform: string; sku_id: string; status: string;
    purchase_date: string; expires_date: string | null; transaction_id: string;
  }[];
  return rows.map((r) => ({
    userId:        r.user_id,
    platform:      r.platform,
    skuId:         r.sku_id,
    status:        r.status,
    purchaseDate:  r.purchase_date,
    expiresDate:   r.expires_date,
    transactionId: r.transaction_id,
  }));
}

export type IapHealthSummary = {
  totalEvents:    number;
  byPlatform:     { platform: string; count: number }[];
  byStatus:       { status: string; count: number }[];
  gracePeriodNow: number;  // users currently in grace period
  expiredNow:     number;  // users with is_vip=1 but expired (no grace)
  renewalRisk:    number;  // expiring within 3 days
};

export function getIapHealthSummary(): IapHealthSummary {
  const total = (db.prepare("SELECT COUNT(*) AS c FROM iap_receipts").get() as { c: number }).c;

  const byPlatform = db.prepare(
    "SELECT platform, COUNT(*) AS count FROM iap_receipts GROUP BY platform ORDER BY count DESC"
  ).all() as { platform: string; count: number }[];

  const byStatus = db.prepare(
    "SELECT status, COUNT(*) AS count FROM iap_receipts GROUP BY status ORDER BY count DESC"
  ).all() as { status: string; count: number }[];

  const now = new Date().toISOString();
  const in3d = new Date(Date.now() + 3 * 86_400_000).toISOString();

  const gracePeriodNow = (db.prepare(`
    SELECT COUNT(*) AS c FROM entitlements
    WHERE is_vip = 1
      AND vip_expires_at IS NOT NULL
      AND vip_expires_at < @now
      AND vip_grace_until IS NOT NULL
      AND vip_grace_until > @now
  `).get({ now }) as { c: number }).c;

  const expiredNow = (db.prepare(`
    SELECT COUNT(*) AS c FROM entitlements
    WHERE is_vip = 1
      AND vip_expires_at IS NOT NULL
      AND vip_expires_at < @now
      AND (vip_grace_until IS NULL OR vip_grace_until < @now)
  `).get({ now }) as { c: number }).c;

  const renewalRisk = (db.prepare(`
    SELECT COUNT(*) AS c FROM entitlements
    WHERE is_vip = 1
      AND vip_expires_at IS NOT NULL
      AND vip_expires_at > @now
      AND vip_expires_at < @in3d
  `).get({ now, in3d }) as { c: number }).c;

  return { totalEvents: total, byPlatform, byStatus, gracePeriodNow, expiredNow, renewalRisk };
}

/* ─────────────────────────────────────────────────────────────
   J. Dwell Time 분석 (페이지별 평균 체류시간)
   ─────────────────────────────────────────────────────────── */

export type DwellStat = {
  path:         string;
  pv:           number;
  uv:           number;
  avgSec:       number;
  p50Sec:       number;   // 중앙값 근사 (SQLite: median via subquery)
  bounceRate:   number;   // duration < 5s 비율
};

export function getDwellTimeStats(period: Period): DwellStat[] {
  const since = sinceClause(period);
  const rows = db.prepare(`
    SELECT
      page_path,
      COUNT(*) AS pv,
      COUNT(DISTINCT session_id) AS uv,
      COALESCE(AVG(CASE WHEN duration_ms > 0 THEN duration_ms END), 0) AS avg_ms,
      SUM(CASE WHEN duration_ms IS NOT NULL AND duration_ms < 5000 THEN 1 ELSE 0 END) AS fast_exits,
      SUM(CASE WHEN duration_ms IS NOT NULL THEN 1 ELSE 0 END) AS with_duration
    FROM page_views
    WHERE created_at >= ${since}
    GROUP BY page_path
    ORDER BY pv DESC
    LIMIT 20
  `).all() as {
    page_path: string; pv: number; uv: number;
    avg_ms: number; fast_exits: number; with_duration: number;
  }[];

  return rows.map((r) => ({
    path:       r.page_path,
    pv:         r.pv,
    uv:         r.uv,
    avgSec:     Math.round((r.avg_ms ?? 0) / 1000),
    p50Sec:     0, // SQLite는 PERCENTILE 없음 — 별도 계산 비용 높아 생략
    bounceRate: r.with_duration > 0
      ? Math.round((r.fast_exits / r.with_duration) * 100)
      : 0,
  }));
}

/* ─────────────────────────────────────────────────────────────
   K. VIP Funnel (가입 → VIP 전환 드릴다운)
   ─────────────────────────────────────────────────────────── */

export type VipFunnel = {
  registered:      number;  // 총 가입자
  hasChart:        number;  // 별 지도 있는 유저
  usedVoid:        number;  // 1회 이상 Void 사용
  everPaid:        number;  // 결제 1회 이상
  activeVip:       number;  // 현재 활성 VIP
  monthlyVip:      number;  // vip_source = vip_monthly
  yearlyVip:       number;  // vip_source = vip_yearly
};

export function getVipFunnel(period: Period): VipFunnel {
  const since = sinceClause(period);

  const registered = (db.prepare(
    `SELECT COUNT(*) AS c FROM users WHERE created_at >= ${since}`
  ).get() as { c: number }).c;

  const hasChart = (db.prepare(`
    SELECT COUNT(DISTINCT nc.user_id) AS c
    FROM natal_charts nc
    JOIN users u ON u.id = nc.user_id
    WHERE u.created_at >= ${since}
  `).get() as { c: number }).c;

  const usedVoid = (db.prepare(`
    SELECT COUNT(DISTINCT v.user_id) AS c
    FROM void_analysis_requests v
    JOIN users u ON u.id = v.user_id
    WHERE u.created_at >= ${since}
  `).get() as { c: number }).c;

  const everPaid = (db.prepare(`
    SELECT COUNT(DISTINCT o.user_id) AS c
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.status = 'paid' AND u.created_at >= ${since}
  `).get() as { c: number }).c;

  const now = new Date().toISOString();

  const vipRow = db.prepare(`
    SELECT
      SUM(e.is_vip) AS active,
      SUM(CASE WHEN e.vip_source = 'vip_monthly' THEN e.is_vip ELSE 0 END) AS monthly,
      SUM(CASE WHEN e.vip_source = 'vip_yearly'  THEN e.is_vip ELSE 0 END) AS yearly
    FROM entitlements e
    JOIN users u ON u.id = e.user_id
    WHERE u.created_at >= ${since}
      AND e.is_vip = 1
      AND (e.vip_expires_at IS NULL
           OR e.vip_expires_at > @now
           OR (e.vip_grace_until IS NOT NULL AND e.vip_grace_until > @now))
  `).get({ now }) as { active: number | null; monthly: number | null; yearly: number | null };

  return {
    registered,
    hasChart,
    usedVoid,
    everPaid,
    activeVip:  vipRow.active  ?? 0,
    monthlyVip: vipRow.monthly ?? 0,
    yearlyVip:  vipRow.yearly  ?? 0,
  };
}

/* ─────────────────────────────────────────────────────────────
   L. 서비스 신호 (운영 알림용)
   ─────────────────────────────────────────────────────────── */

export type ServiceSignals = {
  iapHealth:     IapHealthSummary;
  voidQueueLen:  number;   // generating 상태 10분 이상
  recentRevenue: number;   // 최근 1시간 매출
  newUsersToday: number;
  failedOrders1h: number;  // 최근 1시간 결제 실패
};

export function getServiceSignals(): ServiceSignals {
  const iapHealth = getIapHealthSummary();

  const voidQueueLen = (db.prepare(
    "SELECT COUNT(*) AS c FROM void_analysis_requests WHERE status='generating' AND created_at <= datetime('now','-10 minutes')"
  ).get() as { c: number }).c;

  const recentRevenue = (db.prepare(
    "SELECT COALESCE(SUM(amount),0) AS s FROM orders WHERE status='paid' AND paid_at >= datetime('now','-1 hour')"
  ).get() as { s: number }).s;

  const newUsersToday = (db.prepare(
    "SELECT COUNT(*) AS c FROM users WHERE created_at >= date('now')"
  ).get() as { c: number }).c;

  const failedOrders1h = (db.prepare(
    "SELECT COUNT(*) AS c FROM orders WHERE status='failed' AND created_at >= datetime('now','-1 hour')"
  ).get() as { c: number }).c;

  return { iapHealth, voidQueueLen, recentRevenue, newUsersToday, failedOrders1h };
}

function toPctCohortRows(rows: CohortRow[]): CohortRow[] {
  return rows.map((r) => ({
    cohort: r.cohort,
    size:   r.size ?? 0,
    w0: r.size > 0 ? Math.round(((r.w0 ?? 0) / r.size) * 100) : 0,
    w1: r.size > 0 ? Math.round(((r.w1 ?? 0) / r.size) * 100) : 0,
    w2: r.size > 0 ? Math.round(((r.w2 ?? 0) / r.size) * 100) : 0,
    w3: r.size > 0 ? Math.round(((r.w3 ?? 0) / r.size) * 100) : 0,
    w4: r.size > 0 ? Math.round(((r.w4 ?? 0) / r.size) * 100) : 0,
  }));
}

/* ─────────────────────────────────────────────────────────────
   M. Retention 확장
   ─────────────────────────────────────────────────────────── */

export function getFirstPaymentCohortRetention(): CohortRow[] {
  const rows = db.prepare(`
    WITH cohorts AS (
      SELECT
        user_id AS id,
        MIN(paid_at) AS cohort_at,
        strftime('%Y-W%W', MIN(paid_at)) AS cohort_week
      FROM orders
      WHERE status = 'paid' AND paid_at IS NOT NULL
      GROUP BY user_id
      HAVING MIN(paid_at) >= date('now', '-10 weeks')
    ),
    activity AS (
      SELECT user_id, created_at AS act_at
      FROM void_analysis_requests WHERE status = 'complete'
      UNION ALL
      SELECT user_id, paid_at AS act_at
      FROM orders WHERE status = 'paid' AND paid_at IS NOT NULL
    )
    SELECT
      c.cohort_week AS cohort,
      COUNT(DISTINCT c.id) AS size,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.cohort_at)) / 7 AS INTEGER) = 0 THEN c.id END) AS w0,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.cohort_at)) / 7 AS INTEGER) = 1 THEN c.id END) AS w1,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.cohort_at)) / 7 AS INTEGER) = 2 THEN c.id END) AS w2,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.cohort_at)) / 7 AS INTEGER) = 3 THEN c.id END) AS w3,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.cohort_at)) / 7 AS INTEGER) = 4 THEN c.id END) AS w4
    FROM cohorts c
    LEFT JOIN activity a ON a.user_id = c.id AND a.act_at >= c.cohort_at
    GROUP BY c.cohort_week
    ORDER BY c.cohort_week DESC
    LIMIT 10
  `).all() as CohortRow[];

  return toPctCohortRows(rows);
}

export function getFirstVoidCohortRetention(): CohortRow[] {
  const rows = db.prepare(`
    WITH cohorts AS (
      SELECT
        user_id AS id,
        MIN(created_at) AS cohort_at,
        strftime('%Y-W%W', MIN(created_at)) AS cohort_week
      FROM void_analysis_requests
      WHERE status = 'complete'
      GROUP BY user_id
      HAVING MIN(created_at) >= date('now', '-10 weeks')
    ),
    activity AS (
      SELECT user_id, created_at AS act_at
      FROM void_analysis_requests WHERE status = 'complete'
      UNION ALL
      SELECT user_id, paid_at AS act_at
      FROM orders WHERE status = 'paid' AND paid_at IS NOT NULL
    )
    SELECT
      c.cohort_week AS cohort,
      COUNT(DISTINCT c.id) AS size,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.cohort_at)) / 7 AS INTEGER) = 0 THEN c.id END) AS w0,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.cohort_at)) / 7 AS INTEGER) = 1 THEN c.id END) AS w1,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.cohort_at)) / 7 AS INTEGER) = 2 THEN c.id END) AS w2,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.cohort_at)) / 7 AS INTEGER) = 3 THEN c.id END) AS w3,
      COUNT(DISTINCT CASE WHEN CAST((julianday(a.act_at) - julianday(c.cohort_at)) / 7 AS INTEGER) = 4 THEN c.id END) AS w4
    FROM cohorts c
    LEFT JOIN activity a ON a.user_id = c.id AND a.act_at >= c.cohort_at
    GROUP BY c.cohort_week
    ORDER BY c.cohort_week DESC
    LIMIT 10
  `).all() as CohortRow[];

  return toPctCohortRows(rows);
}

/* ─────────────────────────────────────────────────────────────
   N. 경로 분석
   ─────────────────────────────────────────────────────────── */

export type TransitionSource = {
  path: string;
  transitions: number;
};

export type NextPathStat = {
  path: string;
  count: number;
  rate: number;
};

export function getTopTransitionSources(period: Period, limit = 8): TransitionSource[] {
  const since = sinceClause(period);
  return db.prepare(`
    WITH ordered_views AS (
      SELECT
        session_id,
        page_path,
        LEAD(page_path) OVER (PARTITION BY session_id ORDER BY id ASC) AS next_path
      FROM page_views
      WHERE created_at >= ${since}
    )
    SELECT page_path AS path, COUNT(*) AS transitions
    FROM ordered_views
    WHERE next_path IS NOT NULL
      AND next_path != page_path
    GROUP BY page_path
    ORDER BY transitions DESC
    LIMIT ?
  `).all(limit) as TransitionSource[];
}

export function getTopNextPaths(period: Period, fromPath: string, limit = 3): NextPathStat[] {
  const since = sinceClause(period);
  const total = (db.prepare(`
    WITH ordered_views AS (
      SELECT
        session_id,
        page_path,
        LEAD(page_path) OVER (PARTITION BY session_id ORDER BY id ASC) AS next_path
      FROM page_views
      WHERE created_at >= ${since}
    )
    SELECT COUNT(*) AS c
    FROM ordered_views
    WHERE page_path = ?
      AND next_path IS NOT NULL
      AND next_path != page_path
  `).get(fromPath) as { c: number }).c;

  const rows = db.prepare(`
    WITH ordered_views AS (
      SELECT
        session_id,
        page_path,
        LEAD(page_path) OVER (PARTITION BY session_id ORDER BY id ASC) AS next_path
      FROM page_views
      WHERE created_at >= ${since}
    )
    SELECT next_path AS path, COUNT(*) AS count
    FROM ordered_views
    WHERE page_path = ?
      AND next_path IS NOT NULL
      AND next_path != page_path
    GROUP BY next_path
    ORDER BY count DESC, path ASC
    LIMIT ?
  `).all([fromPath, limit]) as { path: string; count: number }[];

  return rows.map((row) => ({
    path: row.path,
    count: row.count,
    rate: total > 0 ? Math.round((row.count / total) * 100) : 0,
  }));
}

export type LandingConversion = {
  path: string;
  sessions: number;
  authSessions: number;
  homeSessions: number;
  checkoutSessions: number;
  authRate: number;
  homeRate: number;
  checkoutRate: number;
};

export function getLandingPageConversions(period: Period, limit = 10): LandingConversion[] {
  const since = sinceClause(period);
  const rows = db.prepare(`
    WITH period_views AS (
      SELECT * FROM page_views WHERE created_at >= ${since}
    ),
    first_hits AS (
      SELECT session_id, MIN(id) AS first_id
      FROM period_views
      GROUP BY session_id
    ),
    landing_sessions AS (
      SELECT pv.session_id, pv.page_path AS landing_path
      FROM period_views pv
      JOIN first_hits fh ON fh.first_id = pv.id
    ),
    session_flags AS (
      SELECT
        session_id,
        MAX(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) AS authed,
        MAX(CASE WHEN page_path = '/home' OR page_path LIKE '/home/%' THEN 1 ELSE 0 END) AS home_hit,
        MAX(CASE WHEN page_path = '/shop' OR page_path LIKE '/store/%' OR page_path LIKE '/payment/%' THEN 1 ELSE 0 END) AS checkout_hit
      FROM period_views
      GROUP BY session_id
    )
    SELECT
      ls.landing_path AS path,
      COUNT(*) AS sessions,
      SUM(sf.authed) AS auth_sessions,
      SUM(sf.home_hit) AS home_sessions,
      SUM(sf.checkout_hit) AS checkout_sessions
    FROM landing_sessions ls
    JOIN session_flags sf ON sf.session_id = ls.session_id
    GROUP BY ls.landing_path
    ORDER BY sessions DESC, path ASC
    LIMIT ?
  `).all(limit) as {
    path: string;
    sessions: number;
    auth_sessions: number;
    home_sessions: number;
    checkout_sessions: number;
  }[];

  return rows.map((row) => ({
    path: row.path,
    sessions: row.sessions,
    authSessions: row.auth_sessions ?? 0,
    homeSessions: row.home_sessions ?? 0,
    checkoutSessions: row.checkout_sessions ?? 0,
    authRate: row.sessions > 0 ? Math.round(((row.auth_sessions ?? 0) / row.sessions) * 100) : 0,
    homeRate: row.sessions > 0 ? Math.round(((row.home_sessions ?? 0) / row.sessions) * 100) : 0,
    checkoutRate: row.sessions > 0 ? Math.round(((row.checkout_sessions ?? 0) / row.sessions) * 100) : 0,
  }));
}

export type ExitPageStat = {
  path: string;
  exits: number;
  pv: number;
  exitRate: number;
};

export type PathSearchResult = {
  path: string;
  pv: number;
  uv: number;
  avgDurationSec: number;
};

export type PathDrilldownSummary = {
  path: string;
  pv: number;
  uv: number;
  avgDurationSec: number;
  landingSessions: number;
  exitSessions: number;
  exitRate: number;
};

export function getTopExitPages(period: Period, limit = 10): ExitPageStat[] {
  const since = sinceClause(period);
  const rows = db.prepare(`
    WITH period_views AS (
      SELECT * FROM page_views WHERE created_at >= ${since}
    ),
    last_hits AS (
      SELECT session_id, MAX(id) AS last_id
      FROM period_views
      GROUP BY session_id
    ),
    exits AS (
      SELECT pv.page_path AS path, COUNT(*) AS exits
      FROM period_views pv
      JOIN last_hits lh ON lh.last_id = pv.id
      GROUP BY pv.page_path
    ),
    page_totals AS (
      SELECT page_path AS path, COUNT(*) AS pv
      FROM period_views
      GROUP BY page_path
    )
    SELECT
      e.path,
      e.exits,
      pt.pv,
      CASE WHEN pt.pv > 0 THEN ROUND((e.exits * 100.0) / pt.pv) ELSE 0 END AS exit_rate
    FROM exits e
    JOIN page_totals pt ON pt.path = e.path
    ORDER BY e.exits DESC, e.path ASC
    LIMIT ?
  `).all(limit) as { path: string; exits: number; pv: number; exit_rate: number }[];

  return rows.map((row) => ({
    path: row.path,
    exits: row.exits,
    pv: row.pv,
    exitRate: row.exit_rate,
  }));
}

export function searchTrackedPaths(period: Period, query: string, limit = 12): PathSearchResult[] {
  const since = sinceClause(period);
  const q = query.trim();
  const prefix = `${q}%`;

  const rows = db.prepare(`
    SELECT
      page_path AS path,
      COUNT(*) AS pv,
      COUNT(DISTINCT session_id) AS uv,
      COALESCE(AVG(CASE WHEN duration_ms > 0 THEN duration_ms END), 0) AS avg_dur
    FROM page_views
    WHERE created_at >= ${since}
      AND (? = '' OR LOWER(page_path) LIKE '%' || LOWER(?) || '%')
    GROUP BY page_path
    ORDER BY
      CASE
        WHEN ? != '' AND page_path = ? THEN 0
        WHEN ? != '' AND page_path LIKE ? THEN 1
        ELSE 2
      END,
      pv DESC,
      path ASC
    LIMIT ?
  `).all([q, q, q, q, q, prefix, limit]) as {
    path: string;
    pv: number;
    uv: number;
    avg_dur: number;
  }[];

  return rows.map((row) => ({
    path: row.path,
    pv: row.pv,
    uv: row.uv,
    avgDurationSec: Math.round((row.avg_dur ?? 0) / 1000),
  }));
}

export function getTopPreviousPaths(period: Period, toPath: string, limit = 3): NextPathStat[] {
  const since = sinceClause(period);
  const total = (db.prepare(`
    WITH ordered_views AS (
      SELECT
        session_id,
        page_path,
        LAG(page_path) OVER (PARTITION BY session_id ORDER BY id ASC) AS prev_path
      FROM page_views
      WHERE created_at >= ${since}
    )
    SELECT COUNT(*) AS c
    FROM ordered_views
    WHERE page_path = ?
      AND prev_path IS NOT NULL
      AND prev_path != page_path
  `).get(toPath) as { c: number }).c;

  const rows = db.prepare(`
    WITH ordered_views AS (
      SELECT
        session_id,
        page_path,
        LAG(page_path) OVER (PARTITION BY session_id ORDER BY id ASC) AS prev_path
      FROM page_views
      WHERE created_at >= ${since}
    )
    SELECT prev_path AS path, COUNT(*) AS count
    FROM ordered_views
    WHERE page_path = ?
      AND prev_path IS NOT NULL
      AND prev_path != page_path
    GROUP BY prev_path
    ORDER BY count DESC, path ASC
    LIMIT ?
  `).all([toPath, limit]) as { path: string; count: number }[];

  return rows.map((row) => ({
    path: row.path,
    count: row.count,
    rate: total > 0 ? Math.round((row.count / total) * 100) : 0,
  }));
}

export function getPathDrilldownSummary(period: Period, path: string): PathDrilldownSummary {
  const since = sinceClause(period);
  const row = db.prepare(`
    WITH period_views AS (
      SELECT * FROM page_views WHERE created_at >= ${since}
    ),
    first_hits AS (
      SELECT session_id, MIN(id) AS first_id
      FROM period_views
      GROUP BY session_id
    ),
    last_hits AS (
      SELECT session_id, MAX(id) AS last_id
      FROM period_views
      GROUP BY session_id
    )
    SELECT
      COUNT(*) AS pv,
      COUNT(DISTINCT pv.session_id) AS uv,
      COALESCE(AVG(CASE WHEN pv.duration_ms > 0 THEN pv.duration_ms END), 0) AS avg_dur,
      SUM(CASE WHEN pv.id = fh.first_id THEN 1 ELSE 0 END) AS landings,
      SUM(CASE WHEN pv.id = lh.last_id THEN 1 ELSE 0 END) AS exits
    FROM period_views pv
    LEFT JOIN first_hits fh ON fh.session_id = pv.session_id
    LEFT JOIN last_hits lh ON lh.session_id = pv.session_id
    WHERE pv.page_path = ?
  `).get(path) as {
    pv: number;
    uv: number;
    avg_dur: number;
    landings: number;
    exits: number;
  };

  const pv = row?.pv ?? 0;
  const exits = row?.exits ?? 0;

  return {
    path,
    pv,
    uv: row?.uv ?? 0,
    avgDurationSec: Math.round((row?.avg_dur ?? 0) / 1000),
    landingSessions: row?.landings ?? 0,
    exitSessions: exits,
    exitRate: pv > 0 ? Math.round((exits / pv) * 100) : 0,
  };
}

/* ─────────────────────────────────────────────────────────────
   O. IAP 실전 검수
   ─────────────────────────────────────────────────────────── */

export type IapFlowAudit = {
  readiness: {
    appleConfigured: boolean;
    googleConfigured: boolean;
    googleRtdnConfigured: boolean;
    appUrlConfigured: boolean;
  };
  recentAppleReceipts: number;
  recentGoogleReceipts: number;
  recentSubscriptionUsers: number;
  linkedActiveVipUsers: number;
  mismatchUsers: number;
  pendingProcessing: number;
  avgProcessDelaySec: number;
  latestAppleEventAt: string | null;
  latestGoogleEventAt: string | null;
};

export function getIapFlowAudit(): IapFlowAudit {
  const appleConfigured = Boolean(
    process.env.APPLE_ISSUER_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY && process.env.APPLE_BUNDLE_ID,
  );
  const googleConfigured = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_PACKAGE_NAME,
  );
  const googleRtdnConfigured = Boolean(process.env.GOOGLE_RTDN_SECRET);
  const appUrlConfigured = Boolean(process.env.NEXT_PUBLIC_APP_URL);

  const recentAppleReceipts = (db.prepare(`
    SELECT COUNT(*) AS c
    FROM iap_receipts
    WHERE platform = 'apple'
      AND datetime(COALESCE(processed_at, purchase_date)) >= datetime('now', '-7 days')
  `).get() as { c: number }).c;

  const recentGoogleReceipts = (db.prepare(`
    SELECT COUNT(*) AS c
    FROM iap_receipts
    WHERE platform = 'google'
      AND datetime(COALESCE(processed_at, purchase_date)) >= datetime('now', '-7 days')
  `).get() as { c: number }).c;

  const recentSubscriptionUsers = (db.prepare(`
    SELECT COUNT(DISTINCT user_id) AS c
    FROM iap_receipts
    WHERE platform IN ('apple', 'google')
      AND status = 'valid'
      AND sku_id IN ('vip_monthly', 'vip_yearly')
      AND datetime(COALESCE(processed_at, purchase_date)) >= datetime('now', '-30 days')
  `).get() as { c: number }).c;

  const linkedActiveVipUsers = (db.prepare(`
    SELECT COUNT(DISTINCT r.user_id) AS c
    FROM iap_receipts r
    JOIN entitlements e ON e.user_id = r.user_id
    WHERE r.platform IN ('apple', 'google')
      AND r.status = 'valid'
      AND r.sku_id IN ('vip_monthly', 'vip_yearly')
      AND datetime(COALESCE(r.processed_at, r.purchase_date)) >= datetime('now', '-30 days')
      AND e.is_vip = 1
      AND (
        e.vip_expires_at IS NULL
        OR datetime(e.vip_expires_at) > datetime('now')
        OR (e.vip_grace_until IS NOT NULL AND datetime(e.vip_grace_until) > datetime('now'))
      )
  `).get() as { c: number }).c;

  const pendingProcessing = (db.prepare(`
    SELECT COUNT(*) AS c
    FROM iap_receipts
    WHERE platform IN ('apple', 'google')
      AND processed_at IS NULL
  `).get() as { c: number }).c;

  const avgProcessDelaySec = Math.max(0, Math.round((db.prepare(`
    SELECT COALESCE(AVG((julianday(processed_at) - julianday(purchase_date)) * 86400), 0) AS c
    FROM iap_receipts
    WHERE platform IN ('apple', 'google')
      AND processed_at IS NOT NULL
      AND purchase_date IS NOT NULL
  `).get() as { c: number }).c));

  const latestAppleEventAt = (db.prepare(`
    SELECT MAX(COALESCE(processed_at, purchase_date)) AS v
    FROM iap_receipts
    WHERE platform = 'apple'
  `).get() as { v: string | null }).v;

  const latestGoogleEventAt = (db.prepare(`
    SELECT MAX(COALESCE(processed_at, purchase_date)) AS v
    FROM iap_receipts
    WHERE platform = 'google'
  `).get() as { v: string | null }).v;

  return {
    readiness: {
      appleConfigured,
      googleConfigured,
      googleRtdnConfigured,
      appUrlConfigured,
    },
    recentAppleReceipts,
    recentGoogleReceipts,
    recentSubscriptionUsers,
    linkedActiveVipUsers,
    mismatchUsers: Math.max(0, recentSubscriptionUsers - linkedActiveVipUsers),
    pendingProcessing,
    avgProcessDelaySec,
    latestAppleEventAt,
    latestGoogleEventAt,
  };
}