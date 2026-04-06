"use client";

import { useState } from "react";

export default function FeedbackRow() {
  const [voted, setVoted] = useState<"up" | "down" | null>(null);

  return (
    <div className="luna-dr-feedback" aria-label="Feedback on today's reading">
      <p className="luna-dr-feedback-label">이 해석이 도움이 됐나요?</p>
      <div className="luna-dr-feedback-btns">
        <button
          type="button"
          className={
            voted === "up"
              ? "luna-dr-feedback-btn luna-dr-feedback-btn-active"
              : "luna-dr-feedback-btn"
          }
          onClick={() => setVoted(voted === "up" ? null : "up")}
          aria-pressed={voted === "up"}
          aria-label="도움이 됐어요"
        >
          ↑ 도움됨
        </button>
        <button
          type="button"
          className={
            voted === "down"
              ? "luna-dr-feedback-btn luna-dr-feedback-btn-active luna-dr-feedback-btn-neg"
              : "luna-dr-feedback-btn"
          }
          onClick={() => setVoted(voted === "down" ? null : "down")}
          aria-pressed={voted === "down"}
          aria-label="별로였어요"
        >
          ↓ 별로
        </button>
      </div>
    </div>
  );
}
