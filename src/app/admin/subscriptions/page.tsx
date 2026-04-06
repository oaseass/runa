import { requireAdminAuth } from "@/lib/server/admin-session";
import { getAdminSubscriptions } from "@/lib/server/admin-data";
import { getAdminStats } from "@/lib/server/admin-stats";

const PRODUCT_LABELS: Record<string, string> = {
  yearly:     "연간 구독",
  membership: "멤버십",
};

function fmt(n: number) { return n.toLocaleString("ko-KR"); }
function fmtKRW(n: number) { return `₩${n.toLocaleString("ko-KR")}`; }

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day:   "2-digit",
  });
}

function fmtPhone(p: string) {
  const local = p.startsWith("+82") ? "0" + p.slice(3) : p;
  return local.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3");
}

export default async function AdminSubscriptionsPage() {
  await requireAdminAuth();
  const subs  = getAdminSubscriptions();
  const stats = getAdminStats();

  const totalRevenue    = subs.reduce((sum, s) => sum + s.amount, 0);
  const yearlyCount     = subs.filter((s) => s.productId === "yearly").length;
  const membershipCount = subs.filter((s) => s.productId === "membership").length;

  return (
    <div>
      <div className="ac-topbar">
        <h1 className="ac-topbar-title">구독</h1>
        <span className="ac-topbar-sub">
          총 {fmt(subs.length)}건 · {fmtKRW(totalRevenue)}
        </span>
      </div>

      <div className="ac-page">
        <div className="ac-kpi-grid-3" style={{ marginBottom: "1.25rem" }}>
          <div className="ac-card">
            <p className="ac-kpi-label">활성 멤버십</p>
            <p className="ac-kpi-value">{fmt(stats.premium.activeMembers)}</p>
            <p className="ac-kpi-sub">
              이번달 신규 {fmt(stats.premium.thisMonth)} · 누적 {fmt(stats.premium.allTimePurchases)}건
            </p>
          </div>

          <div className="ac-card">
            <p className="ac-kpi-label">연간 구독</p>
            <p className="ac-kpi-value">{fmt(yearlyCount)}</p>
            <p className="ac-kpi-sub">멤버십 {fmt(membershipCount)}건 포함</p>
          </div>

          <div className="ac-card">
            <p className="ac-kpi-label">구독 총 매출</p>
            <p className="ac-kpi-value">{fmtKRW(totalRevenue)}</p>
            <p className="ac-kpi-sub">
              멤버십 {membershipCount}건 · 연간 {yearlyCount}건
            </p>
          </div>
        </div>

        <div className="ac-card" style={{ padding: 0 }}>
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>연락처</th>
                  <th>상품</th>
                  <th style={{ textAlign: "right" }}>금액</th>
                  <th>결제일</th>
                  <th>생성일</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.orderId}>
                    <td style={{ fontWeight: 500, color: "#111827" }}>{s.username}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "0.76rem" }}>
                      {fmtPhone(s.phoneNumber)}
                    </td>
                    <td>
                      <span
                        className={`ac-badge ${
                          s.productId === "yearly" ? "ac-badge-purple" : "ac-badge-blue"
                        }`}
                      >
                        {PRODUCT_LABELS[s.productId] ?? s.productId}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>{fmtKRW(s.amount)}</td>
                    <td style={{ fontSize: "0.76rem" }}>{fmtDate(s.paidAt)}</td>
                    <td style={{ fontSize: "0.76rem" }}>{fmtDate(s.createdAt)}</td>
                  </tr>
                ))}
                {subs.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}
                    >
                      구독 데이터 없음
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
