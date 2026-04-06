import Link from "next/link";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/server/auth-session";
import BottomNav from "@/components/BottomNav";
import BackButton from "@/components/BackButton";
import { listConnections } from "@/lib/server/connection-store";
import { listFriends } from "@/lib/server/friend-store";
import { SIGN_KO } from "@/lib/astrology/interpret";
import type { NatalChart } from "@/lib/astrology/types";
import ContactDiscovery from "@/components/ContactDiscovery";

type ConnectionCardProps = {
  id: string;
  name: string;
  sunSign: string;
  moonSign: string;
  birthDate: string;
  timeKnown: boolean;
};

function ConnectionCard({ id, name, sunSign, moonSign, birthDate, timeKnown }: ConnectionCardProps) {
  const [year, month, day] = birthDate.split("-");
  const displayDate = `${year}. ${parseInt(month)}. ${parseInt(day)}`;

  return (
    <Link href={`/connections/insight/${id}`} className="luna-conn-card">
      <div className="luna-conn-card-top">
        <span className="luna-conn-card-name">{name}</span>
        {!timeKnown && (
          <span className="luna-conn-card-note">시간 미상</span>
        )}
      </div>
      <div className="luna-conn-card-signs">
        <span className="luna-conn-card-sign">{sunSign}</span>
        <span className="luna-conn-card-sep">×</span>
        <span className="luna-conn-card-sign">{moonSign}</span>
      </div>
      <p className="luna-conn-card-date">{displayDate}</p>
    </Link>
  );
}

export default async function ConnectionsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("luna_auth")?.value;
  const claims = token ? verifySessionToken(token) : null;

  let connections: ConnectionCardProps[] = [];
  let lunaFriends: { id: string; username: string }[] = [];

  if (claims) {
    // LUNA friends (user-to-user, contact-based)
    lunaFriends = listFriends(claims.userId, "friend").map((f) => ({
      id: f.userId,
      username: f.username,
    }));

    const rows = listConnections(claims.userId);
    connections = rows.map((row) => {
      let sunSign = "—";
      let moonSign = "—";
      if (row.chartJson) {
        try {
          const chart = JSON.parse(row.chartJson) as NatalChart;
          const sun  = chart.planets.find((p) => p.planet === "Sun");
          const moon = chart.planets.find((p) => p.planet === "Moon");
          if (sun)  sunSign  = SIGN_KO[sun.sign]  ?? sun.sign;
          if (moon) moonSign = SIGN_KO[moon.sign] ?? moon.sign;
        } catch {
          // Ignore parse error
        }
      }
      return {
        id: row.id,
        name: row.name,
        sunSign,
        moonSign,
        birthDate: row.birthDate,
        timeKnown: row.timeKnown,
      };
    });
  }

  const hasConnections = connections.length > 0;

  return (
    <main className="screen luna-editorial-screen" aria-label="Connections">
      <section className="luna-editorial-wrap" aria-label="Connections content">
        <BackButton />
        <header className="luna-editorial-header">
          <div className="luna-editorial-meta-row">
            <p className="luna-mini-label">연결</p>
          </div>
          <h1 className="luna-editorial-headline">관계는 패턴으로 읽힙니다.</h1>
          <p className="luna-editorial-support">
            두 사람의 별 지도를 겹쳐 보면 관계의 패턴이 드러납니다.
          </p>
        </header>

        {/* ── LUNA 친구 (연락처 기반 매칭) ─── */}
        <section style={{ marginBottom: "1.5rem" }}>
          <p style={{ fontSize: "0.68rem", letterSpacing: "0.1em", color: "#4b5563", textTransform: "uppercase", marginBottom: "0.6rem" }}>
            LUNA 친구
          </p>
          {lunaFriends.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.75rem" }}>
              {lunaFriends.map((f) => (
                <span
                  key={f.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 99,
                    padding: "0.3rem 0.7rem",
                    fontSize: "0.78rem",
                    color: "#9ca3af",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4f46e5", display: "inline-block", flexShrink: 0 }} />
                  @{f.username}
                </span>
              ))}
            </div>
          )}
          {/* Client component handles permission + contact reading + matching */}
          {claims && <ContactDiscovery type="friend" />}
        </section>

        {/* ── 차트 연결 목록 ─── */}
        <p style={{ fontSize: "0.68rem", letterSpacing: "0.1em", color: "#4b5563", textTransform: "uppercase", marginBottom: "0.6rem" }}>
          차트 연결
        </p>
        {hasConnections ? (
          <div className="luna-conn-list" aria-label="Connection list">
            {connections.map((c) => (
              <ConnectionCard key={c.id} {...c} />
            ))}
          </div>
        ) : (
          <div className="luna-connections-empty" aria-label="Empty state">
            <p className="luna-connections-empty-label">연결된 사람</p>
            <p className="luna-connections-empty-note">두 사람의 별 지도가 만나면 관계의 결이 드러납니다.</p>
          </div>
        )}

        <section className="luna-editorial-actions" aria-label="Connection actions">
          <Link href="/connections/add" className="luna-black-cta">
            차트 연결하기
          </Link>
        </section>

        <BottomNav />
      </section>
    </main>
  );
}
