import Link from "next/link";
import BackButton from "@/components/BackButton";
import BottomNav from "@/components/BottomNav";

const SIGNS = [
  { id: "aries",       ko: "양자리",      en: "Aries" },
  { id: "taurus",      ko: "황소자리",    en: "Taurus" },
  { id: "gemini",      ko: "쌍둥이자리",  en: "Gemini" },
  { id: "cancer",      ko: "게자리",      en: "Cancer" },
  { id: "leo",         ko: "사자자리",    en: "Leo" },
  { id: "virgo",       ko: "처녀자리",    en: "Virgo" },
  { id: "libra",       ko: "천칭자리",    en: "Libra" },
  { id: "scorpio",     ko: "전갈자리",    en: "Scorpio" },
  { id: "sagittarius", ko: "사수자리",    en: "Sagittarius" },
  { id: "capricorn",   ko: "염소자리",    en: "Capricorn" },
  { id: "aquarius",    ko: "물병자리",    en: "Aquarius" },
  { id: "pisces",      ko: "물고기자리",  en: "Pisces" },
] as const;

export default function ShopSignsPage() {
  return (
    <main className="lsp-screen">
      <div className="lss-wrap">

        {/* ── Top nav ── */}
        <header className="lss-topbar">
          <BackButton />
          <p className="lss-topbar-kicker">SHOP</p>
          <span className="lss-topbar-spacer" aria-hidden="true" />
        </header>

        {/* ── Title block ── */}
        <div className="lss-title-block">
          <p className="lss-kicker">GET TO KNOW THE SIGNS</p>
          <h1 className="lss-headline">별자리<br />알아보기</h1>
        </div>

        {/* ── 12 sign rows ── */}
        <div className="lss-sign-list" role="list">
          {SIGNS.map((sign) => (
            <Link
              key={sign.id}
              href={`/zodiac/${sign.id}`}
              className="lss-sign-row"
              role="listitem"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/luna/assets/costar/constellations/${sign.id === "scorpio" ? "scorpius" : sign.id === "capricorn" ? "capricornus" : sign.id}.svg`}
                alt=""
                width={36}
                height={36}
                className="lss-sign-row-img"
              />
              <div className="lss-sign-row-body">
                <span className="lss-sign-row-en">{sign.en}</span>
                <span className="lss-sign-row-ko">{sign.ko}</span>
              </div>
              <span className="lss-sign-row-arrow" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>

      </div>
      <BottomNav />
    </main>
  );
}
