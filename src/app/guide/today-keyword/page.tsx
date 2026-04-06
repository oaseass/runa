import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/server/auth-session";
import { getOrComputeNatalChart } from "@/lib/server/chart-store";
import { getTodayInterpretation } from "@/lib/server/chart-store";
import BottomNav from "@/components/BottomNav";
import BackButton from "@/components/BackButton";

/* ── 영역 데이터 ─────────────────────────────────────────────────── */

const AREAS = [
  { num: 1,  label: "나",           desc: "자아상, 타인에게 주는 첫인상, 외모와 태도" },
  { num: 2,  label: "소유·자원",     desc: "나의 재원과 가치관, 안정감을 주는 것들" },
  { num: 3,  label: "소통·환경",     desc: "내가 아는 것과 일상적 환경, 형제자매와 친숙한 패턴" },
  { num: 4,  label: "가정·뿌리",     desc: "집, 가족, 가까운 관계, 과거와 그 영향" },
  { num: 5,  label: "창조·기쁨",     desc: "쾌락과 창의성, 자기표현, 즐거움" },
  { num: 6,  label: "루틴·봉사",     desc: "생산성, 봉사, 일상의 리듬과 건강" },
  { num: 7,  label: "관계·파트너십", desc: "헌신적 관계, 내가 세상에 불러들이는 것" },
  { num: 8,  label: "변환·공유",     desc: "타인의 자원, 통제 밖의 일, 변환과 위기" },
  { num: 9,  label: "확장·철학",     desc: "개방성, 철학, 문화 교류, 의식의 확장, 여행" },
  { num: 10, label: "커리어·유산",   desc: "공적 자아, 직업, 기억되고 싶은 방식" },
  { num: 11, label: "공동체·우정",   desc: "사회적 세계, 친구와 지인, 집단과의 관계" },
  { num: 12, label: "무의식·꿈",     desc: "무의식, 꿈, 환상, 은밀한 내면세계" },
];

const SIGN_KO: Record<string, string> = {
  Aries:"양자리", Taurus:"황소자리", Gemini:"쌍둥이자리", Cancer:"게자리",
  Leo:"사자자리", Virgo:"처녀자리", Libra:"천칭자리", Scorpio:"전갈자리",
  Sagittarius:"사수자리", Capricorn:"염소자리", Aquarius:"물병자리", Pisces:"물고기자리",
};

const SIGN_TRAIT: Record<string, string> = {
  Aries:       "대담하고 충동적으로",
  Taurus:      "느리고 감각적으로",
  Gemini:      "빠르고 다양하게",
  Cancer:      "직관적이고 보호적으로",
  Leo:         "대담하고 표현적으로",
  Virgo:       "꼼꼼하고 분석적으로",
  Libra:       "균형 잡히고 외교적으로",
  Scorpio:     "깊이 있고 강렬하게",
  Sagittarius: "자유롭고 철학적으로",
  Capricorn:   "체계적이고 목표 지향적으로",
  Aquarius:    "혁신적이고 독립적으로",
  Pisces:      "직관적이고 경계 없이",
};

const ORDINAL: Record<number, string> = {
  1:"1ST", 2:"2ND", 3:"3RD", 4:"4TH", 5:"5TH", 6:"6TH",
  7:"7TH", 8:"8TH", 9:"9TH", 10:"10TH", 11:"11TH", 12:"12TH",
};

/* ── Page (server component) ─────────────────────────────────────── */

