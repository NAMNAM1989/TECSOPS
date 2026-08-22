export declare function emptyAirlineLabelOverrides(): {
  byAwbPrefix: Record<string, string>;
  byFlightPrefix: Record<string, string>;
};

export declare function repairGluedAirlineDisplayName(raw: unknown): string;

export declare function airlineNameLooksGlued(raw: unknown): boolean;

export declare function normalizeAirlineLabelOverridesLoose(raw: unknown): {
  byAwbPrefix: Record<string, string>;
  byFlightPrefix: Record<string, string>;
};
