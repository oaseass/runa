import { requireAdminAuth } from "@/lib/server/admin-session";
import { getAdminOrdersFiltered } from "@/lib/server/admin-data";
import { refundOrderAction } from "./_actions/refundOrderAction";

const PRODUCT_LABELS: Record<string, string> = {
  yearly: "연간 리포트",
  membership: "LUNA VIP 월간",
  area: "영역 보고서",
  question: "VOID 1회권",
  vip_monthly: "LUNA VIP 월간",
  vip_yearly: "LUNA VIP 연간",
  annual_report: "연간 리포트",
  area_reading: "영역 보고서",
  void_single: "VOID 1회권",
  void_pack_3: "VOID 3회권",
  void_pack_5: "VOID 5회권",
  void_pack_10: "VOID 10회권",
};

const STATUS_LABELS: Record<string, string> = {
  paid: "완료",
  pending: "대기",
  failed: "실패",
  cancelled: "종료",
  refunded: "환불",
};

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function fmtKRW(n: number) {
  return `₩${n.toLocaleString("ko-KR")}`;
}

function fmtDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPhone(phoneNumber: string) {
  const local = phoneNumber.startsWith("+82") ? `0${phoneNumber.slice(3)}` : phoneNumber;
  return local.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3");
}

function fmtRefundSource(source: string) {
  switch (source) {
    case "toss":
      return "Toss";
    case "apple":
      return "Apple";
    case "google":
      return "Google";
    case "admin":
      return "관리자";
    case "dev":
      return "개발";
    case "system":
      return "시스템";
    default:
      return source;
  }
}

function fmtRefundEventRef(value: string | null) {
  if (!value) {
    return null;
  }

  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
}

function buildReturnTo(statusFilter: string, productFilter: string) {
  const params = new URLSearchParams();
  if (statusFilter) {
    params.set("status", statusFilter);
  }
  if (productFilter) {
    params.set("product", productFilter);
  }

  const search = params.toString();
  return search ? `/admin/orders?${search}` : "/admin/orders";
}

function buildOrderDetailHref(orderId: string, returnTo: string) {
  const params = new URLSearchParams();
  if (returnTo && returnTo !== "/admin/orders") {
    params.set("returnTo", returnTo);
  }

  const search = params.toString();
  return search ? `/admin/orders/${orderId}?${search}` : `/admin/orders/${orderId}`;
}

function getRefundNotice(refundState: string, refundCode: string) {
  if (refundState === "success") {
    return {
      tone: "#ecfdf5",
      border: "#10b981",
      color: "#065f46",
      message: "환불 처리가 완료되었습니다.",
    };
  }

  if (refundState === "error") {
    return {
      tone: "#fef2f2",
      border: "#ef4444",
      color: "#991b1b",
      message: `환불 처리에 실패했습니다. (${refundCode || "REFUND_FAILED"})`,
    };
  }

  return null;
}

