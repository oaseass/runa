import type { PlaceResult } from "@/types/places";

type GoogleSuggestion = {
  placePrediction?: {
    placeId?: string;
    types?: string[];
    text?: {
      text?: string;
    };
    structuredFormat?: {
      mainText?: {
        text?: string;
      };
      secondaryText?: {
        text?: string;
      };
    };
  };
};

type GoogleAutocompleteResponse = {
  suggestions?: GoogleSuggestion[];
};

export type PlacesProviderErrorCode =
  | "MISSING_API_KEY"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "UPSTREAM_5XX"
  | "UPSTREAM_ERROR"
  | "UNKNOWN";

export class PlacesProviderError extends Error {
  code: PlacesProviderErrorCode;
  status: number;

  constructor(message: string, code: PlacesProviderErrorCode, status: number) {
    super(message);
    this.name = "PlacesProviderError";
    this.code = code;
    this.status = status;
  }
}

const GOOGLE_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const MAX_RESULTS = 5;

const REGION_PRIORITY_TYPES = [
  "locality",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "sublocality",
  "sublocality_level_1",
  "political",
  "postal_town",
  "neighborhood",
];

const POI_TYPES = [
  "airport",
  "subway_station",
  "train_station",
  "transit_station",
  "bus_station",
  "university",
  "school",
  "hospital",
  "tourist_attraction",
  "restaurant",
  "cafe",
  "store",
  "shopping_mall",
  "lodging",
  "point_of_interest",
  "establishment",
  "premise",
];

type RankedPlaceResult = PlaceResult & {
  score: number;
};

function getPlaceScore(types: string[], fullText: string): number {
  let score = 0;

  types.forEach((type) => {
    if (REGION_PRIORITY_TYPES.includes(type)) {
      score += 5;
    }

    if (POI_TYPES.includes(type)) {
      score -= 4;
    }
  });

  if (/광역시|특별시|특별자치시|특별자치도|시|군|구|도/.test(fullText)) {
    score += 2;
  }

  return score;
}

function isPoiDominant(types: string[]): boolean {
  const hasRegionalSignal = types.some((type) => REGION_PRIORITY_TYPES.includes(type));

  if (hasRegionalSignal) {
    return false;
  }

  return types.some((type) => POI_TYPES.includes(type));
}

function classifyProviderError(status: number): PlacesProviderErrorCode {
  if (status === 401) {
    return "UNAUTHORIZED";
  }

  if (status === 403) {
    return "FORBIDDEN";
  }

  if (status === 429) {
    return "RATE_LIMITED";
  }

  if (status >= 500) {
    return "UPSTREAM_5XX";
  }

  return "UPSTREAM_ERROR";
}

export async function fetchPlaceSuggestions(input: string, sessionToken: string): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new PlacesProviderError("GOOGLE_MAPS_API_KEY is not configured", "MISSING_API_KEY", 500);
  }

  const response = await fetch(GOOGLE_AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.types,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat.mainText,suggestions.placePrediction.structuredFormat.secondaryText",
    },
    cache: "no-store",
    body: JSON.stringify({
      input,
      languageCode: "ko",
      sessionToken,
    }),
  });

  if (!response.ok) {
    const code = classifyProviderError(response.status);
    throw new PlacesProviderError(
      `Google places autocomplete failed with status ${response.status}`,
      code,
      response.status,
    );
  }

  const data = (await response.json()) as GoogleAutocompleteResponse;
  const suggestions = data.suggestions ?? [];

  const rankedResults: RankedPlaceResult[] = [];

  suggestions.forEach((item) => {
    const prediction = item.placePrediction;
    const placeId = prediction?.placeId?.trim();
    const types = prediction?.types ?? [];
    const fullText = prediction?.text?.text?.trim() ?? "";
    const mainText = prediction?.structuredFormat?.mainText?.text?.trim() ?? "";
    const secondaryText = prediction?.structuredFormat?.secondaryText?.text?.trim() ?? "";

    if (!placeId || !fullText) {
      return;
    }

    if (isPoiDominant(types)) {
      return;
    }

    const score = getPlaceScore(types, fullText);

    rankedResults.push({
      placeId,
      mainText: mainText || fullText,
      secondaryText,
      fullText,
      score,
    });
  });

  const sorted = rankedResults.sort((a, b) => b.score - a.score);

  if (sorted.length === 0) {
    return [];
  }

  return sorted.slice(0, MAX_RESULTS).map(({ score, ...result }) => {
    void score;
    return result;
  });
}
