import { notFound } from "next/navigation";
import { requireAdminAuth } from "@/lib/server/admin-session";
import {
  getAdminOrderById,
  type AdminRefundEvent,
  type AdminVoidCreditLedgerEntry,
} from "@/lib/server/admin-data";
import { refundOrderAction } from "../_actions/refundOrderAction";

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

function fmtKRW(n: number) {
  return `₩${n.toLocaleString("ko-KR")}`;
}

function fmtCredits(n: number) {
  return `${n.toLocaleString("ko-KR")}크레딧`;
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

function fmtEventMetadata(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function fmtLedgerSource(source: string) {
  switch (source) {
    case "purchase":
      return "구매 지급";
    case "starter":
      return "시작 보너스";
    case "manual":
      return "수동 지급";
    case "legacy_balance":
      return "기존 잔액 이관";
    default:
      return source;
  }
}

function isVoidCreditProduct(productId: string) {
  return productId === "question" || productId === "void_single" || productId.startsWith("void_pack_");
}

function sanitizeReturnTo(value: string | undefined) {
  if (!value || !value.startsWith("/admin/orders")) {
    return "/admin/orders";
  }

  return value;
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

function buildDetailReturnTo(orderId: string, backHref: string) {
  const params = new URLSearchParams();
  if (backHref && backHref !== "/admin/orders") {
    params.set("returnTo", backHref);
  }

  const search = params.toString();
  return search ? `/admin/orders/${orderId}?${search}` : `/admin/orders/${orderId}`;
}

function DetailField({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string | null;
  monospace?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: "0.3rem" }}>
      <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>{label}</span>
      <span
        style={{
          color: value ? "#111827" : "#9ca3af",
          fontSize: "0.84rem",
          lineHeight: 1.5,
          fontFamily: monospace ? "monospace" : undefined,
          overflowWrap: "anywhere",
        }}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function RefundEventCard({ event }: { event: AdminRefundEvent }) {
  const metadataText = fmtEventMetadata(event.metadata);

  return (
    <div
      className="ac-card-sm"
      style={{
        display: "grid",
        gap: "0.8rem",
        borderColor: "#e5e7eb",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, fontSize: "0.86rem", fontWeight: 600, color: "#111827" }}>
            {fmtRefundSource(event.source)}
          </p>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.74rem", color: "#6b7280" }}>
            {fmtDate(event.processedAt ?? event.createdAt)}
          </p>
        </div>
        <span className="ac-badge ac-badge-gray">{event.status || "completed"}</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "0.9rem",
        }}
      >
        <DetailField label="환불 금액" value={fmtKRW(event.amount)} />
        <DetailField label="사유" value={event.reason} />
        <DetailField label="외부 ref" value={event.externalRef} monospace />
        <DetailField label="transaction id" value={event.transactionId} monospace />
        <DetailField label="purchase token" value={event.purchaseToken} monospace />
      </div>

      {metadataText && (
        <details>
          <summary
            style={{
              cursor: "pointer",
              fontSize: "0.78rem",
              color: "#4b5563",
              userSelect: "none",
            }}
          >
            원본 metadata 보기
          </summary>
          <pre
            style={{
              margin: "0.65rem 0 0",
              padding: "0.75rem 0.85rem",
              borderRadius: "0.5rem",
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              color: "#111827",
              fontSize: "0.75rem",
              lineHeight: 1.6,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              fontFamily: "monospace",
            }}
          >
            {metadataText}
          </pre>
        </details>
      )}
    </div>
  );
}

function VoidLedgerCard({ entry }: { entry: AdminVoidCreditLedgerEntry }) {
  return (
    <div
      className="ac-card-sm"
      style={{
        display: "grid",
        gap: "0.8rem",
        borderColor: "#e5e7eb",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, fontSize: "0.86rem", fontWeight: 600, color: "#111827" }}>
            {PRODUCT_LABELS[entry.skuId] ?? entry.skuId}
          </p>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.74rem", color: "#6b7280" }}>
            {fmtLedgerSource(entry.sourceType)} · {fmtDate(entry.createdAt)}
          </p>
        </div>
        <span className="ac-badge ac-badge-gray">{entry.status}</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "0.9rem",
        }}
      >
        <DetailField label="지급" value={fmtCredits(entry.totalCredits)} />
        <DetailField label="사용" value={fmtCredits(entry.consumedCredits)} />
        <DetailField label="환불 차감" value={fmtCredits(entry.refundedCredits)} />
        <DetailField label="잔여" value={fmtCredits(entry.remainingCredits)} />
        <DetailField label="transaction id" value={entry.transactionId} monospace />
        <DetailField label="purchase token" value={entry.purchaseToken} monospace />
      </div>
    </div>
  );
}

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ returnTo?: string; refund?: string; refundCode?: string }>;
}) {
  await requireAdminAuth();

  const { orderId } = await params;
  const sp = await searchParams;
  const order = await getAdminOrderById(orderId);

  if (!order) {
    notFound();
  }

  const backHref = sanitizeReturnTo(sp.returnTo);
  const refundNotice = getRefundNotice(sp.refund ?? "", sp.refundCode ?? "");
  const manualRefund = canManuallyRefund(order);
  const detailReturnTo = buildDetailReturnTo(order.id, backHref);
  const summaryRefundAmount = order.refundAmount > 0 ? fmtKRW(order.refundAmount) : null;
  const voidLedgerTotals = order.voidCreditLedger.reduce(
    (acc, entry) => {
      acc.total += entry.totalCredits;
      acc.consumed += entry.consumedCredits;
      acc.refunded += entry.refundedCredits;
      acc.remaining += entry.remainingCredits;
      return acc;
    },
    { total: 0, consumed: 0, refunded: 0, remaining: 0 },
  );
  const showVoidLedger = isVoidCreditProduct(order.productId) || order.voidCreditLedger.length > 0;

  return (
    <div>
      <div className="ac-topbar" style={{ gap: "0.9rem", flexWrap: "wrap" }}>
        <div>
          <h1 className="ac-topbar-title">주문 상세</h1>
          <p
            style={{
              margin: "0.2rem 0 0",
              fontSize: "0.74rem",
              color: "#9ca3af",
              fontFamily: "monospace",
            }}
          >
            {order.id}
          </p>
        </div>
        <span className="ac-topbar-sub">
          {PRODUCT_LABELS[order.productId] ?? order.productId} · {fmtKRW(order.amount)}
        </span>
      </div>

      <div className="ac-page">
        <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
          <a href={backHref} style={{ fontSize: "0.78rem", color: "#6b7280", textDecoration: "none" }}>
            주문 목록으로
          </a>
          <span style={{ fontSize: "0.74rem", color: "#9ca3af", fontFamily: "monospace" }}>
            user {order.userId}
          </span>
        </div>

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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "1rem",
            marginBottom: "1rem",
          }}
        >
          <div className="ac-card">
            <div className="ac-card-head">
              <div>
                <p className="ac-card-title">주문 개요</p>
                <p className="ac-card-copy">회원과 상품, 상태를 한 번에 확인합니다.</p>
              </div>
              <span className={`ac-badge ${order.status === "paid" ? "ac-badge-green" : order.status === "pending" ? "ac-badge-yellow" : order.status === "failed" ? "ac-badge-red" : "ac-badge-gray"}`}>
                {STATUS_LABELS[order.status] ?? order.status}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.9rem",
              }}
            >
              <DetailField label="회원" value={order.username} />
              <DetailField label="연락처" value={fmtPhone(order.phoneNumber)} monospace />
              <DetailField label="상품" value={PRODUCT_LABELS[order.productId] ?? order.productId} />
              <DetailField label="결제 금액" value={fmtKRW(order.amount)} />
              <DetailField label="생성일" value={fmtDate(order.createdAt)} />
              <DetailField label="결제일" value={fmtDate(order.paidAt)} />
              <DetailField label="환불일" value={fmtDate(order.refundedAt)} />
              <DetailField label="환불 금액" value={summaryRefundAmount} />
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <div>
                <p className="ac-card-title">결제 식별자</p>
                <p className="ac-card-copy">축약 없이 원본 값 그대로 확인합니다.</p>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.9rem",
              }}
            >
              <DetailField label="payment type" value={order.paymentType} />
              <DetailField label="payment key" value={order.paymentKey} monospace />
              <DetailField label="provider ref" value={order.providerRef} monospace />
              <DetailField label="refund reference" value={order.refundReference} monospace />
              <DetailField label="analysis id" value={order.analysisId} monospace />
              <DetailField label="환불 사유" value={order.refundReason} />
              <DetailField label="환불 소스" value={order.refundSource ? fmtRefundSource(order.refundSource) : null} />
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "1rem",
            marginBottom: "1rem",
          }}
        >
          <div className="ac-card">
            <div className="ac-card-head">
              <div>
                <p className="ac-card-title">운영 액션</p>
                <p className="ac-card-copy">상세 페이지에서도 환불을 바로 실행할 수 있습니다.</p>
              </div>
            </div>
            {manualRefund ? (
              <form action={refundOrderAction} style={{ display: "grid", gap: "0.55rem" }}>
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="returnTo" value={detailReturnTo} />
                <input
                  type="text"
                  name="reason"
                  defaultValue="관리자 환불"
                  aria-label="환불 사유"
                  style={{
                    width: "100%",
                    border: "1px solid #d1d5db",
                    borderRadius: "0.375rem",
                    padding: "0.5rem 0.65rem",
                    fontSize: "0.84rem",
                  }}
                />
                <button
                  type="submit"
                  style={{
                    width: "fit-content",
                    border: "none",
                    borderRadius: "0.375rem",
                    background: "#111827",
                    color: "#fff",
                    fontSize: "0.82rem",
                    padding: "0.55rem 0.85rem",
                    cursor: "pointer",
                  }}
                >
                  환불 실행
                </button>
              </form>
            ) : (
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#6b7280", lineHeight: 1.6 }}>
                {order.status === "paid" && (order.paymentType === "APPLE_IAP" || order.paymentType === "GOOGLE_IAP")
                  ? "스토어에서 환불하면 자동 반영됩니다."
                  : "이 주문은 상세 페이지에서 수동 환불 대상이 아닙니다."}
              </p>
            )}
          </div>

          <div className="ac-card">
            <div className="ac-card-head">
              <div>
                <p className="ac-card-title">주문 메타</p>
                <p className="ac-card-copy">질문형 상품이면 원본 질문과 카테고리까지 확인합니다.</p>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "0.9rem",
              }}
            >
              <DetailField label="카테고리" value={order.metadata?.category ?? null} />
              <DetailField label="질문 타입" value={order.metadata?.questionType ?? null} />
              <DetailField label="chart hash" value={order.metadata?.chartHash ?? null} monospace />
            </div>
            <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.3rem" }}>
              <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>질문 원문</span>
              <div
                style={{
                  minHeight: "92px",
                  borderRadius: "0.5rem",
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  padding: "0.8rem 0.9rem",
                  fontSize: "0.84rem",
                  lineHeight: 1.6,
                  color: order.metadata?.questionText ? "#111827" : "#9ca3af",
                  whiteSpace: "pre-wrap",
                }}
              >
                {order.metadata?.questionText ?? "저장된 주문 메타가 없습니다."}
              </div>
            </div>
          </div>
        </div>

        <div className="ac-card">
          <div className="ac-card-head">
            <div>
              <p className="ac-card-title">환불 이벤트 타임라인</p>
              <p className="ac-card-copy">목록에서 잘리던 ref와 토큰을 상세에서 모두 확인합니다.</p>
            </div>
          </div>
          {order.refundEvents.length > 0 ? (
            <div style={{ display: "grid", gap: "0.8rem" }}>
              {order.refundEvents.map((event) => (
                <RefundEventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#9ca3af" }}>
              아직 기록된 환불 이벤트가 없습니다.
            </p>
          )}
        </div>

        {showVoidLedger && (
          <div className="ac-card" style={{ marginTop: "1rem" }}>
            <div className="ac-card-head">
              <div>
                <p className="ac-card-title">VOID 크레딧 ledger</p>
                <p className="ac-card-copy">이 주문이 지급한 크레딧 중 얼마나 사용됐고 얼마나 환불 차감됐는지 보여줍니다.</p>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.8rem",
                marginBottom: "0.9rem",
              }}
            >
              <div className="ac-card-sm">
                <p className="ac-kpi-label">총 지급</p>
                <p className="ac-kpi-value" style={{ fontSize: "1.2rem" }}>{fmtCredits(voidLedgerTotals.total)}</p>
              </div>
              <div className="ac-card-sm">
                <p className="ac-kpi-label">총 사용</p>
                <p className="ac-kpi-value" style={{ fontSize: "1.2rem" }}>{fmtCredits(voidLedgerTotals.consumed)}</p>
              </div>
              <div className="ac-card-sm">
                <p className="ac-kpi-label">환불 차감</p>
                <p className="ac-kpi-value" style={{ fontSize: "1.2rem" }}>{fmtCredits(voidLedgerTotals.refunded)}</p>
              </div>
              <div className="ac-card-sm">
                <p className="ac-kpi-label">잔여</p>
                <p className="ac-kpi-value" style={{ fontSize: "1.2rem" }}>{fmtCredits(voidLedgerTotals.remaining)}</p>
              </div>
            </div>

            {order.voidCreditLedger.length > 0 ? (
              <div style={{ display: "grid", gap: "0.8rem" }}>
                {order.voidCreditLedger.map((entry) => (
                  <VoidLedgerCard key={entry.id} entry={entry} />
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "0.82rem", color: "#9ca3af" }}>
                이 주문에는 연결된 VOID ledger row가 아직 없습니다.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}