import { requireAdminAuth } from "@/lib/server/admin-session";
import {
  getVisitSummary,
  getDailySignups,
  getDailyPV,
  getActivityMetrics,
  getPageStats,
  getSignupFunnel,
  getPaymentFunnel,
  getVoidFunnel,
  getCohortRetention,
  getFirstPaymentCohortRetention,
  getFirstVoidCohortRetention,
  getUserSegments,
  getLunaMetrics,
  getQualityMetrics,
  getRevenuePeriodComparison,
  getRecentIapEvents,
  getIapHealthSummary,
  getIapFlowAudit,
  getDwellTimeStats,
  searchTrackedPaths,
  getPathDrilldownSummary,
  getTopPreviousPaths,
  getTopNextPaths,
  getLandingPageConversions,
  getTopExitPages,
  getVipFunnel as getVipConversionFunnel,
  type Period,
} from "@/lib/server/analytics-data";
import { getFriendEventStats } from "@/lib/server/friend-store";
import { getRevenueMetrics, getEntitlementStats } from "@/lib/server/entitlement-store";

/* ── helpers ────────────────────────────────────────────── */
function fmt(n: number) { return n.toLocaleString("ko-KR"); }
function fmtKRW(n: number) { return "\u20a9" + n.toLocaleString("ko-KR"); }
function fmtDate(s: string | null) {
  if (!s) return "\u2014";
  return new Date(s).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function pct(n: number) { return `${n}%`; }
function trendColor(n: number) {
  if (n >= 60) return "#16a34a";
  if (n >= 30) return "#d97706";
  return "#dc2626";
}

function MiniBar({ value, max, color = "#6366f1" }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height: "6px", background: "#f3f4f6", borderRadius: "3px", overflow: "hidden" }}>
      <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: "3px", transition: "width 0.3s" }} />
    </div>
  );
}

function FunnelStep({ label, count, rate, base }: { label: string; count: number; rate: number; base: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.45rem 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "0.78rem", color: "#374151", marginBottom: "0.25rem" }}>{label}</div>
        <MiniBar value={count} max={base} color={trendColor(rate)} />
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#111827" }}>{fmt(count)}</div>
        <div style={{ fontSize: "0.7rem", color: trendColor(rate) }}>{pct(rate)}</div>
      </div>
    </div>
  );
}

