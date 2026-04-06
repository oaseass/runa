"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

// ── Types ─────────────────────────────────────────────────────────────────────
type BestDay = {
  date: string;       // "3월 30일" (from API label)
  label: string;      // "Best day for 관계"
  score: number;
  topDomain: string | null;
  tone: string;
};

// ── Domain → icon map ─────────────────────────────────────────────────────────
const DOMAIN_ICON: Record<string, string> = {
  "관계": "♡",
  "루틴·일": "★",
  "사고·표현": "💬",
  "감정·내면": "✦",
};

function domainIcon(d: string | null): string {
  if (!d) return "◇";
  return DOMAIN_ICON[d] ?? "◇";
}

function domainSub(d: string | null, tone: string): string {
  if (tone === "challenge") return "오늘은 조심하는 하루 — 긴장이 감지됩니다.";
  if (d === "관계") return "인연이 활발하실 수 있는 날.";
  if (d === "루횅·일") return "일과 리듬이 잘 맞는 날.";
  if (d === "사고·표현") return "말과 생각이 더 잘 통하는 날.";
  if (d === "감정·내면") return "나를 올바르게 이해할 수 있는 날.";
  return "흐름이 평소보다 좀 더 라쿤는 날.";
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function BestDaysPage() {
  const router = useRouter();
  const [bestDays, setBestDays] = useState<BestDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/chart/best-days?count=10&daysAhead=45", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { success: boolean; bestDays?: BestDay[] } | null) => {
        if (j?.success && j.bestDays) setBestDays(j.bestDays);
      })
      .catch(() => { /* silent */ })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="cs-root cs-root--light">
      <header className="cs-detail-header">
        <button type="button" onClick={() => router.back()} className="cs-detail-back">←</button>
        <span className="cs-detail-header-title">베스트 데이</span>
        <span />
      </header>

      <main className="cs-bd-main">
        <p className="cs-bd-eyebrow">다가오는 날들</p>

        {isLoading ? (
          <div className="cs-bd-list">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="cs-bd-row" style={{ opacity: 0.3 }}>
                <span className="cs-bd-icon">◇</span>
                <div className="cs-bd-body">
                  <p className="cs-bd-title">불러오는 중…</p>
                  <p className="cs-bd-sub">&nbsp;</p>
                </div>
                <span className="cs-bd-date">&nbsp;</span>
              </div>
            ))}
          </div>
        ) : bestDays.length === 0 ? (
          <div style={{ padding: "2rem 0", textAlign: "center" }}>
            <p style={{ fontSize: "0.85rem", color: "#888" }}>
              별 지도를 등록하면 나만의 최적 날을 계산해드립니다.
            </p>
            <Link href="/start" style={{ display: "block", marginTop: "1rem", fontSize: "0.8rem", color: "#555" }}>
              별 지도 등록하기 →
            </Link>
          </div>
        ) : (
          <div className="cs-bd-list">
            {bestDays.map((item, i) => (
              <div key={i} className="cs-bd-row">
                <span className="cs-bd-icon">{domainIcon(item.topDomain)}</span>
                <div className="cs-bd-body">
                  <p className="cs-bd-title">{item.label}</p>
                  <p className="cs-bd-sub">{domainSub(item.topDomain, item.tone)}</p>
                </div>
                <span className="cs-bd-date">{item.date}</span>
              </div>
            ))}
          </div>
        )}

        <Link href="/calendar" className="cs-bd-cal-link">← 달력</Link>
      </main>

      <BottomNav />
    </div>
  );
}
