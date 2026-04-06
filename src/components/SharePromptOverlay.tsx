"use client";

import { useEffect, useState, useCallback } from "react";

/** Call this from any share/save action to show the prompt. */
export function triggerSharePrompt() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("luna:share-prompt"));
  }
}

const AUTO_DISMISS_MS = 4000;

export default function SharePromptOverlay() {
  const [visible, setVisible] = useState(false);

  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);

  useEffect(() => {
    window.addEventListener("luna:share-prompt", show);
    return () => window.removeEventListener("luna:share-prompt", show);
  }, [show]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(hide, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [visible, hide]);

  if (!visible) return null;

  return (
    <div className="luna-share-prompt" role="status" aria-live="polite">
      <span className="luna-share-prompt-text">
        SNS에 공유하시나요?&nbsp;
        <span className="luna-share-prompt-handle">@luna_official</span>
        &nbsp;태그해주세요!
      </span>
      <button
        className="luna-share-prompt-close"
        aria-label="닫기"
        onClick={hide}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
