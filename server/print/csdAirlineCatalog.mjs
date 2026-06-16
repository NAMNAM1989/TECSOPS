/**
 * Danh sách hãng bay (AWB prefix 3 số) — đồng bộ với `src/constants/airlineLabelDefaults.ts`.
 * Mỗi prefix có slot mẫu CSD riêng trong `public/print-templates/csd/airlines/{prefix}/`.
 */
export const CSD_AIRLINE_BY_AWB_PREFIX = {
  "006": "DELTA AIR LINES",
  "020": "LUFTHANSA CARGO",
  "057": "AIR FRANCE CARGO",
  "079": "PHILIPPINE AIRLINES",
  "081": "JETSTAR AIRWAYS",
  "086": "AIR NEW ZEALAND",
  "131": "JAPAN AIRLINES",
  "157": "QATAR AIRWAYS CARGO",
  "160": "CATHAY PACIFIC",
  "176": "EMIRATES",
  "180": "KOREAN AIR",
  "189": "STARLUX CARGO",
  "203": "CEBU PACIFIC CARGO",
  "205": "AIR CANADA CARGO",
  "217": "THAI AIRWAYS",
  "232": "MALAYSIA AIRLINES",
  "235": "TURKISH AIRLINES CARGO",
  "350": "AIR PREMIA",
  "406": "UPS AIRLINES",
  "555": "CARGO AGENT",
  "672": "ROYAL BRUNEI AIRLINES",
  "695": "EVA AIR",
  "722": "TWAY AIRLINE",
  "738": "VIETNAM AIRLINES",
  "784": "CHINA AIRLINES",
  "807": "AIR ASIA",
  "926": "BAMBOO AIRWAYS",
  "933": "NIPPON CARGO",
};

/** Khổ giấy CSD mặc định — A4 (form vector IATA). */
export const CSD_A4_PAGE = {
  page_width_mm: 210,
  page_height_mm: 297,
};

/** US Letter — dùng overlay scan form hãng (tỉ lệ AWB Editor). */
export const CSD_LETTER_PAGE = {
  page_width_mm: 215.9,
  page_height_mm: 279.4,
};

export function awbPrefixFromAwb(awb) {
  const digits = String(awb ?? "").replace(/\D/g, "");
  return digits.length >= 3 ? digits.slice(0, 3) : "";
}

export function listCsdAirlineEntries() {
  return Object.entries(CSD_AIRLINE_BY_AWB_PREFIX)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([awbPrefix, airlineName]) => ({ awbPrefix, airlineName }));
}