function SparkBars({ data, height = 36, color = "#6366f1" }: { data: { value: number }[]; height?: number; color?: string }) {
  if (!data.length) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#d1d5db", fontSize: "0.65rem" }}>{"no data"}</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height }}>
      {data.map((d, i) => (
        <div
          key={i}
          title={`${d.value}`}
          style={{
            flex: 1,
            height: `${Math.max(2, Math.round((d.value / max) * height))}px`,
            background: color,
            borderRadius: "2px",
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}

function RetentionCell({ val }: { val: number }) {
  const bg =
    val === 0   ? "#f9fafb" :
    val >= 50   ? "#dcfce7" :
    val >= 25   ? "#fef9c3" :
                  "#fee2e2";
  const color =
    val === 0   ? "#9ca3af" :
    val >= 50   ? "#15803d" :
    val >= 25   ? "#a16207" :
                  "#dc2626";
  return (
    <td style={{ padding: "0.35rem 0.6rem", textAlign: "center", background: bg, color, fontWeight: 600, fontSize: "0.75rem", borderBottom: "1px solid #e5e7eb" }}>
      {val === 0 ? "\u2014" : `${val}%`}
    </td>
  );
}

function DeltaBadge({ delta, pct: changePct }: { delta: number; pct: number }) {
  if (delta === 0) return null;
  const up      = delta > 0;
  const color   = up ? "#16a34a" : "#dc2626";
  const arrow   = up ? "▲" : "▼";
  const absText = Math.abs(changePct) === 0 ? `${delta > 0 ? "+" : ""}${delta}` : `${arrow} ${Math.abs(changePct)}%`;
  return (
    <span style={{ fontSize: "0.65rem", color, fontWeight: 600, marginLeft: "0.35rem" }}>
      {absText}
    </span>
  );
}

function CardHeader({
  title,
  copy,
  actions,
}: {
  title: string;
  copy?: string;
  actions?: import("react").ReactNode;
}) {
  return (
    <div className="ac-card-head">
      <div>
        <p className="ac-card-title">{title}</p>
        {copy ? <p className="ac-card-copy">{copy}</p> : null}
      </div>
      {actions ? <div className="ac-card-actions">{actions}</div> : null}
    </div>
  );
}

function ChecklistItem({
  label,
  copy,
  tone,
}: {
  label: string;
  copy: string;
  tone: "ok" | "warn" | "fail" | "pending";
}) {
  const badgeClass =
    tone === "ok" ? "ac-badge ac-badge-green" :
    tone === "warn" ? "ac-badge ac-badge-yellow" :
    tone === "pending" ? "ac-badge ac-badge-blue" :
    "ac-badge ac-badge-red";
  const badgeText =
    tone === "ok" ? "정상" :
    tone === "warn" ? "주의" :
    tone === "pending" ? "대기" :
    "확인";

  return (
    <div className="ac-checkitem">
      <div>
        <p className="ac-checklabel">{label}</p>
        <p className="ac-checkcopy">{copy}</p>
      </div>
      <span className={badgeClass}>{badgeText}</span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  sub2,
  color,
}: {
  label: import("react").ReactNode;
  value: string | number;
  sub?: string;
  sub2?: string;
  color?: string;
}) {
  return (
    <div className="ac-card-sm ac-kpi-panel">
      <p className="ac-kpi-label">{label}</p>
      <p className="ac-kpi-value" style={{ fontSize: "1.4rem", color: color ?? "#111827" }}>{typeof value === "number" ? fmt(value) : value}</p>
      {sub && <p className="ac-kpi-sub">{sub}</p>}
      {sub2 && <p className="ac-kpi-sub">{sub2}</p>}
    </div>
  );
}

function RateBadge({ n }: { n: number }) {
  const cls =
    n >= 60 ? "ac-badge ac-badge-green" :
    n >= 30 ? "ac-badge ac-badge-yellow" :
              "ac-badge ac-badge-red";
  return <span className={cls}>{pct(n)}</span>;
}

function RetentionTable({
  title,
  helper,
  rows,
}: {
  title: string;
  helper: string;
  rows: { cohort: string; size: number; w0: number; w1: number; w2: number; w3: number; w4: number }[];
}) {
  return (
    <div className="ac-card" style={{ marginBottom: "1rem" }}>
      <div style={{ marginBottom: "0.6rem" }}>
        <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}>{title}</p>
        <p style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: "#9ca3af" }}>{helper}</p>
      </div>
      <div className="ac-table-wrap">
        <table className="ac-table">
          <thead>
            <tr>
              <th>{"코호트 (주)"}</th><th>{"사용자"}</th>
              <th>{"W0"}</th><th>{"W1"}</th><th>{"W2"}</th><th>{"W3"}</th><th>{"W4"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "#9ca3af", padding: "1.25rem" }}>{"데이터 없음"}</td></tr>
            ) : rows.map((row) => (
              <tr key={`${title}-${row.cohort}`}>
                <td style={{ fontWeight: 500 }}>{row.cohort}</td>
                <td>{fmt(row.size)}</td>
                <RetentionCell val={row.w0} />
                <RetentionCell val={row.w1} />
                <RetentionCell val={row.w2} />
                <RetentionCell val={row.w3} />
                <RetentionCell val={row.w4} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── page ───────────────────────────────────────────────── */
const VALID_PERIODS: Period[] = ["1d","7d","30d","90d","365d"];
const PERIOD_LABELS: Record<Period, string> = {
  "1d":   "\uc624\ub298",
  "7d":   "7\uc77c",
  "30d":  "30\uc77c",
  "90d":  "90\uc77c",
  "365d": "1\ub144",
};

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; path?: string; q?: string }>;
}) {
  await requireAdminAuth();
  const sp     = await searchParams;
  const tab    = sp.tab === "product" ? "product" : "ops";
  const period = (VALID_PERIODS.includes(sp.period as Period) ? sp.period : "30d") as Period;
  const pathQuery = typeof sp.q === "string" ? sp.q.trim() : "";

  /* ── data ── */
  const activity  = getActivityMetrics();
  const visitSum  = getVisitSummary(period);
  const signupFunnel  = getSignupFunnel(period);
  const payFunnel    = getPaymentFunnel(period);
  const voidFunnel   = getVoidFunnel(period);
  const cohort       = getCohortRetention();
  const paymentCohort = getFirstPaymentCohortRetention();
  const voidCohort    = getFirstVoidCohortRetention();
  const segments     = getUserSegments();
  const luna         = getLunaMetrics();
  const quality      = getQualityMetrics();
  const dailySignups = getDailySignups(tab === "ops" ? 30 : 90);
  const dailyPV      = getDailyPV(30);
  const pageStats    = getPageStats(period);
  const friendStats  = getFriendEventStats();
  const revMetrics   = getRevenueMetrics();
  const entStats     = getEntitlementStats();
  const periodCmp    = getRevenuePeriodComparison(period);
  const recentIap    = getRecentIapEvents(15);
  const iapHealth    = getIapHealthSummary();
  const iapAudit     = getIapFlowAudit();
  const dwellStats   = getDwellTimeStats(period);
  const pathResults  = searchTrackedPaths(period, pathQuery, 12);
  const selectedPath = typeof sp.path === "string" && sp.path.length > 0
    ? sp.path
    : (pathResults[0]?.path ?? null);
  const pathSummary  = selectedPath ? getPathDrilldownSummary(period, selectedPath) : null;
  const prevPaths    = selectedPath ? getTopPreviousPaths(period, selectedPath, 3) : [];
  const nextPaths = selectedPath ? getTopNextPaths(period, selectedPath, 3) : [];
  const landingConversions = getLandingPageConversions(period, 10);
  const exitPages = getTopExitPages(period, 10);
  const vipFunnel    = getVipConversionFunnel(period);

  const maxSignup  = Math.max(...dailySignups.map((d) => d.value), 1);
  const totalUsers = luna.totalUsers;
  const qaReadyAll = Object.values(iapAudit.readiness).every(Boolean);
  const qaRecentEventCount = iapAudit.recentAppleReceipts + iapAudit.recentGoogleReceipts;
  const qaVipLinked = iapAudit.recentSubscriptionUsers === 0
    ? "pending"
    : iapAudit.linkedActiveVipUsers === iapAudit.recentSubscriptionUsers
      ? "ok"
      : "warn";
  const vipMixMonthly = vipFunnel.activeVip > 0 ? Math.round((vipFunnel.monthlyVip / vipFunnel.activeVip) * 100) : 0;
  const vipMixYearly = vipFunnel.activeVip > 0 ? Math.round((vipFunnel.yearlyVip / vipFunnel.activeVip) * 100) : 0;
  const topRevenueProduct = [...luna.productConversion].sort((left, right) => right.revenue - left.revenue)[0] ?? null;
  const attachLeaders = [
    { label: "연간 리포트", rate: revMetrics.annualAttachRate },
    { label: "영역 보고서", rate: revMetrics.areaAttachRate },
    { label: "VOID 팩", rate: revMetrics.voidPackAttachRate },
  ].sort((left, right) => right.rate - left.rate);
  const leadingAttach = attachLeaders[0] ?? null;
  const revenueDeltaTone = periodCmp.revenue.delta > 0 ? "ok" : periodCmp.revenue.delta < 0 ? "warn" : "pending";
  const paymentFailureTone = payFunnel.failureRate > 10 ? "fail" : payFunnel.failureRate > 0 ? "warn" : "ok";
  const voidFailureTone = voidFunnel.failureRate > 15 ? "fail" : voidFunnel.failureRate > 0 ? "warn" : "ok";

  /* ── tab link ── */
  function hrefFor({
    nextTab,
    nextPeriod,
    nextPath,
    nextQuery,
  }: {
    nextTab?: string;
    nextPeriod?: Period;
    nextPath?: string | null;
    nextQuery?: string | null;
  }) {
    const params = new URLSearchParams();
    params.set("tab", nextTab ?? tab);
    params.set("period", nextPeriod ?? period);
    const query = nextQuery === undefined ? pathQuery : nextQuery;
    const path = nextPath === undefined ? selectedPath : nextPath;
    if (query && query.trim().length > 0) params.set("q", query.trim());
    if (path && path.trim().length > 0) params.set("path", path.trim());
    return `?${params.toString()}`;
  }
  function tabHref(t: string, p?: Period) {
    return hrefFor({ nextTab: t, nextPeriod: p });
  }
  function periodHref(p: Period) {
    return hrefFor({ nextPeriod: p });
  }
  function pathHref(path: string) {
    return hrefFor({ nextPath: path });
  }

  return (
    <div>
      {/* ── topbar ── */}
      <div className="ac-topbar" style={{ gap: "1rem", flexWrap: "wrap" }}>
        <h1 className="ac-topbar-title">{"분석 콘솔"}</h1>

        {/* tab switcher */}
        <div style={{ display: "flex", gap: "0.25rem", background: "#f3f4f6", borderRadius: "0.375rem", padding: "0.15rem" }}>
          {(["ops","product"] as const).map((t) => (
            <a
              key={t}
              href={tabHref(t)}
              style={{
                padding: "0.3rem 0.75rem",
                fontSize: "0.78rem",
                fontWeight: 500,
                borderRadius: "0.3rem",
                textDecoration: "none",
                background: tab === t ? "#fff" : "transparent",
                color:       tab === t ? "#111827" : "#6b7280",
                boxShadow:   tab === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {t === "ops" ? "\uc6b4\uc601 \ubd84\uc11d" : "\ud504\ub85c\ub355\ud2b8 \ubd84\uc11d"}
            </a>
          ))}
        </div>

        {/* period filter */}
        <div style={{ display: "flex", gap: "0.2rem", marginLeft: "auto" }}>
          {VALID_PERIODS.map((p) => (
            <a
              key={p}
              href={periodHref(p)}
              style={{
                padding: "0.28rem 0.6rem",
                fontSize: "0.73rem",
                borderRadius: "0.3rem",
                textDecoration: "none",
                background: period === p ? "#111827" : "#f3f4f6",
                color:       period === p ? "#fff"     : "#6b7280",
              }}
            >
              {PERIOD_LABELS[p]}
            </a>
          ))}
        </div>
      </div>

      <div className="ac-page">

        {tab === "ops" ? (
          <>
            <div className="ac-shell-grid" style={{ marginBottom: "1.25rem" }}>
              <div>
                <p className="ac-section-title">{"방문 · 활성"}</p>
                <div className="ac-kpi-grid">
                  <KpiCard
                    label={"\ub2e4\uc6b0 (DAU)"}
                    value={activity.dau}
                    sub={activity.fromTracking ? "\uc2e4\uc81c \uc0ac\uc6a9\uc790" : "\ud65c\ub3d9\uc790 \ucd94\uc815"}
                  />
                  <KpiCard
                    label={"WAU"}
                    value={activity.wau}
                    sub={"7\uc77c \ud65c\uc131"}
                  />
                  <KpiCard
                    label={"MAU"}
                    value={activity.mau}
                    sub={"30\uc77c \ud65c\uc131"}
                  />
                  <KpiCard
                    label={"Stickiness"}
                    value={`${activity.stickiness}%`}
                    sub={"DAU / MAU"}
                    color={trendColor(activity.stickiness)}
                  />
                  {visitSum.hasData && (
                    <>
                      <KpiCard label={"UV"} value={visitSum.uniqueSessions} sub={PERIOD_LABELS[period]} />
                      <KpiCard label={"PV"} value={visitSum.totalPV} sub={PERIOD_LABELS[period]} />
                      <KpiCard label={"로그인 PV"} value={visitSum.uniqueUsers} sub={PERIOD_LABELS[period]} />
                    </>
                  )}
                </div>

                {!activity.fromTracking && (
                  <div style={{ marginBottom: "1.25rem", padding: "0.75rem 1rem", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "0.5rem", fontSize: "0.78rem", color: "#92400e" }}>
                    {"page_views 수집 범위가 아직 좁습니다. TrackPageView가 늘어날수록 콘솔의 해상도가 올라갑니다."}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
                  <div className="ac-card">
                    <CardHeader
                      title={"일별 신규 가입 (30일)"}
                      actions={<span style={{ fontSize: "0.68rem", color: "#9ca3af" }}>{"최대 "}{fmt(maxSignup)}{"명"}</span>}
                    />
                    <SparkBars data={dailySignups} height={52} color="#6366f1" />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.35rem", fontSize: "0.65rem", color: "#9ca3af" }}>
                      <span>{dailySignups[0]?.date?.slice(5) ?? ""}</span>
                      <span>{dailySignups[dailySignups.length - 1]?.date?.slice(5) ?? ""}</span>
                    </div>
                  </div>

                  <div className="ac-card">
                    <CardHeader title={"일별 PV (30일)"} />
                    {dailyPV.length > 0
                      ? <SparkBars data={dailyPV} height={52} color="#8b5cf6" />
                      : <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", color: "#9ca3af" }}>{"수집 중 — "}<a href="/admin/system" style={{ color: "#6366f1" }}>{"TrackPageView 연동 필요"}</a></div>
                    }
                  </div>
                </div>
              </div>

              <aside className="ac-rail-stack">
                <div className="ac-card">
                  <CardHeader
                    title={"IAP QA 체크리스트"}
                    copy={"recent events, mismatch 0, pending 0, VIP linkage, 그리고 구매 후 1분 내 반영 여부를 보는 운영 기준입니다."}
                  />
                  <div className="ac-checklist">
                    <ChecklistItem
                      label={"최근 IAP 이벤트 확인"}
                      copy={`최근 7일 Apple ${fmt(iapAudit.recentAppleReceipts)}건 · Google ${fmt(iapAudit.recentGoogleReceipts)}건`}
                      tone={qaRecentEventCount > 0 ? "ok" : "pending"}
                    />
                    <ChecklistItem
                      label={"mismatch 0"}
                      copy={`receipt 대비 entitlement 불일치 ${fmt(iapAudit.mismatchUsers)}명`}
                      tone={iapAudit.mismatchUsers === 0 ? "ok" : "fail"}
                    />
                    <ChecklistItem
                      label={"pending 0"}
                      copy={`미처리 receipt ${fmt(iapAudit.pendingProcessing)}건`}
                      tone={iapAudit.pendingProcessing === 0 ? "ok" : "fail"}
                    />
                    <ChecklistItem
                      label={"VIP 연결 정상"}
                      copy={`최근 30일 구독 유저 ${fmt(iapAudit.recentSubscriptionUsers)}명 중 ${fmt(iapAudit.linkedActiveVipUsers)}명 연결`}
                      tone={qaVipLinked}
                    />
                    <ChecklistItem
                      label={"운영 자격 설정"}
                      copy={`Apple · Google · RTDN · APP_URL ${qaReadyAll ? "준비" : "일부 미설정"}`}
                      tone={qaReadyAll ? "ok" : "warn"}
                    />
                  </div>
                  <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #f3f4f6", fontSize: "0.7rem", lineHeight: 1.55, color: "#6b7280" }}>
                    <div>{"Apple 마지막 이벤트: "}{fmtDate(iapAudit.latestAppleEventAt)}</div>
                    <div>{"Google 마지막 이벤트: "}{fmtDate(iapAudit.latestGoogleEventAt)}</div>
                    <div>{"평균 처리 지연: "}{fmt(iapAudit.avgProcessDelaySec)}{"초"}</div>
                    <div>{"합격선: recent event 정상 기록, mismatch 0, pending 0, 1분 내 상태 반영"}</div>
                  </div>
                </div>

                <div className="ac-card">
                  <CardHeader
                    title={"경로 drill-down"}
                    copy={"칩 대신 검색으로 경로를 찾고, 선택 페이지의 유입/다음 이동을 바로 읽습니다."}
                    actions={selectedPath ? <a href={hrefFor({ nextPath: null, nextQuery: "" })} className="ac-btn ac-btn-secondary">{"초기화"}</a> : null}
                  />
                  <form method="GET" className="ac-search-form" style={{ marginBottom: "0.75rem" }}>
                    <input type="hidden" name="tab" value={tab} />
                    <input type="hidden" name="period" value={period} />
                    <input className="ac-input ac-mono" type="search" name="q" defaultValue={pathQuery} placeholder={"/home, /shop, /admin/..."} />
                    <button type="submit" className="ac-btn">{"검색"}</button>
                  </form>

                  {selectedPath && pathSummary ? (
                    <div style={{ marginBottom: "0.85rem", padding: "0.75rem", background: "#f9fafb", borderRadius: "0.5rem" }}>
                      <div className="ac-mono" style={{ fontSize: "0.78rem", color: "#111827", marginBottom: "0.5rem" }}>{selectedPath}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
                        <div>
                          <div style={{ fontSize: "0.66rem", color: "#9ca3af" }}>{"PV / UV"}</div>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#111827" }}>{fmt(pathSummary.pv)} / {fmt(pathSummary.uv)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.66rem", color: "#9ca3af" }}>{"평균 체류"}</div>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#111827" }}>{pathSummary.avgDurationSec > 0 ? `${pathSummary.avgDurationSec}초` : "—"}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.66rem", color: "#9ca3af" }}>{"랜딩 세션"}</div>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#111827" }}>{fmt(pathSummary.landingSessions)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.66rem", color: "#9ca3af" }}>{"이탈률"}</div>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: pathSummary.exitRate > 60 ? "#dc2626" : pathSummary.exitRate > 30 ? "#d97706" : "#15803d" }}>{pct(pathSummary.exitRate)}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="ac-table-wrap" style={{ marginBottom: "0.75rem" }}>
                    <table className="ac-table">
                      <thead><tr><th>{"검색 결과"}</th><th>{"PV"}</th><th>{"선택"}</th></tr></thead>
                      <tbody>
                        {pathResults.length === 0 ? (
                          <tr><td colSpan={3} style={{ textAlign: "center", color: "#9ca3af", padding: "1rem" }}>{"검색 결과 없음"}</td></tr>
                        ) : pathResults.map((row) => (
                          <tr key={row.path}>
                            <td className="ac-mono" style={{ fontSize: "0.72rem" }}>{row.path}</td>
                            <td>{fmt(row.pv)}</td>
                            <td><a href={pathHref(row.path)} style={{ color: "#111827", fontSize: "0.72rem", fontWeight: 600, textDecoration: "none" }}>{"열기"}</a></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ fontSize: "0.72rem", color: "#9ca3af", lineHeight: 1.5 }}>
                    {"실기기 샌드박스 결제 최종 검수는 로컬로 대체할 수 없습니다. 실제 디바이스 구매 직후 recent events, mismatch 0, pending 0, VIP linkage, 그리고 1분 내 상태 반영을 확인해야 합니다."}
                  </div>
                </div>
              </aside>
            </div>

            {/* 페이지별 현황 */}
            {visitSum.hasData && (
              <>
                <p className="ac-section-title">{"페이지 분석 · "}{PERIOD_LABELS[period]}</p>
                <div className="ac-card" style={{ marginBottom: "1.25rem" }}>
                  <div className="ac-table-wrap">
                    <table className="ac-table">
                      <thead>
                        <tr>
                          <th>{"경로"}</th><th>{"PV"}</th><th>{"UV"}</th><th>{"평균 체류"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageStats.map((ps) => (
                          <tr key={ps.path}>
                            <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{ps.path}</td>
                            <td>{fmt(ps.pv)}</td>
                            <td>{fmt(ps.uv)}</td>
                            <td>{ps.avgDurationSec > 0 ? `${ps.avgDurationSec}초` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* 세그먼트 */}
            <p className="ac-section-title">{"사용자 세그먼트"}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.6rem", marginBottom: "1.25rem" }}>
              {segments.map((seg) => (
                <div key={seg.label} className="ac-card-sm">
                  <p className="ac-kpi-label">{seg.label}</p>
                  <p className="ac-kpi-value" style={{ fontSize: "1.35rem", color: seg.color }}>{fmt(seg.count)}</p>
                  <p className="ac-kpi-sub" style={{ color: seg.color }}>{pct(seg.pct)}</p>
                </div>
              ))}
            </div>

            {/* 품질/운영 */}
            <p className="ac-section-title">{"품질 · 운영"}</p>
            <div className="ac-kpi-grid-3" style={{ marginBottom: "1.25rem" }}>
              <KpiCard
                label={"\uacb0\uc81c \uc2e4\ud328\uc728"}
                value={`${quality.paymentFailureRate}%`}
                color={quality.paymentFailureRate > 10 ? "#dc2626" : "#111827"}
                sub={quality.paymentFailureRate > 10 ? "\u26a0\ufe0f \uc694 \ud655\uc778" : "\uc815\uc0c1"}
              />
              <KpiCard
                label={"Void \uc2e4\ud328\uc728"}
                value={`${quality.voidFailureRate}%`}
                color={quality.voidFailureRate > 15 ? "#dc2626" : "#111827"}
                sub={quality.voidStuck > 0 ? `\ucc98\ub9ac \ucc98\ub9ac \uc911 ${quality.voidStuck}\uac74 stuck` : "\uc815\uc0c1"}
              />
              <div className="ac-card-sm">
                <p className="ac-kpi-label">{"Void Stuck"}</p>
                <p className="ac-kpi-value" style={{ fontSize: "1.35rem", color: quality.voidStuck > 0 ? "#dc2626" : "#6b7280" }}>{quality.voidStuck}</p>
                <p className="ac-kpi-sub">{"10\ubd84+ generating"}</p>
              </div>
            </div>

            {/* 최근 결제 실패 */}
            {quality.recentOrderFails.length > 0 && (
              <div className="ac-card" style={{ marginBottom: "1rem" }}>
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", fontWeight: 600, color: "#dc2626" }}>{"최근 결제 실패"}</p>
                <div className="ac-table-wrap">
                  <table className="ac-table">
                    <thead><tr><th>{"시각"}</th><th>{"상품"}</th><th>{"코드"}</th><th>{"메시지"}</th></tr></thead>
                    <tbody>
                      {quality.recentOrderFails.map((e, i) => (
                        <tr key={i}>
                          <td>{fmtDate(e.time)}</td>
                          <td>{e.productId}</td>
                          <td>{e.code ?? "—"}</td>
                          <td style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis" }}>{e.msg ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 최근 Void 실패 */}
            {quality.recentVoidFails.length > 0 && (
              <div className="ac-card">
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", fontWeight: 600, color: "#dc2626" }}>{"최근 Void 실패"}</p>
                <div className="ac-table-wrap">
                  <table className="ac-table">
                    <thead><tr><th>{"시각"}</th><th>{"도메인"}</th><th>{"사용자 ID"}</th></tr></thead>
                    <tbody>
                      {quality.recentVoidFails.map((e, i) => (
                        <tr key={i}>
                          <td>{fmtDate(e.time)}</td>
                          <td>{e.category}</td>
                          <td style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>{e.userId.slice(0, 12)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ===== IAP 구독 건강 ============================== */}
            <p className="ac-section-title" style={{ marginTop: "1.5rem" }}>{"IAP 구독 건강"}</p>
            <div className="ac-kpi-grid" style={{ marginBottom: "1rem" }}>
              <KpiCard
                label={"Grace Period 중"}
                value={iapHealth.gracePeriodNow}
                sub={"만료됐지만 유예 기간"}
                color={iapHealth.gracePeriodNow > 0 ? "#d97706" : "#6b7280"}
              />
              <KpiCard
                label={"만료 (grace 없음)"}
                value={iapHealth.expiredNow}
                sub={"VIP=1 이지만 만료"}
                color={iapHealth.expiredNow > 0 ? "#dc2626" : "#6b7280"}
              />
              <KpiCard
                label={"3일 내 갱신 위험"}
                value={iapHealth.renewalRisk}
                sub={"만료 임박 구독자"}
                color={iapHealth.renewalRisk > 0 ? "#d97706" : "#6b7280"}
              />
              {iapHealth.byPlatform.map((p) => (
                <KpiCard
                  key={p.platform}
                  label={`${p.platform === "apple" ? "Apple" : p.platform === "google" ? "Google" : p.platform} IAP`}
                  value={p.count}
                  sub={"누적 영수증"}
                />
              ))}
            </div>

            {/* IAP 이벤트 로그 */}
            {recentIap.length > 0 && (
              <div className="ac-card" style={{ marginBottom: "1.25rem" }}>
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", fontWeight: 600, color: "#374151" }}>{"최근 IAP 이벤트"}</p>
                <div className="ac-table-wrap">
                  <table className="ac-table">
                    <thead>
                      <tr>
                        <th>{"구입일"}</th><th>{"플랫폼"}</th><th>{"SKU"}</th><th>{"상태"}</th>
                        <th>{"만료일"}</th><th>{"사용자 (앞 8자)"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentIap.map((e, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: "0.72rem" }}>{fmtDate(e.purchaseDate)}</td>
                          <td>
                            <span style={{
                              fontSize: "0.68rem", padding: "0.1rem 0.4rem", borderRadius: "0.25rem",
                              background: e.platform === "apple" ? "#f0f9ff" : "#f0fdf4",
                              color:      e.platform === "apple" ? "#0369a1" : "#15803d",
                            }}>
                              {e.platform}
                            </span>
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>{e.skuId}</td>
                          <td>
                            <span style={{
                              fontSize: "0.68rem", padding: "0.1rem 0.4rem", borderRadius: "0.25rem",
                              background: e.status === "valid" ? "#dcfce7" : "#fee2e2",
                              color:      e.status === "valid" ? "#15803d" : "#dc2626",
                            }}>
                              {e.status}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.72rem" }}>{fmtDate(e.expiresDate)}</td>
                          <td style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "#9ca3af" }}>{e.userId.slice(0, 8)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(selectedPath || landingConversions.length > 0 || exitPages.length > 0) && (
              <>
                <p className="ac-section-title">{"경로 분석 · "}{PERIOD_LABELS[period]}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div className="ac-card">
                    <CardHeader
                      title={"선택 페이지 흐름"}
                      copy={selectedPath ? `${selectedPath} 기준 유입 / 다음 이동 Top 3` : "오른쪽 drill-down 카드에서 페이지를 선택하세요."}
                    />
                    {selectedPath ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                        <div>
                          <div style={{ fontSize: "0.7rem", color: "#6b7280", marginBottom: "0.5rem" }}>{"유입 Top 3"}</div>
                          {prevPaths.length === 0 ? (
                            <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>{"유입 데이터 없음"}</div>
                          ) : prevPaths.map((row) => (
                            <div key={`prev-${selectedPath}-${row.path}`} style={{ marginBottom: "0.55rem" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.2rem" }}>
                                <span className="ac-mono" style={{ fontSize: "0.72rem", color: "#374151" }}>{row.path}</span>
                                <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>{fmt(row.count)} · {pct(row.rate)}</span>
                              </div>
                              <MiniBar value={row.count} max={prevPaths[0]?.count ?? 1} color="#7c3aed" />
                            </div>
                          ))}
                        </div>
                        <div>
                          <div style={{ fontSize: "0.7rem", color: "#6b7280", marginBottom: "0.5rem" }}>{"다음 이동 Top 3"}</div>
                          {nextPaths.length === 0 ? (
                            <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>{"다음 이동 데이터 없음"}</div>
                          ) : nextPaths.map((row) => (
                            <div key={`${selectedPath}-${row.path}`} style={{ marginBottom: "0.55rem" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.2rem" }}>
                                <span className="ac-mono" style={{ fontSize: "0.72rem", color: "#374151" }}>{row.path}</span>
                                <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>{fmt(row.count)} · {pct(row.rate)}</span>
                              </div>
                              <MiniBar value={row.count} max={nextPaths[0]?.count ?? 1} color="#0f766e" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>{"분석 가능한 경로가 아직 없습니다."}</div>
                    )}
                  </div>

                  <div className="ac-card">
                    <CardHeader title={"이탈 페이지 Top"} copy={"세션 마지막 페이지 기준"} />
                    <div className="ac-table-wrap">
                      <table className="ac-table">
                        <thead><tr><th>{"경로"}</th><th>{"이탈"}</th><th>{"이탈률"}</th></tr></thead>
                        <tbody>
                          {exitPages.length === 0 ? (
                            <tr><td colSpan={3} style={{ textAlign: "center", color: "#9ca3af", padding: "1rem" }}>{"데이터 없음"}</td></tr>
                          ) : exitPages.map((row) => (
                            <tr key={row.path}>
                              <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{row.path}</td>
                              <td>{fmt(row.exits)}</td>
                              <td><RateBadge n={row.exitRate} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="ac-card" style={{ marginBottom: "1.25rem" }}>
                  <CardHeader title={"랜딩 페이지별 전환"} copy={"세션 첫 진입 경로 기준 · 인증 / 홈 진입 / 결제 진입률"} />
                  <div className="ac-table-wrap">
                    <table className="ac-table">
                      <thead><tr><th>{"랜딩"}</th><th>{"세션"}</th><th>{"인증 전환"}</th><th>{"홈 진입"}</th><th>{"결제 진입"}</th></tr></thead>
                      <tbody>
                        {landingConversions.length === 0 ? (
                          <tr><td colSpan={5} style={{ textAlign: "center", color: "#9ca3af", padding: "1rem" }}>{"데이터 없음"}</td></tr>
                        ) : landingConversions.map((row) => (
                          <tr key={row.path}>
                            <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{row.path}</td>
                            <td>{fmt(row.sessions)}</td>
                            <td>{fmt(row.authSessions)} <span style={{ color: "#9ca3af" }}>({pct(row.authRate)})</span></td>
                            <td>{fmt(row.homeSessions)} <span style={{ color: "#9ca3af" }}>({pct(row.homeRate)})</span></td>
                            <td>{fmt(row.checkoutSessions)} <span style={{ color: "#9ca3af" }}>({pct(row.checkoutRate)})</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* 체류시간 상위 페이지 */}
            {dwellStats.length > 0 && (
              <>
                <p className="ac-section-title">{"체류 시간 분석 · "}{PERIOD_LABELS[period]}</p>
                <div className="ac-card" style={{ marginBottom: "1.25rem" }}>
                  <div className="ac-table-wrap">
                    <table className="ac-table">
                      <thead>
                        <tr>
                          <th>{"경로"}</th><th>{"PV"}</th><th>{"UV"}</th>
                          <th>{"평균 체류(초)"}</th><th>{"이탈률"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dwellStats.map((ds) => (
                          <tr key={ds.path}>
                            <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{ds.path}</td>
                            <td>{fmt(ds.pv)}</td>
                            <td>{fmt(ds.uv)}</td>
                            <td style={{ color: ds.avgSec > 60 ? "#16a34a" : ds.avgSec > 20 ? "#d97706" : "#6b7280" }}>
                              {ds.avgSec > 0 ? `${ds.avgSec}s` : "—"}
                            </td>
                            <td>
                              <span style={{
                                fontSize: "0.7rem", color: ds.bounceRate > 60 ? "#dc2626" : ds.bounceRate > 30 ? "#d97706" : "#16a34a",
                              }}>
                                {ds.bounceRate > 0 ? `${ds.bounceRate}%` : "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ===== 친구 네트워크 ============================== */}
            <p className="ac-section-title" style={{ marginTop: "1.5rem" }}>{"친구 네트워크"}</p>
            <div className="ac-kpi-grid-3" style={{ marginBottom: "1.25rem" }}>
              <KpiCard
                label={"연락처 스캔"}
                value={friendStats.contactScans}
                sub={"누적 실행 횟수"}
              />
              <KpiCard
                label={"매칭 성공률"}
                value={`${friendStats.matchRate}%`}
                sub={"스캔 대비 회원 발견"}
                color={trendColor(friendStats.matchRate)}
              />
              <KpiCard
                label={"친구 추가율"}
                value={`${friendStats.addRate}%`}
                sub={"발견 대비 요청 전송"}
                color={trendColor(friendStats.addRate)}
              />
              <KpiCard
                label={"친구 관계"}
                value={friendStats.friendships}
                sub={"누적 수락 완료"}
              />
              <KpiCard
                label={"에로스 파트너"}
                value={friendStats.erosFriendships}
                sub={"eros 타입"}
              />
              <KpiCard
                label={"초대 발송"}
                value={friendStats.invitesSent}
                sub={"미가입 연락처 초대"}
              />
            </div>
          </>

        ) : (
          <>
            <div className="ac-shell-grid" style={{ marginBottom: "1.25rem" }}>
              <div>
                <p className="ac-section-title">{"수익 · 구독"}</p>
                <div className="ac-kpi-grid" style={{ marginBottom: "1.25rem" }}>
                  <KpiCard label={"총 매출"} value={fmtKRW(revMetrics.totalRevenue)} sub={"누적"} />
                  <KpiCard
                    label={<>{"이번 달 매출"}<DeltaBadge delta={periodCmp.revenue.delta} pct={periodCmp.revenue.changePct} /></>}
                    value={fmtKRW(revMetrics.revenueThisMonth)}
                    sub={`${PERIOD_LABELS[period]} · 전기 ${fmtKRW(periodCmp.revenue.previous)}`}
                  />
                  <KpiCard label={"ARPPU"} value={fmtKRW(revMetrics.arppu)} sub={"유료자 1인 평균"} />
                  <KpiCard
                    label={<>{"VIP 전환율"}<DeltaBadge delta={periodCmp.newUsers.delta} pct={periodCmp.newUsers.changePct} /></>}
                    value={`${revMetrics.vipConversion}%`}
                    sub={`${fmt(entStats.totalVip)}명 구독`}
                    color={trendColor(revMetrics.vipConversion)}
                  />
                  <KpiCard label={"VIP 건수"} value={entStats.totalVip} sub={`월${entStats.vipMonthly} / 연${entStats.vipYearly}`} />
                  <KpiCard
                    label={"이탈률"}
                    value={`${revMetrics.subscriberChurn}%`}
                    sub={"만료자 비율"}
                    color={revMetrics.subscriberChurn > 20 ? "#dc2626" : "#111827"}
                  />
                </div>

                <p className="ac-section-title">{"Attach · 비교"}</p>
                <div className="ac-kpi-grid-3" style={{ marginBottom: "1.25rem" }}>
                  <KpiCard label={"연간 리포트 attach"} value={`${revMetrics.annualAttachRate}%`} sub={`${fmt(entStats.annualReportOwners)}명`} color={trendColor(revMetrics.annualAttachRate)} />
                  <KpiCard label={"영역 보고서 attach"} value={`${revMetrics.areaAttachRate}%`} sub={`${fmt(entStats.areaReadingOwners)}명`} color={trendColor(revMetrics.areaAttachRate)} />
                  <KpiCard label={"VOID 팩 attach"} value={`${revMetrics.voidPackAttachRate}%`} sub={`${fmt(entStats.voidPackBuyers)}명`} color={trendColor(revMetrics.voidPackAttachRate)} />
                </div>
              </div>

              <aside className="ac-rail-stack">
                <div className="ac-card">
                  <CardHeader
                    title={"Product Reading Order"}
                    copy={"운영자가 5초 안에 읽어야 하는 핵심만 오른쪽에 고정합니다."}
                  />
                  <div className="ac-checklist">
                    <ChecklistItem
                      label={"매출 비교"}
                      copy={`${PERIOD_LABELS[period]} 대비 전기 ${fmtKRW(periodCmp.revenue.previous)} / 변화 ${periodCmp.revenue.delta >= 0 ? "+" : ""}${fmtKRW(periodCmp.revenue.delta)}`}
                      tone={revenueDeltaTone}
                    />
                    <ChecklistItem
                      label={"attach leader"}
                      copy={leadingAttach ? `${leadingAttach.label} ${leadingAttach.rate}%로 최고` : "attach 데이터 없음"}
                      tone={leadingAttach && leadingAttach.rate >= 30 ? "ok" : "warn"}
                    />
                    <ChecklistItem
                      label={"상위 매출 상품"}
                      copy={topRevenueProduct ? `${topRevenueProduct.label} · ${fmtKRW(topRevenueProduct.revenue)} · 전환 ${topRevenueProduct.rate}%` : "상품 데이터 없음"}
                      tone={topRevenueProduct ? "ok" : "pending"}
                    />
                    <ChecklistItem
                      label={"VIP mix"}
                      copy={`월 ${vipMixMonthly}% · 연 ${vipMixYearly}% · 활성 ${fmt(vipFunnel.activeVip)}명`}
                      tone={vipFunnel.activeVip > 0 ? "ok" : "pending"}
                    />
                    <ChecklistItem
                      label={"결제 실패율"}
                      copy={`주문 ${fmt(payFunnel.created)}건 중 실패 ${payFunnel.failureRate}%`}
                      tone={paymentFailureTone}
                    />
                    <ChecklistItem
                      label={"Void 실패율"}
                      copy={`시작 ${fmt(voidFunnel.started)}건 중 실패 ${voidFunnel.failureRate}%`}
                      tone={voidFailureTone}
                    />
                  </div>
                </div>

                <div className="ac-card">
                  <CardHeader
                    title={"실기기 샌드박스 로그"}
                    copy={"실제 디바이스 결제 후 ops 탭 QA 체크리스트 기준으로 recent events, mismatch 0, pending 0, VIP linkage를 기록합니다."}
                  />
                  <div className="ac-checklist">
                    <ChecklistItem label={"recent events"} copy={"iPhone / Android 각각 샌드박스 구매 직후 recent events 증가 확인"} tone={"pending"} />
                    <ChecklistItem label={"mismatch 0"} copy={"receipt 대비 entitlement mismatch 0 캡처"} tone={"pending"} />
                    <ChecklistItem label={"pending 0"} copy={"미처리 receipt 0 캡처"} tone={"pending"} />
                    <ChecklistItem label={"VIP linkage"} copy={"VIP linkage 정상, shop/status/me/badge/voidCredits 동기화 확인"} tone={"pending"} />
                  </div>
                  <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #f3f4f6", fontSize: "0.7rem", color: "#6b7280" }}>
                    <div>{"합격선: 1분 내 상태 반영, 사용자 화면과 admin ops 탭이 같은 진실을 보여줄 것"}</div>
                    <span className="ac-mono">{"docs/admin-iap-sandbox-qa-log.md"}</span>
                  </div>
                </div>
              </aside>
            </div>

            <p className="ac-section-title">{"퍼널 분석 · "}{PERIOD_LABELS[period]}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <div className="ac-card">
                <CardHeader title={"가입 퍼널"} copy={"가입 → 출생정보 → 별 지도 → 첫 Void → 첫 결제"} />
                {signupFunnel.map((step) => (
                  <FunnelStep
                    key={step.label}
                    label={step.label}
                    count={step.count}
                    rate={step.rate}
                    base={signupFunnel[0]?.count ?? 1}
                  />
                ))}
              </div>

              <div className="ac-card">
                <CardHeader title={"결제 퍼널"} copy={"주문 생성 이후 paid / failed 분기"} />
                <FunnelStep label={"주문 생성"} count={payFunnel.created} rate={100} base={payFunnel.created} />
                <FunnelStep label={"결제 완료"} count={payFunnel.paid} rate={payFunnel.conversionRate} base={payFunnel.created} />
                <FunnelStep label={"결제 실패"} count={payFunnel.failed} rate={payFunnel.failureRate} base={payFunnel.created} />
                <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                  <div>
                    <div style={{ fontSize: "0.65rem", color: "#6b7280" }}>{"전환율"}</div>
                    <RateBadge n={payFunnel.conversionRate} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.65rem", color: "#6b7280" }}>{"실패율"}</div>
                    <span className={payFunnel.failureRate > 10 ? "ac-badge ac-badge-red" : "ac-badge ac-badge-gray"}>{pct(payFunnel.failureRate)}</span>
                  </div>
                </div>
              </div>

              <div className="ac-card">
                <CardHeader title={"Void 퍼널"} copy={"시작 이후 generating / complete / failed 흐름"} />
                <FunnelStep label={"시작"} count={voidFunnel.started} rate={100} base={voidFunnel.started} />
                <FunnelStep label={"생성 중"} count={voidFunnel.generating} rate={voidFunnel.started > 0 ? Math.round(voidFunnel.generating / voidFunnel.started * 100) : 0} base={voidFunnel.started} />
                <FunnelStep label={"완료"} count={voidFunnel.completed} rate={voidFunnel.completionRate} base={voidFunnel.started} />
                <FunnelStep label={"실패"} count={voidFunnel.failed} rate={voidFunnel.failureRate} base={voidFunnel.started} />
                <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                  <div>
                    <div style={{ fontSize: "0.65rem", color: "#6b7280" }}>{"완료율"}</div>
                    <RateBadge n={voidFunnel.completionRate} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.65rem", color: "#6b7280" }}>{"실패율"}</div>
                    <span className={voidFunnel.failureRate > 15 ? "ac-badge ac-badge-red" : "ac-badge ac-badge-gray"}>{pct(voidFunnel.failureRate)}</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="ac-section-title">{"전환 · 상품"}</p>
            <div className="ac-kpi-grid-3" style={{ marginBottom: "1.25rem" }}>
              <KpiCard
                label={"출생정보 완료율"}
                value={pct(luna.profileCompletionRate)}
                sub={`${fmt(luna.profileCompleted)} / ${fmt(luna.totalUsers)}명`}
                color={trendColor(luna.profileCompletionRate)}
              />
              <KpiCard
                label={"생시 입력률"}
                value={pct(luna.birthTimeRate)}
                sub={"입력 완료자 기준"}
                color={trendColor(luna.birthTimeRate)}
              />
              <KpiCard
                label={"별 지도 생성률"}
                value={pct(luna.chartRate)}
                sub={`${fmt(luna.chartGenerated)}명`}
                color={trendColor(luna.chartRate)}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <div className="ac-card">
                <CardHeader title={"상품별 전환율"} copy={"created → paid → revenue를 같은 표에서 읽습니다."} />
                <div className="ac-table-wrap">
                  <table className="ac-table">
                    <thead><tr><th>{"상품"}</th><th>{"생성"}</th><th>{"완료"}</th><th>{"전환"}</th><th>{"매출"}</th></tr></thead>
                    <tbody>
                      {luna.productConversion.map((p) => (
                        <tr key={p.productId}>
                          <td>{p.label}</td>
                          <td>{fmt(p.created)}</td>
                          <td>{fmt(p.paid)}</td>
                          <td><RateBadge n={p.rate} /></td>
                          <td>{fmtKRW(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="ac-card">
                <CardHeader title={"도메인별 Void 사용"} copy={"카테고리 분포는 제품 수요 맥락을 보는 보조 지표입니다."} />
                {luna.voidByDomain.map((d) => (
                  <div key={d.domain} style={{ marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.2rem" }}>
                      <span style={{ color: "#374151" }}>{d.label}</span>
                      <span style={{ color: "#6b7280" }}>{fmt(d.count)} <span style={{ color: "#9ca3af" }}>({pct(d.pct)})</span></span>
                    </div>
                    <MiniBar value={d.count} max={luna.voidByDomain[0]?.count ?? 1} color="#8b5cf6" />
                  </div>
                ))}
                {luna.voidByDomain.length === 0 && <div style={{ color: "#9ca3af", fontSize: "0.78rem" }}>{"데이터 없음"}</div>}
              </div>
            </div>

            <p className="ac-section-title">{"VIP 전환 · 구성"}</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <div className="ac-card">
                <CardHeader title={"가입 → VIP 전환 흐름"} copy={"가입 이후 VIP까지 이어지는 전환 단계"} />
                <FunnelStep label={"가입 완료"} count={vipFunnel.registered} rate={100} base={vipFunnel.registered} />
                <FunnelStep label={"별 지도 생성"} count={vipFunnel.hasChart} rate={vipFunnel.registered > 0 ? Math.round(vipFunnel.hasChart / vipFunnel.registered * 100) : 0} base={vipFunnel.registered} />
                <FunnelStep label={"Void 사용"} count={vipFunnel.usedVoid} rate={vipFunnel.registered > 0 ? Math.round(vipFunnel.usedVoid / vipFunnel.registered * 100) : 0} base={vipFunnel.registered} />
                <FunnelStep label={"결제 완료"} count={vipFunnel.everPaid} rate={vipFunnel.registered > 0 ? Math.round(vipFunnel.everPaid / vipFunnel.registered * 100) : 0} base={vipFunnel.registered} />
                <FunnelStep label={"VIP 전환 (현재)"} count={vipFunnel.activeVip} rate={vipFunnel.registered > 0 ? Math.round(vipFunnel.activeVip / vipFunnel.registered * 100) : 0} base={vipFunnel.registered} />
              </div>

              <div className="ac-card">
                <CardHeader title={"VIP 플랜 구성"} copy={"월 / 연 구독 mix를 한 카드에서 읽습니다."} />
                <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.68rem", color: "#6b7280", marginBottom: "0.25rem" }}>{"월 구독"}</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#6366f1" }}>{fmt(vipFunnel.monthlyVip)}</div>
                    <div style={{ fontSize: "0.68rem", color: "#9ca3af" }}>{`${vipMixMonthly}%`}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.68rem", color: "#6b7280", marginBottom: "0.25rem" }}>{"연 구독"}</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#8b5cf6" }}>{fmt(vipFunnel.yearlyVip)}</div>
                    <div style={{ fontSize: "0.68rem", color: "#9ca3af" }}>{`${vipMixYearly}%`}</div>
                  </div>
                </div>
                {vipFunnel.activeVip > 0 && (
                  <div style={{ height: "12px", borderRadius: "6px", overflow: "hidden", background: "#f3f4f6", display: "flex" }}>
                    <div style={{ width: `${vipMixMonthly}%`, background: "#6366f1" }} />
                    <div style={{ flex: 1, background: "#8b5cf6" }} />
                  </div>
                )}
              </div>
            </div>

            <p className="ac-section-title">{"리텐션 · 코호트"}</p>
            <RetentionTable title={"가입 주차별 리텐션"} helper={"활동 기준: Void 완료 또는 결제 완료"} rows={cohort} />
            <RetentionTable title={"첫 결제 기준 리텐션"} helper={"첫 결제 시점을 코호트 시작점으로 본 재활성 비율"} rows={paymentCohort} />
            <RetentionTable title={"첫 Void 사용 기준 리텐션"} helper={"첫 Void 완료 이후 다시 돌아온 비율"} rows={voidCohort} />

            <p className="ac-section-title">{"사용자 세그먼트"}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "0.6rem", marginBottom: "0.75rem" }}>
              {segments.map((seg) => (
                <div key={seg.label} className="ac-card-sm ac-kpi-panel">
                  <div>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: seg.color, marginBottom: "0.4rem" }} />
                    <p className="ac-kpi-label">{seg.label}</p>
                    <p className="ac-kpi-value" style={{ fontSize: "1.3rem", color: seg.color }}>{fmt(seg.count)}</p>
                  </div>
                  <div>
                    <div style={{ marginTop: "0.3rem" }}>
                      <MiniBar value={seg.count} max={totalUsers} color={seg.color} />
                    </div>
                    <p className="ac-kpi-sub">{pct(seg.pct)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginBottom: "1.5rem" }}>
              {"고활성: 30일 내 Void 5회+ · 이탈위험: 유료 사용자 중 30일 내 활동 없음"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}