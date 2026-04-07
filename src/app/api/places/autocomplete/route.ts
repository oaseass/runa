import { NextResponse } from "next/server";
import { fetchPlaceSuggestions, PlacesProviderError } from "@/lib/places/service";
import type { PlacesAutocompleteResponse } from "@/types/places";

const MIN_QUERY_LENGTH = 2;
const PLACE_SEARCH_UNAVAILABLE = "지금은 출생지 검색을 사용할 수 없어요";

function createSessionToken() {
  return crypto.randomUUID();
}

function jsonResponse(payload: PlacesAutocompleteResponse, status: number) {
  return NextResponse.json(payload, { status });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof PlacesProviderError && error.code === "MISSING_API_KEY") {
    return PLACE_SEARCH_UNAVAILABLE;
  }

  return PLACE_SEARCH_UNAVAILABLE;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const requestSessionToken = searchParams.get("sessionToken")?.trim() ?? "";
  const sessionToken = requestSessionToken || createSessionToken();

  if (query.length < MIN_QUERY_LENGTH) {
    return jsonResponse(
      {
        success: true,
        results: [],
        error: null,
        sessionToken,
      },
      200,
    );
  }

  try {
    const results = await fetchPlaceSuggestions(query, sessionToken);

    return jsonResponse(
      {
        success: true,
        results,
        error: null,
        sessionToken,
      },
      200,
    );
  } catch (error) {
    if (error instanceof PlacesProviderError) {
      console.error("[places/autocomplete] provider failure", {
        code: error.code,
        status: error.status,
        message: error.message,
      });

      if (error.code === "MISSING_API_KEY") {
        return jsonResponse(
          {
            success: false,
            results: [],
            error: PLACE_SEARCH_UNAVAILABLE,
            sessionToken,
          },
          503,
        );
      }

      if (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN") {
        return jsonResponse(
          {
            success: false,
            results: [],
            error: PLACE_SEARCH_UNAVAILABLE,
            sessionToken,
          },
          503,
        );
      }

      if (error.code === "RATE_LIMITED") {
        return jsonResponse(
          {
            success: false,
            results: [],
            error: PLACE_SEARCH_UNAVAILABLE,
            sessionToken,
          },
          429,
        );
      }

      if (error.code === "UPSTREAM_5XX" || error.code === "UPSTREAM_ERROR") {
        return jsonResponse(
          {
            success: false,
            results: [],
            error: PLACE_SEARCH_UNAVAILABLE,
            sessionToken,
          },
          503,
        );
      }
    }

    console.error("[places/autocomplete] unexpected failure", error);

    return jsonResponse(
      {
        success: false,
        results: [],
        error: toErrorMessage(error),
        sessionToken,
      },
      500,
    );
  }
}
