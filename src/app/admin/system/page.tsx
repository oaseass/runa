import { requireAdminAuth } from "@/lib/server/admin-session";
import { getAdminStats } from "@/lib/server/admin-stats";
import { db } from "@/lib/server/db";

function fmt(n: number) { return n.toLocaleString("ko-KR"); }

export default async function AdminSystemPage() {
  await requireAdminAuth();
  const stats = getAdminStats();

  let dbSize = "—";
  try {
    const row = db
      .prepare(
        "SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()",
      )
      .get() as { size: number } | undefined;
    if (row) {
      const bytes = row.size;
      dbSize =
        bytes > 1024 * 1024
          ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
          : `${(bytes / 1024).toFixed(0)} KB`;
    }
  } catch {
    /* ignore */
  }

  const uptime = process.uptime();
  const uptimeStr =
    uptime >= 3600
      ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
      : `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`;

  const nowISO = new Date().toISOString();
  const nowKST = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  return (
    <div>
      <div className="ac-topbar">
        <h1 className="ac-topbar-title">시스템</h1>
        <span className="ac-topbar-sub">{nowKST} KST</span>
      </div>

      <div className="ac-page">
        {/* Runtime KPIs */}
        <div className="ac-kpi-grid" style={{ marginBottom: "1.25rem" }}>
          <div className="ac-card">
            <p className="ac-kpi-label">서버 업타임</p>
            <p className="ac-kpi-value" style={{ fontSize: "1.3rem" }}>{uptimeStr}</p>
            <p className="ac-kpi-sub">UTC {nowISO.slice(11, 19)}</p>
          </div>

          <div className="ac-card">
            <p className="ac-kpi-label">DB 크기</p>
            <p className="ac-kpi-value" style={{ fontSize: "1.3rem" }}>{dbSize}</p>
            <p className="ac-kpi-sub">SQLite</p>
          </div>

          <div className="ac-card">
            <p className="ac-kpi-label">전체 사용자</p>
            <p className="ac-kpi-value" style={{ fontSize: "1.3rem" }}>{fmt(stats.users.total)}</p>
            <p className="ac-kpi-sub">DB 레코드</p>
          </div>

          <div className="ac-card">
            <p className="ac-kpi-label">전체 주문</p>
            <p className="ac-kpi-value" style={{ fontSize: "1.3rem" }}>{fmt(stats.orders.total)}</p>
            <p className="ac-kpi-sub">
              완료 {fmt(stats.orders.paid)} · 실패 {fmt(stats.orders.failed)}
            </p>
          </div>
        </div>

        <hr className="ac-divider" />

        <div className="ac-kpi-grid-2">
          {/* Environment */}
          <div className="ac-card">
            <p className="ac-section-title">환경 정보</p>
            <table className="ac-table">
              <tbody>
                <tr>
                  <td style={{ color: "#9ca3af", width: "160px" }}>NODE_ENV</td>
                  <td style={{ fontFamily: "monospace" }}>
                    <span
                      className={`ac-badge ${
                        process.env.NODE_ENV === "production"
                          ? "ac-badge-green"
                          : "ac-badge-yellow"
                      }`}
                    >
                      {process.env.NODE_ENV ?? "—"}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ color: "#9ca3af" }}>현재 시각 (UTC)</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{nowISO}</td>
                </tr>
                <tr>
                  <td style={{ color: "#9ca3af" }}>런타임</td>
                  <td style={{ fontFamily: "monospace" }}>Node.js {process.version}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Table record counts */}
          <div className="ac-card">
            <p className="ac-section-title">테이블 레코드 수</p>
            <table className="ac-table">
              <thead>
                <tr>
                  <th>테이블</th>
                  <th style={{ textAlign: "right" }}>레코드</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>users</td>
                  <td style={{ textAlign: "right" }}>{fmt(stats.users.total)}</td>
                </tr>
                <tr>
                  <td>orders</td>
                  <td style={{ textAlign: "right" }}>{fmt(stats.orders.total)}</td>
                </tr>
                <tr>
                  <td>void_analysis_requests</td>
                  <td style={{ textAlign: "right" }}>{fmt(stats.void.total)}</td>
                </tr>
                <tr>
                  <td>connections</td>
                  <td style={{ textAlign: "right" }}>{fmt(stats.connections.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
