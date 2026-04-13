import { requireAdminAuth } from "@/lib/server/admin-session";
import {
  getAdminVoidRequests,
  getAdminVoidAnalysis,
} from "@/lib/server/admin-data";
import { getAdminStats } from "@/lib/server/admin-stats";

const CATEGORY_LABELS: Record<string, string> = {
  self:   "\ub098",
  love:   "\uad00\uacc4",
  work:   "\ub8e8\ud2f4\u00b7\uc77c",
  social: "\uc0ac\uace0\u00b7\ud45c\ud604",
};

function fmt(n: number) { return n.toLocaleString("ko-KR"); }
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
  });
}

export default async function AdminVoidPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  await requireAdminAuth();
  const sp = await searchParams;
  const statusFilter   = sp.status   ?? "";
  const categoryFilter = sp.category ?? "";

  const [allRequests, stats, analysis] = await Promise.all([
    getAdminVoidRequests(),
    getAdminStats(),
    getAdminVoidAnalysis(),
  ]);

  const filtered = allRequests.filter(
    (r) =>
      (!statusFilter   || r.status   === statusFilter) &&
      (!categoryFilter || r.category === categoryFilter),
  );

  return (
    <div>
      <div className="ac-topbar">
        <h1 className="ac-topbar-title">{"Void \ubd84\uc11d"}</h1>
        <span className="ac-topbar-sub">{fmt(filtered.length)}{"\uac74 \ud45c\uc2dc"}</span>
      </div>

      <div className="ac-page">
        <div className="ac-kpi-grid" style={{ marginBottom: "1.25rem" }}>
          {stats.void.byCategory.map((c) => (
            <div key={c.category} className="ac-card-sm">
              <p className="ac-kpi-label">{CATEGORY_LABELS[c.category] ?? c.category}</p>
              <p className="ac-kpi-value" style={{ fontSize: "1.35rem" }}>{fmt(c.count)}</p>
              <p className="ac-kpi-sub">
                {"\uc644\ub8cc "}{fmt(c.complete)}{" \u00b7 "}
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
              </p>
            </div>
          ))}
        </div>

        <div className="ac-kpi-grid-2" style={{ marginBottom: "1.25rem" }}>
          <div className="ac-card">
            <p className="ac-section-title">{"Void \ub2e4\uc0ac\uc6a9 \ud68c\uc6d0 TOP 10"}</p>
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead>
                  <tr>
                    <th>{"\ud68c\uc6d0"}</th>
                    <th style={{ textAlign: "right" }}>{"\ud69f\uc218"}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.heavyUsers.slice(0, 10).map((u) => (
                    <tr key={u.userId}>
                      <td style={{ fontWeight: 500 }}>{u.username}</td>
                      <td style={{ textAlign: "right" }}>{u.count}</td>
                    </tr>
                  ))}
                  {analysis.heavyUsers.length === 0 && (
                    <tr>
                      <td colSpan={2} style={{ color: "#9ca3af", textAlign: "center" }}>
                        {"\ub370\uc774\ud130 \uc5c6\uc74c"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ac-card">
            <p className="ac-section-title">{"\ubc18\ubcf5 \uc9c8\ubb38 TOP 10"}</p>
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead>
                  <tr>
                    <th>{"\uc9c8\ubb38"}</th>
                    <th>{"\uce74\ud14c\uace0\ub9ac"}</th>
                    <th style={{ textAlign: "right" }}>{"\ud69f\uc218"}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.topQuestions.slice(0, 10).map((q, i) => (
                    <tr key={i}>
                      <td
                        style={{
                          maxWidth: "200px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: "#6b7280",
                        }}
                        title={q.questionText}
                      >
                        {q.questionText}
                      </td>
                      <td>{CATEGORY_LABELS[q.category] ?? q.category}</td>
                      <td style={{ textAlign: "right" }}>{q.count}</td>
                    </tr>
                  ))}
                  {analysis.topQuestions.length === 0 && (
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
        </div>

        <form method="GET" className="ac-filter-bar">
          <select name="status" defaultValue={statusFilter}>
            <option value="">{"\uc804\uccb4 \uc0c1\ud0dc"}</option>
            <option value="complete">{"\uc644\ub8cc"}</option>
            <option value="generating">{"\uc0dd\uc131 \uc911"}</option>
            <option value="pending">{"\ub300\uae30"}</option>
            <option value="failed">{"\uc2e4\ud328"}</option>
          </select>
          <select name="category" defaultValue={categoryFilter}>
            <option value="">{"\uc804\uccb4 \uce74\ud14c\uace0\ub9ac"}</option>
            <option value="self">{"\ub098"}</option>
            <option value="love">{"\uad00\uacc4"}</option>
            <option value="work">{"\ub8e8\ud2f4\u00b7\uc77c"}</option>
            <option value="social">{"\uc0ac\uace0\u00b7\ud45c\ud604"}</option>
          </select>
          <button
            type="submit"
            style={{
              padding: "0.4rem 0.9rem",
              background: "#111827",
              color: "#fff",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            {"\uc801\uc6a9"}
          </button>
          {(statusFilter || categoryFilter) && (
            <a
              href="/admin/void"
              style={{ fontSize: "0.78rem", color: "#6b7280", textDecoration: "none" }}
            >
              {"\ucd08\uae30\ud654"}
            </a>
          )}
        </form>

        <div className="ac-card" style={{ padding: 0 }}>
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr>
                  <th>{"\ud68c\uc6d0"}</th>
                  <th>{"\uce74\ud14c\uace0\ub9ac"}</th>
                  <th>{"\uc9c8\ubb38"}</th>
                  <th>{"\uc0c1\ud0dc"}</th>
                  <th>{"\uc77c\uc2dc"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{r.username}</td>
                    <td>
                      <span className="ac-badge ac-badge-gray">
                        {CATEGORY_LABELS[r.category] ?? r.category}
                      </span>
                    </td>
                    <td
                      style={{
                        maxWidth: "240px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "#6b7280",
                      }}
                      title={r.questionText}
                    >
                      {r.questionText || "\u2014"}
                    </td>
                    <td>
                      {r.status === "complete"   && <span className="ac-badge ac-badge-green">{"\uc644\ub8cc"}</span>}
                      {r.status === "generating" && <span className="ac-badge ac-badge-blue">{"\uc0dd\uc131\uc911"}</span>}
                      {r.status === "pending"    && <span className="ac-badge ac-badge-yellow">{"\ub300\uae30"}</span>}
                      {r.status === "failed"     && <span className="ac-badge ac-badge-red">{"\uc2e4\ud328"}</span>}
                      {!["complete", "generating", "pending", "failed"].includes(r.status) && (
                        <span className="ac-badge ac-badge-gray">{r.status}</span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.76rem" }}>{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}
                    >
                      {"\ub370\uc774\ud130 \uc5c6\uc74c"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}