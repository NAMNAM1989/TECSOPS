export declare function emptyAirlineLabelOverrides(): {
  byAwbPrefix: Record<string, string>;
  byFlightPrefix: Record<string, string>;
};

export declare function normalizeAirlineLabelOverridesLoose(raw: unknown): {
  byAwbPrefix: Record<string, string>;
  byFlightPrefix: Record<string, string>;
};
