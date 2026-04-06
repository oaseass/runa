"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

export default function CrushReportPage() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="cs-root cs-root--light">
      <header className="cs-detail-header">
        <button type="button" onClick={() => router.back()} className="cs-detail-back">←</button>
        <span className="cs-detail-header-title">CRUSH REPORT</span>
        <span />
      </header>

      <main className="cs-crush-main">
        {/* Visual */}
        <div className="cs-crush-visual" aria-hidden="true">
          <div className="cs-crush-card cs-crush-card--1" />
          <div className="cs-crush-card cs-crush-card--2" />
          <div className="cs-crush-card cs-crush-card--3" />
        </div>

        {/* Title */}
        <h1 className="cs-crush-title">Crush Report</h1>
        <p className="cs-crush-body">
          당신과 상대 사이에 어떤 끌림과 긴장이 오가는지 읽어드립니다.
          두 사람의 별 지도가 만들어내는 패턴을 심층 리포트로 받아보세요.
        </p>

        {/* CTA */}
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="cs-crush-choose-btn"
        >
          상대 선택하기
        </button>
      </main>

      {/* Payment modal */}
      {showModal && (
        <div className="cs-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="cs-modal" onClick={(e) => e.stopPropagation()}>
            <p className="cs-modal-title">CRUSH REPORT</p>
            <p className="cs-modal-you">나 + ?</p>
            <p className="cs-modal-sub">관심 있는 사람과의 리포트</p>
            <p className="cs-modal-price">
              일회 결제 <strong>₩7,500</strong>
            </p>
            <Link href="/eros/select" className="cs-modal-confirm-btn">
              리포트 만들기
            </Link>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="cs-modal-cancel-btn"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}