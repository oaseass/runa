"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import { addConnectionAction } from "../_actions/addConnection";

/** crypto.randomUUID() requires secure context; fallback for HTTP/LAN dev */
function randomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type PlaceSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

export default function ConnectionsAddPage() {
  const [name, setName]           = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");

  // Location state
  const [locationQuery, setLocationQuery]     = useState("");
  const [suggestions, setSuggestions]         = useState<PlaceSuggestion[]>([]);
  const [selectedPlace, setSelectedPlace]     = useState<{
    label: string;
    latitude: number;
    longitude: number;
    timezone: string;
  } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionToken  = useRef(randomUUID());

  // Autocomplete query
  const handleLocationInput = useCallback((value: string) => {
    setLocationQuery(value);
    setSelectedPlace(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/places/autocomplete?q=${encodeURIComponent(value)}&sessionToken=${sessionToken.current}`,
        );
        const data = await res.json() as {
          success: boolean;
          results: Array<{ placeId: string; mainText: string; secondaryText: string }>;
        };
        if (data.success) {
          setSuggestions(data.results ?? []);
          setShowSuggestions(true);
        }
      } catch {
        // Silently ignore network errors
      }
    }, 280);
  }, []);

  // Select a place → geocode
  const handleSelectPlace = useCallback(async (place: PlaceSuggestion) => {
    setLocationLoading(true);
    setShowSuggestions(false);
    setLocationQuery(`${place.mainText}${place.secondaryText ? ", " + place.secondaryText : ""}`);

    try {
      const res = await fetch(`/api/places/geocode?placeId=${encodeURIComponent(place.placeId)}`);
      const data = await res.json() as {
        success: boolean;
        latitude?: number;
        longitude?: number;
        timezone?: string;
      };
      if (data.success && data.latitude != null && data.longitude != null) {
        setSelectedPlace({
          label: locationQuery,
          latitude: data.latitude,
          longitude: data.longitude,
          timezone: data.timezone ?? "UTC",
        });
        // Rotate session token after geocode
        sessionToken.current = randomUUID();
      }
    } catch {
      // Silently ignore — user can proceed without location
    } finally {
      setLocationLoading(false);
    }
  }, [locationQuery]);

  const canSubmit = name.trim().length > 0 && birthDate.trim().length >= 8;

  return (
    <main className="screen luna-editorial-screen" aria-label="Add connection">
      <section className="luna-editorial-wrap" aria-label="Add connection content">
        <header className="luna-editorial-header">
          <div className="luna-editorial-meta-row">
            <Link href="/connections" className="luna-mini-label" style={{ opacity: 0.52 }}>
              ← 연결
            </Link>
          </div>
          <h1 className="luna-editorial-headline">이름과 생일이면 충분합니다.</h1>
          <p className="luna-editorial-support">
            이름과 출생 정보만으로 두 차트의 에너지 구조가 해석됩니다.
          </p>
        </header>

        <form
          className="luna-add-form"
          action={addConnectionAction}
          aria-label="Connection details form"
        >
          {/* Name */}
          <div className="luna-add-field">
            <label className="luna-add-label" htmlFor="conn-name">
              이름
            </label>
            <input
              id="conn-name"
              name="name"
              className="luna-add-input"
              type="text"
              placeholder="예: 지수"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              required
            />
          </div>

          {/* Birth date */}
          <div className="luna-add-field">
            <label className="luna-add-label" htmlFor="conn-birth-date">
              생년월일
            </label>
            <input
              id="conn-birth-date"
              name="birthDate"
              className="luna-add-input"
              type="text"
              placeholder="1995. 04. 22"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              inputMode="numeric"
              required
            />
          </div>

          {/* Birth time (optional) */}
          <div className="luna-add-field">
            <label className="luna-add-label" htmlFor="conn-birth-time">
              출생 시간
              <span style={{ opacity: 0.46, marginLeft: "0.4rem" }}>선택</span>
            </label>
            <input
              id="conn-birth-time"
              name="birthTime"
              className="luna-add-input"
              type="text"
              placeholder="오전 07:30"
              value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)}
            />
            <p className="luna-add-hint">시간이 정확할수록 해석의 정밀도가 높아집니다.</p>
          </div>

          {/* Birth location (optional) */}
          <div className="luna-add-field" style={{ position: "relative" }}>
            <label className="luna-add-label" htmlFor="conn-birth-location">
              출생지
              <span style={{ opacity: 0.46, marginLeft: "0.4rem" }}>선택</span>
            </label>
            <input
              id="conn-birth-location"
              className="luna-add-input"
              type="text"
              placeholder="도시 이름으로 검색"
              value={locationQuery}
              onChange={(e) => handleLocationInput(e.target.value)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
              autoComplete="off"
            />
            {locationLoading && (
              <p className="luna-add-hint" style={{ marginTop: "0.3rem" }}>
                위치 정보를 가져오는 중…
              </p>
            )}
            {selectedPlace && (
              <p className="luna-add-hint" style={{ marginTop: "0.3rem", color: "rgba(255,255,255,0.46)" }}>
                ✓ {selectedPlace.timezone}
              </p>
            )}

            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <ul className="luna-conn-place-list" role="listbox">
                {suggestions.map((s) => (
                  <li key={s.placeId} role="option" aria-selected={false}>
                    <button
                      type="button"
                      className="luna-conn-place-item"
                      onMouseDown={() => handleSelectPlace(s)}
                    >
                      <span className="luna-conn-place-main">{s.mainText}</span>
                      {s.secondaryText && (
                        <span className="luna-conn-place-sub">{s.secondaryText}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Hidden location fields — populated by geocode */}
          <input type="hidden" name="latitude"  value={selectedPlace?.latitude  ?? ""} />
          <input type="hidden" name="longitude" value={selectedPlace?.longitude ?? ""} />
          <input type="hidden" name="timezone"  value={selectedPlace?.timezone  ?? ""} />

          {/* Submit */}
          <section
            className="luna-editorial-actions"
            style={{ marginTop: "1.6rem" }}
            aria-label="Submit actions"
          >
            <button
              type="submit"
              className="luna-black-cta"
              disabled={!canSubmit}
              style={{ opacity: canSubmit ? 1 : 0.38, cursor: canSubmit ? "pointer" : "default" }}
            >
              해석 시작하기
            </button>
            <Link href="/connections" className="luna-secondary-link">
              취소
            </Link>
          </section>
        </form>
      </section>
    </main>
  );
}
