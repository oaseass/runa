"use client";

import { useEffect, useState } from "react";

type AuthSyncPreview = {
  id: string;
  username: string;
  phoneNumber: string;
  createdAt: string;
  issue: "conflict" | "repairable";
  detail: string;
};

type AuthStorageSyncStatus = {
  localUsers: number;
  externalUsers: number;
  syncedUsers: number;
  repairableUsers: number;
  conflictUsers: number;
  repairablePreview: AuthSyncPreview[];
  conflictPreview: AuthSyncPreview[];
};

type AuthStorageBackfillReport = {
  localUsers: number;
  externalUsersBefore: number;
  syncedUsers: number;
  repairedUsers: number;
  conflictUsers: number;
  repairedPreview: AuthSyncPreview[];
  conflictPreview: AuthSyncPreview[];
};

function formatKoreanDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function AdminAuthStoragePanel() {
  const [status, setStatus] = useState<AuthStorageSyncStatus | null>(null);
  const [report, setReport] = useState<AuthStorageBackfillReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadStatus() {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const response = await fetch("/api/admin/auth-storage/status", { cache: "no-store" });
      const data = (await response.json()) as AuthStorageSyncStatus & { error?: string };

      if (!response.ok) {
        setErrorMessage(data.error ?? "인증 저장소 상태를 읽지 못했어요.");
        return;
      }

      setStatus(data);
    } catch {
      setErrorMessage("인증 저장소 상태를 읽지 못했어요.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function handleBackfill() {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      setReport(null);

      const response = await fetch("/api/admin/auth-storage/backfill", {
        method: "POST",
      });
      const data = (await response.json()) as AuthStorageBackfillReport & { error?: string };

      if (!response.ok) {
        setErrorMessage(data.error ?? "인증 저장소 동기화에 실패했어요.");
        return;
      }

      setReport(data);
      await loadStatus();
    } catch {
      setErrorMessage("인증 저장소 동기화에 실패했어요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const toneClass = status && status.repairableUsers === 0 && status.conflictUsers === 0
    ? "ac-badge-green"
    : status && status.conflictUsers > 0
      ? "ac-badge-red"
      : "ac-badge-yellow";
  const toneLabel = status && status.repairableUsers === 0 && status.conflictUsers === 0
    ? "정상"
    : status && status.conflictUsers > 0
      ? "충돌 있음"
      : "동기화 필요";

  return (
    <div className="ac-card" style={{ marginTop: "1.25rem" }}>
      <div className="ac-card-head">
        <div>
          <p className="ac-section-title">인증 저장소 동기화</p>
          <h2 className="ac-card-title">SQLite와 Upstash 계정 상태 점검</h2>
          <p className="ac-card-copy">
            로컬 DB에만 있고 외부 인증 저장소에 빠진 계정이 있는지 확인하고, 필요하면 한 번에 동기화합니다.
          </p>
        </div>
        <div className="ac-card-actions">
          <span className={`ac-badge ${toneClass}`}>{isLoading ? "확인 중" : toneLabel}</span>
          <button
            type="button"
            className="ac-btn"
            onClick={handleBackfill}
            disabled={isLoading || isSubmitting}
            style={isLoading || isSubmitting ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
          >
            {isSubmitting ? "동기화 중..." : "누락 계정 동기화"}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="ac-alert" style={{ marginBottom: "0.9rem" }}>
          <span style={{ color: "#dc2626", fontWeight: 700 }}>!</span>
          <span style={{ color: "#7f1d1d", fontSize: "0.8rem" }}>{errorMessage}</span>
        </div>
      ) : null}

      <div className="ac-kpi-grid-3" style={{ marginBottom: "1rem" }}>
        <div className="ac-card-sm ac-kpi-panel">
          <p className="ac-kpi-label">로컬 사용자</p>
          <p className="ac-kpi-value" style={{ fontSize: "1.2rem" }}>{status?.localUsers ?? "—"}</p>
          <p className="ac-kpi-sub">SQLite 기준</p>
        </div>
        <div className="ac-card-sm ac-kpi-panel">
          <p className="ac-kpi-label">외부 사용자</p>
          <p className="ac-kpi-value" style={{ fontSize: "1.2rem" }}>{status?.externalUsers ?? "—"}</p>
          <p className="ac-kpi-sub">Upstash 기준</p>
        </div>
        <div className="ac-card-sm ac-kpi-panel">
          <p className="ac-kpi-label">정상 동기화</p>
          <p className="ac-kpi-value" style={{ fontSize: "1.2rem" }}>{status?.syncedUsers ?? "—"}</p>
          <p className="ac-kpi-sub">
            누락 {status?.repairableUsers ?? "—"} · 충돌 {status?.conflictUsers ?? "—"}
          </p>
        </div>
      </div>

      <div className="ac-kpi-grid-2" style={{ marginBottom: report ? "1rem" : 0 }}>
        <div className="ac-card-sm">
          <p className="ac-section-title">재동기화 필요 계정</p>
          {status?.repairablePreview.length ? (
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead>
                  <tr>
                    <th>아이디</th>
                    <th>상세</th>
                    <th>생성일</th>
                  </tr>
                </thead>
                <tbody>
                  {status.repairablePreview.map((entry) => (
                    <tr key={entry.id}>
                      <td className="ac-mono">@{entry.username}</td>
                      <td>{entry.detail}</td>
                      <td>{formatKoreanDate(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ac-kpi-sub">누락된 계정이 없습니다.</p>
          )}
        </div>

        <div className="ac-card-sm">
          <p className="ac-section-title">충돌 계정</p>
          {status?.conflictPreview.length ? (
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead>
                  <tr>
                    <th>아이디</th>
                    <th>상세</th>
                    <th>생성일</th>
                  </tr>
                </thead>
                <tbody>
                  {status.conflictPreview.map((entry) => (
                    <tr key={entry.id}>
                      <td className="ac-mono">@{entry.username}</td>
                      <td>{entry.detail}</td>
                      <td>{formatKoreanDate(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ac-kpi-sub">현재 확인된 충돌은 없습니다.</p>
          )}
        </div>
      </div>

      {report ? (
        <div className="ac-card-sm" style={{ background: "#f9fafb" }}>
          <p className="ac-section-title">마지막 동기화 결과</p>
          <p className="ac-kpi-sub" style={{ marginTop: 0 }}>
            동기화 전 외부 사용자 {report.externalUsersBefore}명, 새로 복구 {report.repairedUsers}명, 충돌 {report.conflictUsers}명.
          </p>
          {report.repairedPreview.length ? (
            <p className="ac-kpi-sub" style={{ marginTop: "0.45rem" }}>
              복구된 계정: {report.repairedPreview.map((entry) => `@${entry.username}`).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}