import Link from "next/link";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import { listConnections } from "@/lib/server/connection-store";
import { listFriends } from "@/lib/server/friend-store";
import BackButton from "@/components/BackButton";
import ContactDiscovery from "@/components/ContactDiscovery";
import type { NatalChart } from "@/lib/astrology/types";
import { SIGN_KO } from "@/lib/astrology/interpret";

export default async function ErosSelectPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("luna_auth")?.value;
  const claims = token ? verifySessionToken(token) : null;

  type Friend = { id: string; name: string; sunSign: string; moonSign: string };
  let friends: Friend[] = [];
  let erosFriends: { id: string; username: string }[] = [];

  if (claims) {
    // LUNA eros partners added via contact discovery
    erosFriends = (await listFriends(claims.userId, "eros")).map((f) => ({
      id: f.userId,
      username: f.username,
    }));

    const rows = await listConnections(claims.userId);
    friends = rows.map((row) => {
      let sunSign = "—";
      let moonSign = "—";
      if (row.chartJson) {
        try {
          const chart = JSON.parse(row.chartJson) as NatalChart;
          const sun = chart.planets.find((p) => p.planet === "Sun");
          const moon = chart.planets.find((p) => p.planet === "Moon");
          if (sun) sunSign = SIGN_KO[sun.sign] ?? sun.sign;
          if (moon) moonSign = SIGN_KO[moon.sign] ?? moon.sign;
        } catch {
          // ignore
        }
      }
      return { id: row.id, name: row.name, sunSign, moonSign };
    });
  }

  return (
    <main className="cs-eros-main">
      <BackButton />

      <header className="cs-eros-header">
        <h1 className="cs-eros-title">Eros 파트너를<br />선택하세요</h1>
      </header>

      <section className="cs-eros-notices">
        <p className="cs-eros-notice">
          초대를 보내기 전까지 상대방에게 알림이 가지 않습니다.
        </p>
        <p className="cs-eros-notice">
          Eros를 구독한 후 초대장을 보낼 수 있습니다.
        </p>
        <p className="cs-eros-notice cs-eros-notice--muted">
          현재 커스텀 프로필은 Eros 파트너로 선택할 수 없습니다.
        </p>
      </section>

      {/* ── LUNA 에로스 파트너 (연락처 기반) ─── */}
      <section className="cs-eros-section">
        <h2 className="cs-eros-section-title">LUNA 에로스 파트너</h2>
        {erosFriends.length > 0 && (
          <ul className="cs-eros-friends" style={{ marginBottom: "0.75rem" }}>
            {erosFriends.map((f) => (
              <li key={f.id} className="cs-eros-friend-row">
                <div className="cs-eros-friend-info">
                  <span className="cs-eros-friend-name">@{f.username}</span>
                  <span className="cs-eros-friend-signs">LUNA 회원</span>
                </div>
                <button className="cs-eros-select-btn" type="button">
                  선택
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* ContactDiscovery: 연락처에서 LUNA 회원 파트너 찾기 */}
        {claims && <ContactDiscovery type="eros" />}
      </section>

      <section className="cs-eros-section">
        <h2 className="cs-eros-section-title">내 친구</h2>

        {friends.length === 0 ? (
          <div className="cs-eros-empty">
            <p>연결된 친구가 없습니다.</p>
            <Link href="/connections/add" className="cs-eros-add-link">
              차트 연결하기 →
            </Link>
          </div>
        ) : (
          <ul className="cs-eros-friends">
            {friends.map((f) => (
              <li key={f.id} className="cs-eros-friend-row">
                <div className="cs-eros-friend-info">
                  <span className="cs-eros-friend-name">{f.name}</span>
                  <span className="cs-eros-friend-signs">
                    {f.sunSign} · {f.moonSign}
                  </span>
                </div>
                <button className="cs-eros-select-btn" type="button">
                  선택
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}