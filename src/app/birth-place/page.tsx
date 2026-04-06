"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PlaceResult, PlacesAutocompleteResponse } from "@/types/places";
import { saveBirthPlaceSelection } from "@/lib/onboarding/birth-place-storage";
import { getBirthTimeSelection } from "@/lib/onboarding/birth-time-storage";

const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 280;

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

type GeocodeResponse = {
  success: boolean;
  latitude?: number;
  longitude?: number;
  timezone?: string;
};

function BirthPlacePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get("edit") === "1";
  const sessionTokenRef = useRef<string>(randomUUID());
  const [query, setQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isEditMode) return;
    const birthTime = getBirthTimeSelection();
    if (!birthTime) {
      router.replace("/birth-time");
    }
  }, [isEditMode, router]);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setSelectedPlace(null);
      setResults([]);
      setIsLoading(false);
      setHasSearched(false);
      setErrorMessage(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setIsLoading(true);
        setHasSearched(true);
        setErrorMessage(null);

        const response = await fetch(
          `/api/places/autocomplete?q=${encodeURIComponent(trimmed)}&sessionToken=${encodeURIComponent(
            sessionTokenRef.current,
          )}`,
          {
            method: "GET",
            signal: controller.signal,
          },
        );

        const data = (await response.json()) as PlacesAutocompleteResponse;

        if (data.sessionToken) {
          sessionTokenRef.current = data.sessionToken;
        }

        if (!response.ok || !data.success) {
          setResults([]);
          setErrorMessage(data.error ?? "지금은 장소 검색을 사용할 수 없어요");
          return;
        }

        setResults(data.results ?? []);
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setResults([]);
        setErrorMessage("지금은 장소 검색을 사용할 수 없어요");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  function handlePickSuggestion(item: PlaceResult) {
    setSelectedPlace(item);
    setQuery(item.fullText);
    setResults([]);
    setHasSearched(true);
    setErrorMessage(null);
  }

  function handleInputChange(value: string) {
    setQuery(value);

    if (selectedPlace && value.trim() !== selectedPlace.fullText) {
      setSelectedPlace(null);
    }
  }

  async function handleContinue() {
    if (!selectedPlace) {
      return;
    }

    setIsGeocoding(true);
    let latitude: number | null = null;
    let longitude: number | null = null;
    let timezone: string | null = null;

    try {
      const res = await fetch(
        `/api/places/geocode?placeId=${encodeURIComponent(selectedPlace.placeId)}`,
      );
      const geo = (await res.json()) as GeocodeResponse;
      if (geo.success) {
        latitude = geo.latitude ?? null;
        longitude = geo.longitude ?? null;
        timezone = geo.timezone ?? null;
      }
    } catch {
      // Non-fatal: chart calculation will be skipped without geocode
    } finally {
      setIsGeocoding(false);
    }

    saveBirthPlaceSelection({
      placeId: selectedPlace.placeId,
      fullText: selectedPlace.fullText,
      mainText: selectedPlace.mainText,
      secondaryText: selectedPlace.secondaryText,
      latitude,
      longitude,
      timezone,
    });

    if (isEditMode) {
      try {
        await fetch("/api/profile/birth-data", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            placeId: selectedPlace.placeId,
            fullText: selectedPlace.fullText,
            mainText: selectedPlace.mainText,
            secondaryText: selectedPlace.secondaryText,
            latitude,
            longitude,
            timezone,
          }),
        });
      } catch {
        // non-fatal
      }
      router.push("/profile/chart");
      return;
    }

    router.push("/phone");
  }

  return (
    <main className="screen screen-dark">
      <section className="step-wrap step-wrap-dark birth-place-step birth-place-step-dark" aria-label="Birth place step">
        <p className="dark-brand">LUNA</p>
        <h1 className="step-title step-title-strong">태어난 곳</h1>

        <div>
          <label htmlFor="birthPlace" className="a11y-hidden">
            Search birth place
          </label>
          <input
            id="birthPlace"
            name="birthPlace"
            type="text"
            autoComplete="off"
            value={query}
            onChange={(event) => handleInputChange(event.target.value)}
            placeholder="도시 또는 지역 검색"
            className="field-dark"
          />

          {query.trim().length >= MIN_SEARCH_LENGTH ? (
            <ul className="place-list place-list-dark" aria-live="polite">
              {isLoading ? <li className="place-hint place-hint-dark">검색 중...</li> : null}

              {!isLoading && !errorMessage && hasSearched && results.length === 0 ? (
                <li className="place-hint place-hint-dark">선택 가능한 장소가 없어요</li>
              ) : null}

              {results.map((item) => (
                <li key={item.placeId}>
                  <button
                    type="button"
                    className={`place-option place-option-dark ${selectedPlace?.placeId === item.placeId ? "place-option-dark-active" : ""}`}
                    onClick={() => handlePickSuggestion(item)}
                  >
                    <span>{item.mainText}</span>
                    {item.secondaryText ? (
                      <span className="place-option-sub place-option-sub-dark">{item.secondaryText}</span>
                    ) : null}
                    {selectedPlace?.placeId === item.placeId ? (
                      <span className="place-option-check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {errorMessage ? <p className="dark-copy">{errorMessage}</p> : null}
        </div>
      </section>

      <div className="birth-place-cta-row">
        <button
          type="button"
          className="arrow-cta arrow-cta-dark"
          aria-label="Continue to phone"
          disabled={!selectedPlace || isGeocoding}
          onClick={handleContinue}
        >
          {isGeocoding ? "…" : "→"}
        </button>
      </div>
    </main>
  );
}


export default function BirthPlacePage() {
  return <Suspense><BirthPlacePageInner /></Suspense>;
}