export default async function TodayKeywordPage() {
  // Auth
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) redirect("/login");

  // Data — graceful fallback on error
  let natal = null;
  let interp = null;
  try {
    natal  = getOrComputeNatalChart(session.userId);
    interp = getTodayInterpretation(session.userId);
  } catch { /* show generic content */ }

  const keyword = interp?.keyPhrase ?? "오늘의 별이 말하는 한 가지.";
  const lede    = interp?.lede ?? null;

  const ascSign   = natal?.ascendant?.sign ?? null;
  const sunHouse  = natal?.planets.find(p => p.planet === "Sun")?.house ?? null;
  const sunSign   = natal?.planets.find(p => p.planet === "Sun")?.sign ?? null;
  const houses    = natal?.houses ?? [];

  // animated_transit_edu_{sign}.webp 매핑 (파일명은 소문자)
  const sunSignFile = sunSign ? `/luna/assets/costar/signs/animated_transit_edu_${sunSign.toLowerCase()}.webp` : null;

  // Spotlight: 1, 7, 10, 12영역
  const spotNums = [1, 7, 10, 12];
  const spotlight = spotNums.map(n => {
    const h = houses.find(h => h.house === n);
    return h ? { house: n, sign: h.sign } : null;
  }).filter(Boolean) as { house: number; sign: string }[];

  const house12 = houses.find(h => h.house === 12);

  // Inline SVG data
  const size = 260, cx = 130, cy = 130, R = 110, rInner = 48, rLabel = 88, rNum = 65;
  const segments = Array.from({ length: 12 }, (_, i) => {
    const startDeg = -90 + i * 30;
    const midDeg   = startDeg + 15;
    const s = (deg: number) => deg * (Math.PI / 180);
    const x1 = cx + R * Math.cos(s(startDeg));
    const y1 = cy + R * Math.sin(s(startDeg));
    const lx = cx + rLabel * Math.cos(s(midDeg));
    const ly = cy + rLabel * Math.sin(s(midDeg));
    const nx = cx + rNum * Math.cos(s(midDeg));
    const ny = cy + rNum * Math.sin(s(midDeg));
    const houseNum = i + 1;
    return { x1, y1, lx, ly, nx, ny, houseNum, midDeg };
  });

  return (
    <div className="cs-root cs-root--light">
      <header className="cs-detail-header">
        <BackButton className="cs-detail-back" label="←" />
        <span className="cs-detail-header-title">오늘의 키워드</span>
        <span />
      </header>

      <main className="cs-tk-main">

        {/* ── 1. 히어로 ── */}
        <section className="cs-tk-hero">
          {sunSignFile && (
            <div className="cs-tk-hero-anim">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sunSignFile}
                alt={sunSign ?? ""}
                width={200}
                height={200}
                className="cs-tk-hero-sign-img"
              />
            </div>
          )}
          <p className="cs-tk-eyebrow">TODAY&apos;S KEYWORD</p>
          <h1 className="cs-tk-headline">{keyword}</h1>
          {lede && <p className="cs-tk-lede">{lede}</p>}
        </section>

        {/* ── 2. 영역 휠 + 리스트 ── */}
        <section className="cs-tk-areas">
          <h2 className="cs-tk-section-title">
            12영역은 당신의 삶 각 부분을 상징합니다
          </h2>

          {/* SVG 휠 */}
          <div className="cs-tk-wheel-wrap">
            <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="cs-tk-wheel">
              {segments.map((seg, i) => (
                <g key={i}>
                  <line
                    x1={cx + rInner * Math.cos((seg.midDeg - 15) * Math.PI/180)}
                    y1={cy + rInner * Math.sin((seg.midDeg - 15) * Math.PI/180)}
                    x2={seg.x1} y2={seg.y1}
                    stroke="#ccc" strokeWidth="0.8"
                  />
                  <text x={seg.nx} y={seg.ny + 4} textAnchor="middle" fontSize="9" fill="#444" fontWeight="600">
                    {seg.houseNum}
                  </text>
                  <text x={seg.lx} y={seg.ly - 4} textAnchor="middle" fontSize="6" fill="#888">
                    {AREAS[seg.houseNum - 1]?.label.split("·")[0]}
                  </text>
                  {ascSign && seg.houseNum === 1 && (
                    <circle cx={seg.x1} cy={seg.y1} r="3" fill="#111" />
                  )}
                </g>
              ))}
              <circle cx={cx} cy={cy} r={R}      fill="none" stroke="#bbb" strokeWidth="1.2" />
              <circle cx={cx} cy={cy} r={rInner} fill="none" stroke="#bbb" strokeWidth="0.8" />
              {ascSign && (
                <text x={cx} y={cy + 5} textAnchor="middle" fontSize="8" fill="#111" fontWeight="700">
                  {SIGN_KO[ascSign] ?? ascSign}
                </text>
              )}
            </svg>
          </div>

          {/* 영역 리스트 */}
          <div className="cs-tk-area-list">
            {AREAS.map((a) => (
              <div key={a.num}
                className={sunHouse === a.num ? "cs-tk-area-row cs-tk-area-row--active" : "cs-tk-area-row"}>
                <span className="cs-tk-area-num">{ORDINAL[a.num]} AREA</span>
                <p className="cs-tk-area-desc">{a.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 3. How it&apos;s determined (다크) ── */}
        <section className="cs-tk-how">
          <p className="cs-tk-how-eyebrow">HOW IT&apos;S DETERMINED</p>
          <h2 className="cs-tk-how-title">어떻게 결정되는가</h2>
          <p className="cs-tk-how-body">
            영역은 당신이 태어났을 때 동쪽 지평선에 떠오른 별자리,{" "}
            <strong>탄생점</strong>에 의해 결정됩니다. 탄생점이 1영역의 경계가 되고,
            거기서부터 반시계 방향으로 12영역이 나뉩니다.
          </p>

          <div className="cs-tk-how-diagram">
            <p className="cs-tk-how-diag-label cs-tk-how-diag-label--top">바로 위</p>
            <svg viewBox="0 0 200 120" width="200" height="120">
              <line x1="0" y1="60" x2="200" y2="60" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3 3" />
              <path d="M 10 60 Q 100 5 190 60" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
              <path d="M 10 60 Q 100 115 190 60" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
              <circle cx="190" cy="60" r="4" fill="white" opacity="0.9" />
              <circle cx="100" cy="52" r="5" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" />
              <line x1="100" y1="57" x2="100" y2="75" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" />
              <line x1="100" y1="63" x2="92"  y2="70" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" />
              <line x1="100" y1="63" x2="108" y2="70" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" />
              <line x1="100" y1="75" x2="95"  y2="84" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" />
              <line x1="100" y1="75" x2="105" y2="84" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" />
              {([30,20,55,12,140,18,165,30,25,40] as number[]).reduce<number[][]>((acc, _, i, arr) => {
                if (i % 2 === 0) acc.push([arr[i], arr[i+1]]);
                return acc;
              }, []).map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r="1.5" fill="white" opacity="0.6" />
              ))}
              <text x="175" y="55" fontSize="7" fill="rgba(255,255,255,0.7)">탄생점</text>
            </svg>
            <p className="cs-tk-how-diag-label">동쪽 지평선</p>
          </div>

          <p className="cs-tk-how-body cs-tk-how-body--sub">
            하늘 전체는 지평선 위아래로 나뉘고, 12개의 기준점을 사용해 12영역으로 분할됩니다.
          </p>

          {/* 보조 휠 */}
          <div className="cs-tk-how-wheel-wrap">
            <svg viewBox="0 0 200 200" width="200" height="200">
              <circle cx="100" cy="100" r="85" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <circle cx="100" cy="100" r="40" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
              {Array.from({ length: 12 }, (_, i) => {
                const deg = -90 + i * 30;
                const rad = deg * (Math.PI / 180);
                const x1 = 100 + 40 * Math.cos(rad), y1 = 100 + 40 * Math.sin(rad);
                const x2 = 100 + 85 * Math.cos(rad), y2 = 100 + 85 * Math.sin(rad);
                const mx = 100 + 63 * Math.cos((deg + 15) * Math.PI/180);
                const my = 100 + 63 * Math.sin((deg + 15) * Math.PI/180);
                return (
                  <g key={i}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
                    <text x={mx} y={my+3} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.55)">{i+1}</text>
                  </g>
                );
              })}
              <text x="100" y="103" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.5)">바로 위</text>
              <text x="14" y="103" textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.6)">탄생점</text>
            </svg>
          </div>
        </section>

        {/* ── 4. What they say about you ── */}
        <section className="cs-tk-about">
          <p className="cs-tk-eyebrow">WHAT THEY SAY ABOUT YOU</p>
          <h2 className="cs-tk-section-title">당신의 영역에 대해</h2>
          <p className="cs-tk-about-body">
            태어날 때 각 영역에 있던 별자리가 그 영역에 대한 당신의 접근 방식을 묘사합니다.
          </p>

          {natal ? (
            <>
              {spotlight.map(h => (
                <div key={h.house} className="cs-tk-house-card">
                  <p className="cs-tk-house-num">{h.house}영역 — {AREAS[h.house-1]?.label}</p>
                  <p className="cs-tk-house-sign">{SIGN_KO[h.sign] ?? h.sign}의 지배를 받음</p>
                  <p className="cs-tk-house-trait">
                    「{SIGN_TRAIT[h.sign] ?? h.sign}」 접근하는 방식
                  </p>
                </div>
              ))}

              {house12 && (
                <div className="cs-tk-quote-block">
                  <p className="cs-tk-quote-label">나의 12영역은 {SIGN_KO[house12.sign] ?? house12.sign}의 지배를 받음</p>
                  <blockquote className="cs-tk-quote">
                    &ldquo;무의식과 꿈에 {SIGN_TRAIT[house12.sign] ?? house12.sign} 접근합니다.&rdquo;
                  </blockquote>
                </div>
              )}
            </>
          ) : (
            <p className="cs-tk-about-body" style={{ color:"rgba(0,0,0,0.35)" }}>
              출생 정보를 먼저 입력해주세요.
            </p>
          )}

          <p className="cs-tk-about-body cs-tk-about-body--note">
            영역은 또한 당신의 별 지도에서 행성들에 추가적인 의미를 부여합니다.
          </p>

          <Link href="/store" className="cs-tk-cta">
            별 지도 전체 해석 보기 →
          </Link>
        </section>

      </main>
      <BottomNav />
    </div>
  );
}
