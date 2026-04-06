"use client";

import { useState } from "react";

export default function NoteField() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => {
      setOpen(false);
      setSaved(false);
    }, 900);
  }

  return (
    <div className="luna-dr-note-block">
      <p
        className="luna-block-kicker"
        style={{ marginBottom: "0.38rem" }}
      >
        미래의 나에게
      </p>
      <p
        style={{
          margin: "0 0 0.78rem",
          fontSize: "0.84rem",
          lineHeight: 1.52,
          color: "rgba(20,21,22,0.56)",
          wordBreak: "keep-all",
        }}
      >
        오늘의 감각을 기록해두세요. 시간이 지나면 다시 읽게 됩니다.
      </p>

      {!open ? (
        <button
          type="button"
          className="luna-black-cta"
          onClick={() => setOpen(true)}
          style={{ width: "100%" }}
        >
          메모 남기기
        </button>
      ) : (
        <>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="오늘 자신에게 남기고 싶은 말..."
            rows={3}
            className="luna-dr-note-textarea"
            aria-label="미래의 나에게 남기는 메모"
            autoFocus
          />
          <button
            type="button"
            className="luna-black-cta"
            onClick={handleSave}
            disabled={saved}
            style={{ width: "100%" }}
          >
            {saved ? "저장됨" : "저장"}
          </button>
        </>
      )}
    </div>
  );
}
