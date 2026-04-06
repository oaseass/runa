import Link from "next/link";

export default async function PaymentFailPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; message?: string; orderId?: string }>;
}) {
  const params = await searchParams;
  const code = params.code ?? "UNKNOWN";
  const message = params.message
    ? decodeURIComponent(params.message)
    : "결제 중 오류가 발생했습니다.";

  return (
    <main className="screen luna-article-screen">
      <article className="luna-article-wrap">
        <header style={{ marginBottom: "2rem" }}>
          <p className="luna-article-kicker">결제 실패</p>
          <h1
            className="luna-article-headline"
            style={{ fontSize: "1.4rem", marginBottom: "0.5rem" }}
          >
            결제가 완료되지 않았습니다
          </h1>
          <p style={{ fontSize: "0.875rem", color: "rgba(0,0,0,0.5)", lineHeight: 1.6 }}>
            {message}
          </p>
        </header>

        <section className="luna-article-section">
          <div className="luna-settings-group">
            <div className="luna-settings-row">
              <span className="luna-settings-row-label">오류 코드</span>
              <span className="luna-settings-row-value" style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                {code}
              </span>
            </div>
          </div>
        </section>

        <section className="luna-article-section">
          <p style={{ fontSize: "0.8rem", color: "rgba(0,0,0,0.45)", lineHeight: 1.7 }}>
            카드사 또는 결제 수단 문제일 수 있습니다. 다른 결제 수단으로 다시
            시도해 보세요. 문제가 계속되면 고객센터로 문의해 주세요.
          </p>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1.5rem" }}>
          <Link
            href="/store"
            className="luna-settings-form-submit"
            style={{ display: "block", textAlign: "center", padding: "0.75rem 1rem", textDecoration: "none" }}
          >
            스토어로 돌아가기
          </Link>
          <Link
            href="/home"
            className="luna-settings-form-cancel"
            style={{ display: "block", textAlign: "center", padding: "0.75rem 1rem", textDecoration: "none" }}
          >
            홈으로
          </Link>
        </div>
      </article>
    </main>
  );
}
