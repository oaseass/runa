import { requireAdminAuth } from "@/lib/server/admin-session";
import { getAdminStats } from "@/lib/server/admin-stats";
import type { DailyPoint } from "@/lib/server/admin-stats";

const PRODUCT_LABELS: Record<string, string> = {
  yearly:     "\uc5f0\uac04 \uad6c\ub3c5",
  membership: "\uba64\ubc84\uc2ed",
  area:       "\uc601\uc5ed \ubcf4\uace0\uc11c",
  question:   "\ub2e8\uc77c \uc9c8\ubb38",
};

const CATEGORY_LABELS: Record<string, string> = {
  self:   "\ub098",
  love:   "\uad00\uacc4",
  work:   "\ub8e8\ud2f4\u00b7\uc77c",
  social: "\uc0ac\uace0\u00b7\ud45c\ud604",
};

function fmt(n: number) { return n.toLocaleString("ko-KR"); }
function fmtKRW(n: number) { return "\u20a9" + n.toLocaleString("ko-KR"); }
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

function calcTrend(now: number, prev: number) {
  if (prev === 0) return { cls: "ac-trend-flat", text: "\u2014" };
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct > 0) return { cls: "ac-trend-up",   text: "\u2191" + pct + "%" };
  if (pct < 0) return { cls: "ac-trend-down", text: "\u2193" + Math.abs(pct) + "%" };
  return { cls: "ac-trend-flat", text: "0%" };
}

