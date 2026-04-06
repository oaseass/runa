"use client";

import { useActionState, useState } from "react";
import { changeUsernameAction } from "../_actions/settingsActions";
import type { UsernameActionState } from "../_actions/settingsActions";

const ERROR_MSG: Record<NonNullable<UsernameActionState>["error"] & string, string> = {
  "wrong-password": "비밀번호가 올바르지 않습니다.",
  "taken":          "이미 사용 중인 사용자명입니다.",
  "invalid":        "사용자명은 2–24자, 영문·숫자·한글·밑줄(_)만 사용 가능합니다.",
  "auth":           "세션이 만료됐습니다. 다시 로그인해 주세요.",
  "same":           "현재와 동일한 사용자명입니다.",
};

export function UsernameForm({ currentUsername }: { currentUsername: string }) {
  const [state, action, isPending] = useActionState<UsernameActionState, FormData>(
    changeUsernameAction,
    null,
  );
  const [open, setOpen] = useState(false);

  if (state?.success) {
    return (
      <div className="luna-settings-success">
        사용자명이 <strong>{state.newUsername}</strong>(으)로 변경됐습니다.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="luna-settings-row-link"
        onClick={() => setOpen(true)}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
      >
        <div className="luna-settings-row">
          <span className="luna-settings-row-label">사용자명 변경</span>
          <span className="luna-settings-row-right">
            <span className="luna-settings-row-value">{currentUsername}</span>
            <span className="luna-settings-row-chevron">›</span>
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className="luna-settings-inline-form">
      <div className="luna-settings-inline-form-header">
        <span className="luna-settings-inline-form-title">사용자명 변경</span>
        <button
          type="button"
          className="luna-settings-inline-form-close"
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
      </div>

      <form action={action}>
        <div className="luna-settings-form-field">
          <label className="luna-settings-form-label" htmlFor="new-username">
            새 사용자명
          </label>
          <input
            id="new-username"
            name="newUsername"
            type="text"
            className="luna-settings-form-input"
            placeholder={currentUsername}
            autoComplete="username"
            autoFocus
            maxLength={24}
          />
        </div>

        <div className="luna-settings-form-field">
          <label className="luna-settings-form-label" htmlFor="current-password">
            현재 비밀번호 확인
          </label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            className="luna-settings-form-input"
            placeholder="비밀번호 입력"
            autoComplete="current-password"
          />
        </div>

        {state?.error && (
          <p className="luna-settings-form-error">
            {ERROR_MSG[state.error] ?? "오류가 발생했습니다."}
          </p>
        )}

        <div className="luna-settings-form-actions">
          <button
            type="submit"
            className="luna-settings-form-submit"
            disabled={isPending}
          >
            {isPending ? "변경 중…" : "변경하기"}
          </button>
          <button
            type="button"
            className="luna-settings-form-cancel"
            onClick={() => setOpen(false)}
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