function canManuallyRefund(order: {
  status: string;
  paymentKey: string | null;
  paymentType: string | null;
}) {
  return (
    order.status === "paid" &&
    !!order.paymentKey &&
    order.paymentType !== "APPLE_IAP" &&
    order.paymentType !== "GOOGLE_IAP"
  );
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    product?: string;
    refund?: string;
    refundCode?: string;
  }>;
}) {
  await requireAdminAuth();

  const sp = await searchParams;
  const statusFilter = sp.status ?? "";
  const productFilter = sp.product ?? "";
  const refundState = sp.refund ?? "";
  const refundCode = sp.refundCode ?? "";
  const orders = await getAdminOrdersFiltered(statusFilter, productFilter);
  const paidOrders = orders.filter((order) => order.status === "paid");
  const totalRevenue = paidOrders.reduce((sum, order) => sum + order.amount, 0);
  const refundNotice = getRefundNotice(refundState, refundCode);
  const returnTo = buildReturnTo(statusFilter, productFilter);

  return (
    <div>
      <div className="ac-topbar">
        <h1 className="ac-topbar-title">주문</h1>
        <span className="ac-topbar-sub">
          {fmt(orders.length)}건 · 완료 {fmt(paidOrders.length)}건 · {fmtKRW(totalRevenue)}
        </span>
      </div>

      <div className="ac-page">
        {refundNotice && (
          <div
            className="ac-card"
            style={{
              marginBottom: "1rem",
              background: refundNotice.tone,
              borderLeft: `4px solid ${refundNotice.border}`,
              color: refundNotice.color,
            }}
          >
            {refundNotice.message}
          </div>
        )}

        <form method="GET" className="ac-filter-bar">
          <select name="status" defaultValue={statusFilter}>
            <option value="">전체 상태</option>
            <option value="paid">완료</option>
            <option value="pending">대기</option>
            <option value="failed">실패</option>
            <option value="cancelled">종료</option>
            <option value="refunded">환불</option>
          </select>
          <select name="product" defaultValue={productFilter}>
            <option value="">전체 상품</option>
            <option value="membership">LUNA VIP 월간</option>
            <option value="vip_yearly">LUNA VIP 연간</option>
            <option value="yearly">연간 리포트</option>
            <option value="area">영역 보고서</option>
            <option value="question">VOID 1회권</option>
            <option value="void_pack_3">VOID 3회권</option>
            <option value="void_pack_5">VOID 5회권</option>
            <option value="void_pack_10">VOID 10회권</option>
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
            적용
          </button>
          {(statusFilter || productFilter) && (
            <a
              href="/admin/orders"
              style={{ fontSize: "0.78rem", color: "#6b7280", textDecoration: "none" }}
            >
              초기화
            </a>
          )}
        </form>

        <div className="ac-card" style={{ padding: 0 }}>
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr>
                  <th>주문 ID</th>
                  <th>회원</th>
                  <th>연락처</th>
                  <th>상품</th>
                  <th style={{ textAlign: "right" }}>금액</th>
                  <th>결제 수단</th>
                  <th>상태</th>
                  <th>환불</th>
                  <th>결제일</th>
                  <th>생성일</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const manualRefund = canManuallyRefund(order);
                  const hasRefundHistory = !!order.refundedAt || order.refundEvents.length > 0;

                  return (
                    <tr key={order.id}>
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
                        {order.id.slice(0, 8)}…
                      </td>
                      <td style={{ fontWeight: 500, color: "#111827" }}>{order.username}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.76rem" }}>
                        {fmtPhone(order.phoneNumber)}
                      </td>
                      <td>{PRODUCT_LABELS[order.productId] ?? order.productId}</td>
                      <td style={{ textAlign: "right" }}>{fmtKRW(order.amount)}</td>
                      <td style={{ fontSize: "0.74rem", color: "#4b5563" }}>
                        {order.paymentType ?? "—"}
                      </td>
                      <td>
                        {order.status === "paid" && (
                          <span className="ac-badge ac-badge-green">{STATUS_LABELS.paid}</span>
                        )}
                        {order.status === "pending" && (
                          <span className="ac-badge ac-badge-yellow">{STATUS_LABELS.pending}</span>
                        )}
                        {order.status === "failed" && (
                          <span className="ac-badge ac-badge-red">{STATUS_LABELS.failed}</span>
                        )}
                        {order.status === "cancelled" && (
                          <span className="ac-badge ac-badge-gray">{STATUS_LABELS.cancelled}</span>
                        )}
                        {order.status === "refunded" && (
                          <span className="ac-badge ac-badge-gray">{STATUS_LABELS.refunded}</span>
                        )}
                      </td>
                      <td style={{ fontSize: "0.74rem", lineHeight: 1.4 }}>
                        {hasRefundHistory ? (
                          <div style={{ display: "grid", gap: "0.2rem" }}>
                            {order.refundedAt && (
                              <>
                                <span>{fmtDate(order.refundedAt)}</span>
                                <span style={{ color: "#6b7280" }}>
                                  {fmtKRW(order.refundAmount || order.amount)}
                                  {order.refundSource ? ` · ${fmtRefundSource(order.refundSource)}` : ""}
                                </span>
                                {order.refundReason && (
                                  <span style={{ color: "#6b7280" }}>{order.refundReason}</span>
                                )}
                              </>
                            )}
                            {order.refundEvents.length > 0 && (
                              <div
                                style={{
                                  display: "grid",
                                  gap: "0.35rem",
                                  marginTop: order.refundedAt ? "0.35rem" : 0,
                                  paddingTop: order.refundedAt ? "0.35rem" : 0,
                                  borderTop: order.refundedAt ? "1px solid #e5e7eb" : "none",
                                }}
                              >
                                {order.refundEvents.map((event) => {
                                  const refValue =
                                    fmtRefundEventRef(event.externalRef) ??
                                    fmtRefundEventRef(event.transactionId) ??
                                    fmtRefundEventRef(event.purchaseToken);

                                  return (
                                    <div key={event.id} style={{ display: "grid", gap: "0.08rem" }}>
                                      <span style={{ color: "#111827", fontWeight: 500 }}>
                                        {fmtDate(event.processedAt ?? event.createdAt)} · {fmtRefundSource(event.source)}
                                      </span>
                                      <span style={{ color: "#6b7280" }}>
                                        {fmtKRW(event.amount)}
                                        {event.status ? ` · ${event.status}` : ""}
                                        {refValue ? ` · ${refValue}` : ""}
                                      </span>
                                      {event.reason && (
                                        <span style={{ color: "#6b7280" }}>{event.reason}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ fontSize: "0.76rem" }}>{fmtDate(order.paidAt)}</td>
                      <td style={{ fontSize: "0.76rem" }}>{fmtDate(order.createdAt)}</td>
                      <td style={{ minWidth: "180px" }}>
                        <div style={{ display: "grid", gap: "0.4rem" }}>
                          <a
                            href={buildOrderDetailHref(order.id, returnTo)}
                            style={{
                              fontSize: "0.74rem",
                              color: "#111827",
                              textDecoration: "none",
                              fontWeight: 600,
                            }}
                          >
                            상세 보기
                          </a>
                          {manualRefund && (
                            <form action={refundOrderAction} style={{ display: "grid", gap: "0.4rem" }}>
                              <input type="hidden" name="orderId" value={order.id} />
                              <input type="hidden" name="returnTo" value={returnTo} />
                              <input
                                type="text"
                                name="reason"
                                defaultValue="관리자 환불"
                                aria-label="환불 사유"
                                style={{
                                  width: "100%",
                                  border: "1px solid #d1d5db",
                                  borderRadius: "0.375rem",
                                  padding: "0.35rem 0.5rem",
                                  fontSize: "0.74rem",
                                }}
                              />
                              <button
                                type="submit"
                                style={{
                                  border: "none",
                                  borderRadius: "0.375rem",
                                  background: "#111827",
                                  color: "#fff",
                                  fontSize: "0.74rem",
                                  padding: "0.45rem 0.6rem",
                                  cursor: "pointer",
                                }}
                              >
                                환불 실행
                              </button>
                            </form>
                          )}
                          {!manualRefund && order.status === "paid" && (
                            <span style={{ fontSize: "0.72rem", color: "#6b7280", lineHeight: 1.4 }}>
                              {order.paymentType === "APPLE_IAP" || order.paymentType === "GOOGLE_IAP"
                                ? "스토어에서 환불하면 자동 반영됩니다."
                                : "—"}
                            </span>
                          )}
                          {order.status !== "paid" && (
                            <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      style={{ textAlign: "center", color: "#9ca3af", padding: "2rem" }}
                    >
                      주문 없음
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