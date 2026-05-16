export const AIRPORTS_TABLE = "airports";

/** Sân bay thường dùng — có thể mở rộng sau. */
export const DEFAULT_AIRPORTS = [
  { iata: "SGN", name: "Tan Son Nhat International", country: "VN" },
  { iata: "HAN", name: "Noi Bai International", country: "VN" },
  { iata: "DAD", name: "Da Nang International", country: "VN" },
  { iata: "CXR", name: "Cam Ranh International", country: "VN" },
  { iata: "PQC", name: "Phu Quoc International", country: "VN" },
  { iata: "HPH", name: "Cat Bi International", country: "VN" },
  { iata: "VII", name: "Vinh International", country: "VN" },
  { iata: "BKK", name: "Suvarnabhumi", country: "TH" },
  { iata: "SIN", name: "Changi", country: "SG" },
  { iata: "KUL", name: "Kuala Lumpur International", country: "MY" },
  { iata: "HKG", name: "Hong Kong International", country: "HK" },
  { iata: "TPE", name: "Taiwan Taoyuan International", country: "TW" },
  { iata: "NRT", name: "Narita International", country: "JP" },
  { iata: "ICN", name: "Incheon International", country: "KR" },
  { iata: "PVG", name: "Shanghai Pudong International", country: "CN" },
  { iata: "LAX", name: "Los Angeles International", country: "US" },
  { iata: "FRA", name: "Frankfurt Airport", country: "DE" },
];

export async function ensureAirportSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${AIRPORTS_TABLE} (
      iata_code char(3) PRIMARY KEY,
      name text NOT NULL DEFAULT '',
      country char(2) NOT NULL DEFAULT ''
    )
  `);
}

export async function seedAirportsIfEmpty(client) {
  const res = await client.query(`SELECT 1 FROM ${AIRPORTS_TABLE} LIMIT 1`);
  if (res.rows.length > 0) return { seeded: false };
  for (const a of DEFAULT_AIRPORTS) {
    await client.query(
      `INSERT INTO ${AIRPORTS_TABLE} (iata_code, name, country) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [a.iata, a.name, a.country]
    );
  }
  return { seeded: true };
}
