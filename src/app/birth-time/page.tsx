"use client";

import { useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveBirthTimeSelection } from "@/lib/onboarding/birth-time-storage";

type DialMode = "hour" | "minute";

function polarToPosition(index: number, total: number, radius: number) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;

  return {
    left: `calc(50% + ${Math.round(Math.cos(angle) * radius * 100) / 100}px)`,
    top: `calc(50% + ${Math.round(Math.sin(angle) * radius * 100) / 100}px)`,
  };
}

/** Convert 1-12 dial hour + AM/PM to 24-hour integer. */
function to24Hour(dialHour: number, meridiem: "AM" | "PM"): number {
  if (meridiem === "AM") return dialHour === 12 ? 0 : dialHour;
  return dialHour === 12 ? 12 : dialHour + 12;
}

function BirthTimePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get("edit") === "1";
  const [birthDate, setBirthDate] = useState<string>("");   // YYYY-MM-DD
  const [mode, setMode] = useState<DialMode>("hour");
  const [hour, setHour] = useState<number | null>(null);    // 1-12 dial
  const [minute, setMinute] = useState<number | null>(null);
  const [meridiem, setMeridiem] = useState<"AM" | "PM">("AM");
  const [isSaving, setIsSaving] = useState(false);

  const dialValues = useMemo(() => {
    if (mode === "hour") {
      return Array.from({ length: 12 }, (_, idx) => idx + 1);
    }

    return Array.from({ length: 12 }, (_, idx) => idx * 5);
  }, [mode]);

  const canContinue = !!birthDate && hour !== null && minute !== null;

  const selectedTime =
    hour === null || minute === null
      ? "--:--"
      : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${meridiem}`;

  function handlePick(value: number) {
    if (mode === "hour") {
      setHour(value);
      setMode("minute");
      return;
    }

    setMinute(value);
  }

  function isActive(value: number) {
    if (mode === "hour") {
      return hour === value;
    }

    return minute === value;
  }

  function handleContinue() {
    if (!canContinue || isSaving) {
      return;
    }

    const hour24 = to24Hour(hour as number, meridiem);
    const formatted = `${birthDate} ${String(hour24).padStart(2, "0")}:${String(minute as number).padStart(2, "0")}`;

    saveBirthTimeSelection({ birthDate, hour: hour24, minute: minute as number, formatted });

    if (isEditMode) {
      void (async () => {
        try {
          setIsSaving(true);
          await fetch("/api/profile/birth-data", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ birthDate, hour: hour24, minute: minute as number, formatted }),
          });
        } finally {
          setIsSaving(false);
          router.push("/profile/chart");
        }
      })();
      return;
    }

    router.push("/birth-place");
  }

  function handleReturnToStart() {
    if (isSaving) {
      return;
    }

    router.push(isEditMode ? "/profile/chart" : "/start");
  }

  return (
    <main className="screen screen-dark">
      <section className="step-wrap step-wrap-dark" aria-label="Birth time step">
        <button
          type="button"
          onClick={handleReturnToStart}
          style={{
            alignSelf: "flex-start",
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "rgba(255,255,255,0.88)",
            borderRadius: "999px",
            padding: "0.58rem 0.95rem",
            fontSize: "0.74rem",
            letterSpacing: "0.04em",
            marginBottom: "1rem",
            cursor: "pointer",
          }}
          aria-label={isEditMode ? "차트로 돌아가기" : "처음으로 돌아가기"}
        >
          {isEditMode ? "← 차트로 돌아가기" : "← 처음으로 돌아가기"}
        </button>

        <p className="dark-brand">LUNA</p>
        <h1 className="step-title step-title-strong">태어난 날짜와 시간</h1>

        <div style={{ width: "100%", marginBottom: "0.75rem" }}>
          <label
            htmlFor="birth-date-input"
            style={{ display: "block", fontSize: "0.7rem", letterSpacing: "0.1em", opacity: 0.52, marginBottom: "0.4rem" }}
          >
            생년월일
          </label>
          <input
            id="birth-date-input"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            max={new Date().toISOString().split("T")[0]}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.18)",
              color: "inherit",
              fontSize: "1rem",
              padding: "0.4rem 0",
              outline: "none",
              colorScheme: "dark",
            }}
          />
        </div>

        <div className="time-layout">
          <div className="time-header-row time-header-row-dark" role="tablist" aria-label="Time mode">
            <button
              type="button"
              onClick={() => setMode("hour")}
              className={`time-mode time-mode-dark ${mode === "hour" ? "time-mode-dark-active" : ""}`}
            >
              시
            </button>
            <button
              type="button"
              onClick={() => setMode("minute")}
              className={`time-mode time-mode-dark ${mode === "minute" ? "time-mode-dark-active" : ""}`}
              disabled={hour === null}
            >
              분
            </button>
            <button
              type="button"
              onClick={() => setMeridiem(meridiem === "AM" ? "PM" : "AM")}
              className={`time-mode time-mode-dark ${meridiem === "PM" ? "time-mode-dark-active" : ""}`}
              aria-label="Toggle AM/PM"
            >
              {meridiem}
            </button>
          </div>

          <div className="clock-shell clock-shell-dark" aria-label="Clock time selector">
            <div className="clock-center-time clock-center-time-dark">{selectedTime}</div>
            {dialValues.map((value, index) => {
              const coords = polarToPosition(index, dialValues.length, 122);
              const active = isActive(value);

              return (
                <button
                  key={`${mode}-${value}`}
                  type="button"
                  onClick={() => handlePick(value)}
                  className={`clock-dot clock-dot-dark ${active ? "clock-dot-dark-active" : ""}`}
                  style={coords}
                  aria-label={`${mode} ${value}`}
                >
                  {mode === "minute" ? String(value).padStart(2, "0") : value}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          className="arrow-cta arrow-cta-dark"
          aria-label="Continue to birth place"
          onClick={handleContinue}
          disabled={!canContinue || isSaving}
        >
          {isSaving ? "…" : "→"}
        </button>
      </section>
    </main>
  );
}


export default function BirthTimePage() {
  return <Suspense><BirthTimePageInner /></Suspense>;
}
