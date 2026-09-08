import type { CsdCarrier } from "./csdForms";

const KEY = "tecsops.csd.lastTransfer.v1";
const KEY_EK_ISSUER = "tecsops.csd.lastEkIssuer.v1";

type Store = Partial<Record<CsdCarrier, string>>;

export type CsdEkIssuerPrefs = {
  issuedBy: string;
  issuedTitle: string;
  signCompany: string;
};

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadLastCsdTransfer(carrier: CsdCarrier): string {
  const v = readStore()[carrier];
  return typeof v === "string" ? v.trim().toUpperCase() : "";
}

export function saveLastCsdTransfer(carrier: CsdCarrier, transfer: string): void {
  const t = transfer.trim().toUpperCase().slice(0, 24);
  try {
    const next = { ...readStore(), [carrier]: t };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function loadLastCsdEkIssuer(): CsdEkIssuerPrefs {
  try {
    const raw = localStorage.getItem(KEY_EK_ISSUER);
    if (!raw) return { issuedBy: "", issuedTitle: "STAFF", signCompany: "" };
    const parsed = JSON.parse(raw) as Partial<CsdEkIssuerPrefs>;
    return {
      issuedBy: typeof parsed.issuedBy === "string" ? parsed.issuedBy.trim() : "",
      issuedTitle:
        typeof parsed.issuedTitle === "string" && parsed.issuedTitle.trim()
          ? parsed.issuedTitle.trim()
          : "STAFF",
      signCompany:
        typeof parsed.signCompany === "string" ? parsed.signCompany.trim() : "",
    };
  } catch {
    return { issuedBy: "", issuedTitle: "STAFF", signCompany: "" };
  }
}

export function saveLastCsdEkIssuer(prefs: CsdEkIssuerPrefs): void {
  try {
    localStorage.setItem(
      KEY_EK_ISSUER,
      JSON.stringify({
        issuedBy: prefs.issuedBy.trim().slice(0, 80),
        issuedTitle: (prefs.issuedTitle.trim() || "STAFF").slice(0, 40),
        signCompany: prefs.signCompany.trim().slice(0, 80),
      })
    );
  } catch {
    /* private mode */
  }
}
