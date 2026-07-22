export type EsidRegistrantProfileLoose = {
  id: string;
  name: string;
  tel: string;
  cccd: string;
  updatedAt: string;
};

export type EsidAgentProfileLoose = {
  id: string;
  name: string;
  address: string;
  tel: string;
  email: string;
  vat: string;
  fax: string;
  updatedAt: string;
};

export type EsidProfileStoreLoose<P> = {
  version: 1;
  activeId: string;
  profiles: P[];
};

export declare function emptyEsidRegistrantStore(): EsidProfileStoreLoose<EsidRegistrantProfileLoose>;
export declare function emptyEsidAgentStore(): EsidProfileStoreLoose<EsidAgentProfileLoose>;
export declare function normalizeEsidRegistrantStoreLoose(
  raw: unknown
): EsidProfileStoreLoose<EsidRegistrantProfileLoose>;
export declare function normalizeEsidAgentStoreLoose(
  raw: unknown
): EsidProfileStoreLoose<EsidAgentProfileLoose>;
export declare function esidRegistrantStoreHasUserData(store: unknown): boolean;
export declare function esidAgentStoreHasUserData(store: unknown): boolean;
