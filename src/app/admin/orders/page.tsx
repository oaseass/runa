import { requireAdminAuth } from "@/lib/server/admin-session";
import { getAdminOrdersFiltered } from "@/lib/server/admin-data";

const PRODUCT_LABELS: Record<string, string> = {
  yearly:     "\uc5f0\uac04 \uad6c\ub3c5",
  membership: "\uba64\ubc84\uc2ed",
  area:       "\uc601\uc5ed \ubcf4\uace0\uc11c",
  question:   "\ub2e8\uc77c \uc9c8\ubb38",
};

const STATUS_LABELS: Record<string, string> = {
  paid:    "\uc644\ub8cc",
  pending: "\ub300\uae30",
  failed:  "\uc2e4\ud328",
};

function fmt(n: number) { return n.toLocaleString("ko-KR"); }
function fmtKRW(n: number) { return "\u20a9" + n.toLocaleString("ko-KR"); }

function fmtDate(s: string | null) {
  if (!s) return "\u2014";
  return new Date(s).toLocaleDateString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtPhone(p: string) {
  const local = p.startsWith("+82") ? "0" + p.slice(3) : p;
  return local.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3");
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; product?: string }>;
}) {
  await requireAdminAuth();
  const sp = await searchParams;
  const statusFilter  = sp.status  ?? "";
  const productFilter = sp.product ?? "";
  const orders = getAdminOrdersFiltered(statusFilter, productFilter);

  const paidOrders   = orders.filter((o) => o.status === "paid");
  const totalRevenue = paidOrders.reduce((sum, o) => sum + o.amount, 0);

  return (
    <div>
      <div className="ac-topbar">
        <h1 className="ac-topbar-title">{"\uc8fc\ubb38"}</h1>
        <span className="ac-topbar-sub">
          {fmt(orders.length)}{"\uac74 \u00b7 \uc644\ub8cc "}{fmt(paidOrders.length)}{"\uac74 \u00b7 "}{fmtKRW(totalRevenue)}
        </span>
      </div>

      <div className="ac-page">
        <form method="GET" className="ac-filter-bar">
          <select name="status" defaultValue={statusFilter}>
            <option value="">{"\uc804\uccb4 \uc0c1\ud0dc"}</option>
            <option value="paid">{"\uc644\ub8cc"}</option>
            <option value="pending">{"\ub300\uae30"}</option>
            <option value="failed">{"\uc2e4\ud328"}</option>
          </select>
          <select name="product" defaultValue={productFilter}>
            <option value="">{"\uc804\uccb4 \uc0c1\ud488"}</option>
            <option value="membership">{"\uba64\ubc84\uc2ed"}</option>
            <option value="yearly">{"\uc5f0\uac04 \uad6c\ub3c5"}</option>
            <option value="area">{"\uc601\uc5ed \ubcf4\uace0\uc11c"}</option>
            <option value="question">{"\ub2e8\uc77c \uc9c8\ubb38"}</option>
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
          {(statusFilter || productFilter) && (
            <a
              href="/admin/orders"
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
                  <th>{"\uc8fc\ubb38 ID"}</th>
                  <th>{"\ud68c\uc6d0"}</th>
                  <th>{"\uc5f0\ub77d\uccb8"}</th>
                  <th>{"\uc0c1\ud488"}</th>
                  <th style={{ textAlign: "right" }}>{"\uae08\uc561"}</th>
                  <th>{"\uc0c1\ud0dc"}</th>
                  <th>{"\uacb0\uc81c\uc77c"}</th>
                  <th>{"\uc0dd\uc131\uc77c"}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.7rem",
                        color: "#9ca3af",
                        maxWidth: "100px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {o.id.slice(0, 8)}{"\u2026"}
                    </td>
                    <td style={{ fontWeight: 500, color: "#111827" }}>{o.username}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.76rem" }}>
                      {fmtPhone(o.phoneNumber)}
                    </td>
                    <td>{PRODUCT_LABELS[o.productId] ?? o.productId}</td>
                    <td style={{ textAlign: "right" }}>{fmtKRW(o.amount)}</td>
                    <td>
                      {o.status === "paid" && (
                        <span className="ac-badge ac-badge-green">{STATUS_LABELS.paid}</span>
                      )}
                      {o.status === "pending" && (
                        <span className="ac-badge ac-badge-yellow">{STATUS_LABELS.pending}</span>
                      )}
                      {o.status === "failed" && (
                        <span className="ac-badge ac-badge-red">{STATUS_LABELS.failed}</span>
                      )}
                      {!["paid", "pending", "failed"].includes(o.status) && (
                        <span className="ac-badge ac-badge-gray">{o.status}</span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.76rem" }}>{fmtDate(o.paidAt)}</td>
                    <td style={{ fontSize: "0.76rem" }}>{fmtDate(o.createdAt)}</td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}
                    >
                      {"\uc8fc\ubb38 \uc5c6\uc74c"}
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