function Sparkline({ data, color = "#6366f1" }: { data: DailyPoint[]; color?: string }) {
  if (data.length < 2) {
    return (
      <div
        style={{
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#d1d5db",
          fontSize: "0.75rem",
        }}
      >
        {"\ub370\uc774\ud130 \uc5c6\uc74c"}
      </div>
    );
  }
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 32 - ((d.value - min) / range) * 28;
    return [x, y] as [number, number];
  });
  const linePath = pts
    .map(([x, y], i) => (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1))
    .join(" ");
  const areaPath = linePath + " L100,36 L0,36 Z";
  return (
    <svg
      viewBox="0 0 100 36"
      preserveAspectRatio="none"
      width="100%"
      height="56"
      style={{ display: "block" }}
    >
      <path d={areaPath} fill={color} fillOpacity="0.07" />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function AdminDashboard() {
  await requireAdminAuth();
  const s = await getAdminStats();

  const weekTrend  = calcTrend(s.orders.weekRevenue,  s.orders.lastWeekRevenue);
  const monthTrend = calcTrend(s.users.month,          s.users.prevMonth);
  const weekUser   = calcTrend(s.users.week,           s.users.prevWeek);
  const failRate   = s.orders.total > 0
    ? Math.round((s.orders.failed / s.orders.total) * 100)
    : 0;

  const now = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month:  "short",
    day:    "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });

  return (
    <div>
      <div className="ac-topbar">
        <h1 className="ac-topbar-title">{"\ub300\uc2dc\ubcf4\ub4dc"}</h1>
        <span className="ac-topbar-sub">{now} KST</span>
      </div>

      <div className="ac-page">
        <div className="ac-kpi-grid">
          <div className="ac-card">
            <p className="ac-kpi-label">{"\uc804\uccb4 \ud68c\uc6d0"}</p>
            <p className="ac-kpi-value">{fmt(s.users.total)}</p>
            <p className="ac-kpi-sub">
              {"\uc624\ub298 "}<strong>{fmt(s.users.today)}</strong>{"\uba85 \u00b7 \uc5b4\uc81c "}{fmt(s.users.yesterday)}
            </p>
          </div>

          <div className="ac-card">
            <p className="ac-kpi-label">{"\ub204\uc801 \ub9e4\ucd9c"}</p>
            <p className="ac-kpi-value">{fmtKRW(s.orders.totalRevenue)}</p>
            <p className="ac-kpi-sub">
              {"\uc774\ubc88\ub2ec "}<strong>{fmtKRW(s.orders.monthlyRevenue)}</strong>
              {" \u00b7 "}
              <span className={weekTrend.cls}>{"\uc8fc\uac04 "}{weekTrend.text}</span>
            </p>
          </div>

          <div className="ac-card">
            <p className="ac-kpi-label">{"\uc644\ub8cc \uc8fc\ubb38"}</p>
            <p className="ac-kpi-value">{fmt(s.orders.paid)}</p>
            <p className="ac-kpi-sub">
              {"\uc804\uccb4 "}{fmt(s.orders.total)}{"\uac74 \u00b7 \uc2e4\ud328 "}
              <span className={failRate > 5 ? "ac-trend-down" : ""}>{failRate}%</span>
            </p>
          </div>

          <div className="ac-card">
            <p className="ac-kpi-label">{"Void \uc644\ub8cc\uc728"}</p>
            <p className="ac-kpi-value">{s.void.completionRate}%</p>
            <p className="ac-kpi-sub">
              {"\uc644\ub8cc "}{fmt(s.void.complete)}{" / \uc804\uccb4 "}{fmt(s.void.total)}{" \u00b7 \uc2e4\ud328 "}{fmt(s.void.failed)}
            </p>
          </div>
        </div>

        <div className="ac-kpi-grid">
          <div className="ac-card-sm">
            <p className="ac-kpi-label">{"\uc774\ubc88\uc8fc \uac00\uc785"}</p>
            <p className="ac-kpi-value" style={{ fontSize: "1.25rem" }}>{fmt(s.users.week)}{"\uba85"}</p>
            <p className="ac-kpi-sub">
              <span className={weekUser.cls}>{"\uc9c0\ub09c\uc8fc "}{fmt(s.users.prevWeek)}{"\uba85 "}{weekUser.text}</span>
            </p>
          </div>

          <div className="ac-card-sm">
            <p className="ac-kpi-label">{"\uc774\ubc88\ub2ec \uac00\uc785"}</p>
            <p className="ac-kpi-value" style={{ fontSize: "1.25rem" }}>{fmt(s.users.month)}{"\uba85"}</p>
            <p className="ac-kpi-sub">
              <span className={monthTrend.cls}>{"\uc9c0\ub09c\ub2ec "}{fmt(s.users.prevMonth)}{"\uba85 "}{monthTrend.text}</span>
            </p>
          </div>

          <div className="ac-card-sm">
            <p className="ac-kpi-label">{"\uc774\ubc88\uc8fc \ub9e4\ucd9c"}</p>
            <p className="ac-kpi-value" style={{ fontSize: "1.25rem" }}>{fmtKRW(s.orders.weekRevenue)}</p>
            <p className="ac-kpi-sub">
              <span className={weekTrend.cls}>{"\uc9c0\ub09c\uc8fc "}{fmtKRW(s.orders.lastWeekRevenue)}{" "}{weekTrend.text}</span>
            </p>
          </div>

          <div className="ac-card-sm">
            <p className="ac-kpi-label">{"\uad6c\ub3c5 \ud68c\uc6d0"}</p>
            <p className="ac-kpi-value" style={{ fontSize: "1.25rem" }}>{fmt(s.premium.activeMembers)}</p>
            <p className="ac-kpi-sub">
              {"\uc774\ubc88\ub2ec "}{fmt(s.premium.thisMonth)}{" \u00b7 \ub204\uc801 "}{fmt(s.premium.allTimePurchases)}{"\uac74"}
            </p>
          </div>
        </div>

        <div className="ac-kpi-grid-2">
          <div className="ac-card">
            <p className="ac-kpi-label">{"14\uc77c \uac00\uc785 \ucd94\uc774"}</p>
            <Sparkline data={s.users.dailySignups} color="#6366f1" />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem" }}>
              {s.users.dailySignups[0] && (
                <span style={{ fontSize: "0.63rem", color: "#9ca3af" }}>
                  {fmtDate(s.users.dailySignups[0].date)}
                </span>
              )}
              {s.users.dailySignups.at(-1) && (
                <span style={{ fontSize: "0.63rem", color: "#9ca3af" }}>
                  {fmtDate(s.users.dailySignups.at(-1)!.date)}
                </span>
              )}
            </div>
          </div>

          <div className="ac-card">
            <p className="ac-kpi-label">{"14\uc77c \ub9e4\ucd9c \ucd94\uc774"}</p>
            <Sparkline data={s.orders.dailyRevenue} color="#2563eb" />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem" }}>
              {s.orders.dailyRevenue[0] && (
                <span style={{ fontSize: "0.63rem", color: "#9ca3af" }}>
                  {fmtDate(s.orders.dailyRevenue[0].date)}
                </span>
              )}
              {s.orders.dailyRevenue.at(-1) && (
                <span style={{ fontSize: "0.63rem", color: "#9ca3af" }}>
                  {fmtDate(s.orders.dailyRevenue.at(-1)!.date)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="ac-kpi-grid-2">
          <div className="ac-card">
            <p className="ac-section-title">{"\uc0c1\ud488\ubcc4 \ub9e4\ucd9c"}</p>
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead>
                  <tr>
                    <th>{"\uc0c1\ud488"}</th>
                    <th style={{ textAlign: "right" }}>{"\uac74\uc218"}</th>
                    <th style={{ textAlign: "right" }}>{"\ub9e4\ucd9c"}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.orders.byProduct.map((p) => (
                    <tr key={p.productId}>
                      <td>{PRODUCT_LABELS[p.productId] ?? p.productId}</td>
                      <td style={{ textAlign: "right" }}>{fmt(p.count)}</td>
                      <td style={{ textAlign: "right" }}>{fmtKRW(p.revenue)}</td>
                    </tr>
                  ))}
                  {s.orders.byProduct.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ color: "#9ca3af", textAlign: "center" }}>
                        {"\ub370\uc774\ud130 \uc5c6\uc74c"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ac-card">
            <p className="ac-section-title">{"Void \uce74\ud14c\uace0\ub9ac\ubcc4"}</p>
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead>
                  <tr>
                    <th>{"\uce74\ud14c\uace0\ub9ac"}</th>
                    <th style={{ textAlign: "right" }}>{"\uc804\uccb4"}</th>
                    <th style={{ textAlign: "right" }}>{"\uc644\ub8cc"}</th>
                    <th style={{ textAlign: "right" }}>{"\uc644\ub8cc\uc728"}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.void.byCategory.map((c) => (
                    <tr key={c.category}>
                      <td>{CATEGORY_LABELS[c.category] ?? c.category}</td>
                      <td style={{ textAlign: "right" }}>{fmt(c.count)}</td>
                      <td style={{ textAlign: "right" }}>{fmt(c.complete)}</td>
                      <td style={{ textAlign: "right" }}>
                        <span
                          className={
                            "ac-badge " +
                            (c.rate >= 80
                              ? "ac-badge-green"
                              : c.rate >= 50
                              ? "ac-badge-yellow"
                              : "ac-badge-red")
                          }
                        >
                          {c.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {s.void.byCategory.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ color: "#9ca3af", textAlign: "center" }}>
                        {"\ub370\uc774\ud130 \uc5c6\uc74c"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {(s.orders.failed > 0 || s.void.failed > 0 || s.void.generating > 0) && (
          <>
            <p className="ac-section-title" style={{ marginTop: "0.5rem" }}>{"\uacbd\uace0"}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {s.orders.failed > 0 && (
                <div className="ac-alert">
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>!</span>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>{"\uacb0\uc81c \uc2e4\ud328"}</span>
                    <span style={{ fontSize: "0.78rem", color: "#6b7280", marginLeft: "0.5rem" }}>
                      {fmt(s.orders.failed)}{"\uac74"}
                    </span>
                  </div>
                  <a
                    href="/admin/orders?status=failed"
                    style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#2563eb", textDecoration: "none" }}
                  >
                    {"\ud655\uc778 \u2192"}
                  </a>
                </div>
              )}
              {s.void.failed > 0 && (
                <div className="ac-alert">
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>!</span>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>{"Void \uc0dd\uc131 \uc2e4\ud328"}</span>
                    <span style={{ fontSize: "0.78rem", color: "#6b7280", marginLeft: "0.5rem" }}>
                      {fmt(s.void.failed)}{"\uac74"}
                    </span>
                  </div>
                  <a
                    href="/admin/void?status=failed"
                    style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#2563eb", textDecoration: "none" }}
                  >
                    {"\ud655\uc778 \u2192"}
                  </a>
                </div>
              )}
              {s.void.generating > 0 && (
                <div
                  style={{
                    background: "#fff",
                    borderRadius: "0.5rem",
                    border: "1px solid #fde68a",
                    padding: "0.875rem 1.25rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  <span style={{ color: "#d97706" }}>{"\u27f3"}</span>
                  <span style={{ fontSize: "0.82rem" }}>
                    <strong>{"Void \uc0dd\uc131 \uc9c4\ud589 \uc911"}</strong>
                    <span style={{ color: "#6b7280", marginLeft: "0.5rem" }}>
                      {fmt(s.void.generating)}{"\uac74"}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}