"use client";

import { useActionState, useOptimistic, startTransition } from "react";
import { updateNotificationAction } from "../_actions/settingsActions";
import type { NotifActionState } from "../_actions/settingsActions";

type Prefs = { notifyDailyReading: boolean; notifyAnalysisDone: boolean };

function Toggle({
  id,
  label,
  checked,
  onToggle,
}: {
  id: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="settings-row settings-row--toggle">
      <span className="settings-row-label">{label}</span>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        className={`luna-toggle ${checked ? "luna-toggle-on" : "luna-toggle-off"}`}
        onClick={onToggle}
        aria-label={label}
      >
        <span className="luna-toggle-thumb" />
      </button>
    </div>
  );
}

export function NotificationToggles({ initialPrefs }: { initialPrefs: Prefs }) {
  const [, action] = useActionState<NotifActionState, FormData>(
    updateNotificationAction,
    null,
  );

  const [optimisticPrefs, setOptimisticPrefs] = useOptimistic(
    initialPrefs,
    (_current: Prefs, next: Prefs) => next,
  );

  function submitToggle(next: Prefs) {
    startTransition(() => {
      setOptimisticPrefs(next);
      const fd = new FormData();
      fd.set("notifyDailyReading", next.notifyDailyReading ? "1" : "0");
      fd.set("notifyAnalysisDone", next.notifyAnalysisDone ? "1" : "0");
      action(fd);
    });
  }

  return (
    <>
      <Toggle
        id="toggle-daily"
        label="일일 리딩"
        checked={optimisticPrefs.notifyDailyReading}
        onToggle={() =>
          submitToggle({
            ...optimisticPrefs,
            notifyDailyReading: !optimisticPrefs.notifyDailyReading,
          })
        }
      />
      <Toggle
        id="toggle-analysis"
        label="분석 완료 알림"
        checked={optimisticPrefs.notifyAnalysisDone}
        onToggle={() =>
          submitToggle({
            ...optimisticPrefs,
            notifyAnalysisDone: !optimisticPrefs.notifyAnalysisDone,
          })
        }
      />
    </>
  );
}
