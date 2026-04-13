import type { StoredAuthAccount } from "@/lib/server/auth-storage";
import { listStoredAuthAccounts } from "./auth-account-store";
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

type AuthAnalyticsContext = {
  accounts: StoredAuthAccount[];
};

const PERIOD_DAYS: Record<Period, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export async function getAuthAnalyticsContext(): Promise<AuthAnalyticsContext> {
  return { accounts: await listStoredAuthAccounts() };
}

async function resolveAuthAnalyticsContext(context?: AuthAnalyticsContext) {
  return context ?? getAuthAnalyticsContext();
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getUtcDayStart(daysAgo = 0) {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - daysAgo);
  return start;
}

function getSinceTimestamp(period: Period) {
  return getUtcDayStart(PERIOD_DAYS[period]).getTime();
}

function isTimestampOnOrAfter(value: string | null | undefined, sinceTimestamp: number) {
  const timestamp = parseTimestamp(value);
  return timestamp !== null && timestamp >= sinceTimestamp;
}

function filterAccountsCreatedSince(accounts: StoredAuthAccount[], sinceTimestamp: number) {
  return accounts.filter((account) => isTimestampOnOrAfter(account.createdAt, sinceTimestamp));
}

function countAccountsCreatedSince(accounts: StoredAuthAccount[], sinceTimestamp: number) {
  return filterAccountsCreatedSince(accounts, sinceTimestamp).length;
}

function toDateKey(value: string | null | undefined) {
  const timestamp = parseTimestamp(value);
  if (timestamp === null) {
    return null;
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}

function getDistinctUserIdSet(query: string, params: unknown[] = []) {
  const statement = db.prepare(query);
  const rows = (params.length > 0 ? statement.all(...params) : statement.all()) as Array<{ user_id: string | null }>;
  const userIds = new Set<string>();

  for (const row of rows) {
    if (row.user_id) {
      userIds.add(row.user_id);
    }
  }

  return userIds;
}

function countSetIntersection(left: Set<string>, right: Set<string>) {
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  let count = 0;

  for (const value of smaller) {
    if (larger.has(value)) {
      count += 1;
    }
  }

  return count;
}

function hasProfileBirthDate(account: StoredAuthAccount) {
  return Boolean(account.onboardingProfile?.birthTime?.birthDate);
}

function hasProfileBirthHour(account: StoredAuthAccount) {
  return account.onboardingProfile?.birthTime?.hour != null;
}

function getWeekStartTimestamp(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setUTCDate(start.getUTCDate() + offset);
  return start.getTime();
}

function getCohortWeekLabel(date: Date) {
  const year = date.getUTCFullYear();
  const target = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()));
  const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
  const firstDay = firstDayOfYear.getUTCDay();
  const firstMonday = new Date(firstDayOfYear);
  const daysUntilFirstMonday = firstDay === 1 ? 0 : firstDay === 0 ? 1 : 8 - firstDay;
  firstMonday.setUTCDate(firstMonday.getUTCDate() + daysUntilFirstMonday);

  const weekNumber =
    target < firstMonday ? 0 : Math.floor((getWeekStartTimestamp(target) - getWeekStartTimestamp(firstMonday)) / WEEK_MS) + 1;

  return `${year}-W${String(Math.max(0, weekNumber)).padStart(2, "0")}`;
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

