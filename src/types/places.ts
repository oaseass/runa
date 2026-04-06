export type PlaceResult = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
};

export type PlacesAutocompleteResponse = {
  success: boolean;
  results: PlaceResult[];
  error: string | null;
  sessionToken: string;
};