export async function getDailySignups(days: number, context?: AuthAnalyticsContext): Promise<DailyPoint[]> {
  const { accounts } = await resolveAuthAnalyticsContext(context);
  const sinceTimestamp = getUtcDayStart(days).getTime();
  const counts = new Map<string, number>();

  for (const account of accounts) {
    if (!isTimestampOnOrAfter(account.createdAt, sinceTimestamp)) {
      continue;
    }

    const date = toDateKey(account.createdAt);
    if (!date) {
      continue;
    }

    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({ date, value }));
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

export async function getActivityMetrics(context?: AuthAnalyticsContext): Promise<ActivityMetrics> {
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
  const { accounts } = await resolveAuthAnalyticsContext(context);
  const knownUserIds = new Set(accounts.map((account) => account.id));
  const dau = countAccountsCreatedSince(accounts, getUtcDayStart().getTime());

  const wauUserIds = new Set(filterAccountsCreatedSince(accounts, getUtcDayStart(7).getTime()).map((account) => account.id));
  for (const userId of getDistinctUserIdSet("SELECT DISTINCT user_id FROM void_analysis_requests WHERE created_at >= date('now', '-7 days')")) {
    if (knownUserIds.has(userId)) {
      wauUserIds.add(userId);
    }
  }
  for (const userId of getDistinctUserIdSet("SELECT DISTINCT user_id FROM orders WHERE created_at >= date('now', '-7 days')")) {
    if (knownUserIds.has(userId)) {
      wauUserIds.add(userId);
    }
  }

  const mauUserIds = new Set(filterAccountsCreatedSince(accounts, getUtcDayStart(30).getTime()).map((account) => account.id));
  for (const userId of getDistinctUserIdSet("SELECT DISTINCT user_id FROM void_analysis_requests WHERE created_at >= date('now', '-30 days')")) {
    if (knownUserIds.has(userId)) {
      mauUserIds.add(userId);
    }
  }
  for (const userId of getDistinctUserIdSet("SELECT DISTINCT user_id FROM orders WHERE created_at >= date('now', '-30 days')")) {
    if (knownUserIds.has(userId)) {
      mauUserIds.add(userId);
    }
  }

  return {
    dau,
    wau: wauUserIds.size,
    mau: mauUserIds.size,
    stickiness: mauUserIds.size > 0 ? Math.round((dau / mauUserIds.size) * 100) : 0,
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
export async function getSignupFunnel(period: Period, context?: AuthAnalyticsContext): Promise<FunnelStep[]> {
  const { accounts } = await resolveAuthAnalyticsContext(context);
  const signupsSince = getSinceTimestamp(period);
  const signupAccounts = filterAccountsCreatedSince(accounts, signupsSince);
  const signupUserIds = new Set(signupAccounts.map((account) => account.id));
  const signups = signupAccounts.length;
  const profiles = signupAccounts.filter(hasProfileBirthDate).length;
  const charts = countSetIntersection(signupUserIds, getDistinctUserIdSet("SELECT DISTINCT user_id FROM natal_charts"));
  const firstVoid = countSetIntersection(signupUserIds, getDistinctUserIdSet("SELECT DISTINCT user_id FROM void_analysis_requests"));
  const firstPaid = countSetIntersection(signupUserIds, getDistinctUserIdSet("SELECT DISTINCT user_id FROM orders WHERE status = 'paid'"));

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

export async function getCohortRetention(context?: AuthAnalyticsContext): Promise<CohortRow[]> {
  const { accounts } = await resolveAuthAnalyticsContext(context);
  const cohortAccounts = filterAccountsCreatedSince(accounts, getUtcDayStart(70).getTime());
  if (cohortAccounts.length === 0) {
    return [];
  }

  const activityRows = db.prepare(`
    SELECT user_id, created_at AS act_at
    FROM void_analysis_requests WHERE status = 'complete'
    UNION ALL
    SELECT user_id, paid_at AS act_at
    FROM orders WHERE status = 'paid' AND paid_at IS NOT NULL
  `).all() as Array<{ user_id: string | null; act_at: string | null }>;

  const activityByUser = new Map<string, number[]>();
  for (const row of activityRows) {
    if (!row.user_id) {
      continue;
    }

    const activityTimestamp = parseTimestamp(row.act_at);
    if (activityTimestamp === null) {
      continue;
    }

    const existing = activityByUser.get(row.user_id);
    if (existing) {
      existing.push(activityTimestamp);
      continue;
    }

    activityByUser.set(row.user_id, [activityTimestamp]);
  }

  const cohorts = new Map<string, { row: CohortRow; sortTimestamp: number }>();
  for (const account of cohortAccounts) {
    const signedUpTimestamp = parseTimestamp(account.createdAt);
    if (signedUpTimestamp === null) {
      continue;
    }

    const signedUpDate = new Date(signedUpTimestamp);
    const cohort = getCohortWeekLabel(signedUpDate);
    const existing = cohorts.get(cohort) ?? {
      row: { cohort, size: 0, w0: 0, w1: 0, w2: 0, w3: 0, w4: 0 },
      sortTimestamp: getWeekStartTimestamp(signedUpDate),
    };

    existing.row.size += 1;

    const seenWeeks = new Set<number>();
    for (const activityTimestamp of activityByUser.get(account.id) ?? []) {
      if (activityTimestamp < signedUpTimestamp) {
        continue;
      }

      const weekIndex = Math.floor((activityTimestamp - signedUpTimestamp) / WEEK_MS);
      if (weekIndex >= 0 && weekIndex <= 4) {
        seenWeeks.add(weekIndex);
      }
    }

    for (const weekIndex of seenWeeks) {
      if (weekIndex === 0) existing.row.w0 += 1;
      if (weekIndex === 1) existing.row.w1 += 1;
      if (weekIndex === 2) existing.row.w2 += 1;
      if (weekIndex === 3) existing.row.w3 += 1;
      if (weekIndex === 4) existing.row.w4 += 1;
    }

    cohorts.set(cohort, existing);
  }

  return Array.from(cohorts.values())
    .sort((left, right) => right.sortTimestamp - left.sortTimestamp)
    .slice(0, 10)
    .map(({ row }) => ({
      cohort: row.cohort,
      size: row.size,
      w0: row.size > 0 ? Math.round((row.w0 / row.size) * 100) : 0,
      w1: row.size > 0 ? Math.round((row.w1 / row.size) * 100) : 0,
      w2: row.size > 0 ? Math.round((row.w2 / row.size) * 100) : 0,
      w3: row.size > 0 ? Math.round((row.w3 / row.size) * 100) : 0,
      w4: row.size > 0 ? Math.round((row.w4 / row.size) * 100) : 0,
    }));
}

export type UserSegment = { label: string; count: number; pct: number; color: string };

export async function getUserSegments(context?: AuthAnalyticsContext): Promise<UserSegment[]> {
  const { accounts } = await resolveAuthAnalyticsContext(context);
  const total = accounts.length;
  if (total === 0) return [];

  const knownUserIds = new Set(accounts.map((account) => account.id));

  /* subscribed: has paid membership or yearly */
  const subscribedUserIds = getDistinctUserIdSet(
    "SELECT DISTINCT user_id FROM orders WHERE status='paid' AND product_id IN ('membership','yearly')",
  );
  const subscribed = countSetIntersection(knownUserIds, subscribedUserIds);

  /* paid: has any paid order but not membership */
  const paidUserIds = getDistinctUserIdSet("SELECT DISTINCT user_id FROM orders WHERE status='paid'");
  const paid = countSetIntersection(knownUserIds, paidUserIds);

  /* high-active: 5+ void completes in last 30 days */
  const highActiveUserIds = getDistinctUserIdSet(
    "SELECT user_id FROM void_analysis_requests WHERE status='complete' AND created_at >= date('now','-30 days') GROUP BY user_id HAVING COUNT(*) >= 5",
  );
  const highActive = countSetIntersection(knownUserIds, highActiveUserIds);

  /* churn-risk: paid/subscribed but zero activity in last 30 days */
  const recentActivityUserIds = new Set<string>();
  for (const userId of getDistinctUserIdSet("SELECT DISTINCT user_id FROM void_analysis_requests WHERE created_at >= date('now','-30 days')")) {
    recentActivityUserIds.add(userId);
  }
  for (const userId of getDistinctUserIdSet("SELECT DISTINCT user_id FROM orders WHERE created_at >= date('now','-30 days')")) {
    recentActivityUserIds.add(userId);
  }

  let churnRisk = 0;
  for (const userId of paidUserIds) {
    if (knownUserIds.has(userId) && !recentActivityUserIds.has(userId)) {
      churnRisk += 1;
    }
  }

  const free = total - paid;
  const paidOnly = Math.max(0, paid - subscribed);

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

export async function getLunaMetrics(context?: AuthAnalyticsContext): Promise<LunaMetrics> {
  const { accounts } = await resolveAuthAnalyticsContext(context);
  const totalUsers = accounts.length;
  const knownUserIds = new Set(accounts.map((account) => account.id));
  const profileCompleted = accounts.filter(hasProfileBirthDate).length;
  const birthTimeEntered = accounts.filter(hasProfileBirthHour).length;
  const chartGenerated = countSetIntersection(knownUserIds, getDistinctUserIdSet("SELECT DISTINCT user_id FROM natal_charts"));

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
export async function getRevenuePeriodComparison(period: Period, context?: AuthAnalyticsContext): Promise<{
  revenue:  PeriodComparison;
  orders:   PeriodComparison;
  newUsers: PeriodComparison;
  voidCompleted: PeriodComparison;
}> {
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

  const { accounts } = await resolveAuthAnalyticsContext(context);
  const currentStart = getUtcDayStart(d).getTime();
  const previousStart = getUtcDayStart(d * 2).getTime();
  let currentUsers = 0;
  let previousUsers = 0;

  for (const account of accounts) {
    const createdAt = parseTimestamp(account.createdAt);
    if (createdAt === null) {
      continue;
    }

    if (createdAt >= currentStart) {
      currentUsers += 1;
      continue;
    }

    if (createdAt >= previousStart) {
      previousUsers += 1;
    }
  }

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
    newUsers:      cmp(currentUsers, previousUsers),
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

export async function getVipFunnel(period: Period, context?: AuthAnalyticsContext): Promise<VipFunnel> {
  const { accounts } = await resolveAuthAnalyticsContext(context);
  const sinceTimestamp = getSinceTimestamp(period);
  const registeredAccounts = filterAccountsCreatedSince(accounts, sinceTimestamp);
  const registeredUserIds = new Set(registeredAccounts.map((account) => account.id));
  const registered = registeredAccounts.length;
  const hasChart = countSetIntersection(registeredUserIds, getDistinctUserIdSet("SELECT DISTINCT user_id FROM natal_charts"));
  const usedVoid = countSetIntersection(registeredUserIds, getDistinctUserIdSet("SELECT DISTINCT user_id FROM void_analysis_requests"));
  const everPaid = countSetIntersection(registeredUserIds, getDistinctUserIdSet("SELECT DISTINCT user_id FROM orders WHERE status = 'paid'"));

  const now = new Date().toISOString();
  const vipRows = db.prepare(`
    SELECT user_id, vip_source
    FROM entitlements
    WHERE is_vip = 1
      AND (vip_expires_at IS NULL
           OR vip_expires_at > @now
           OR (vip_grace_until IS NOT NULL AND vip_grace_until > @now))
  `).all({ now }) as Array<{ user_id: string | null; vip_source: string | null }>;

  const activeVipUsers = new Set<string>();
  const monthlyVipUsers = new Set<string>();
  const yearlyVipUsers = new Set<string>();
  for (const row of vipRows) {
    if (!row.user_id || !registeredUserIds.has(row.user_id)) {
      continue;
    }

    activeVipUsers.add(row.user_id);
    if (row.vip_source === "vip_monthly") {
      monthlyVipUsers.add(row.user_id);
    }
    if (row.vip_source === "vip_yearly") {
      yearlyVipUsers.add(row.user_id);
    }
  }

  return {
    registered,
    hasChart,
    usedVoid,
    everPaid,
    activeVip: activeVipUsers.size,
    monthlyVip: monthlyVipUsers.size,
    yearlyVip: yearlyVipUsers.size,
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

export async function getServiceSignals(context?: AuthAnalyticsContext): Promise<ServiceSignals> {
  const iapHealth = getIapHealthSummary();

  const voidQueueLen = (db.prepare(
    "SELECT COUNT(*) AS c FROM void_analysis_requests WHERE status='generating' AND created_at <= datetime('now','-10 minutes')"
  ).get() as { c: number }).c;

  const recentRevenue = (db.prepare(
    "SELECT COALESCE(SUM(amount),0) AS s FROM orders WHERE status='paid' AND paid_at >= datetime('now','-1 hour')"
  ).get() as { s: number }).s;

  const { accounts } = await resolveAuthAnalyticsContext(context);
  const newUsersToday = countAccountsCreatedSince(accounts, getUtcDayStart().getTime());

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