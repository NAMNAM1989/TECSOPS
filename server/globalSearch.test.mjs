import { describe, expect, it } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { createAppAuth } from "./appAuth.mjs";
import { registerGlobalSearchRoutes } from "./globalSearchRoutes.mjs";
import {
  addYmdDays,
  isSearchQueryTooShort,
  parseGlobalSearchParams,
  resolveLotSearchKind,
  todayYmdAsiaSaigon,
} from "./globalSearch.mjs";
import { foldSearchText } from "../shared/searchNormalize.mjs";

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

describe("parseGlobalSearchParams", () => {
  const now = new Date("2026-09-20T05:00:00.000Z");

  it("defaults to a 30-day Saigon window", () => {
    const p = parseGlobalSearchParams({ q: "7842004" }, now);
    expect(p.to).toBe(todayYmdAsiaSaigon(now));
    expect(p.from).toBe(addYmdDays(p.to, -30));
    expect(p.digits).toBe("7842004");
    expect(p.limit).toBe(20);
  });

  it("clamps limit and swaps inverted dates", () => {
    const p = parseGlobalSearchParams(
      { q: "abc", from: "2026-09-20", to: "2026-09-01", limit: "99" },
      now
    );
    expect(p.from).toBe("2026-09-01");
    expect(p.to).toBe("2026-09-20");
    expect(p.limit).toBe(40);
  });

  it("treats DDMMM as flight-date-only", () => {
    const p = parseGlobalSearchParams({ q: "28jul" }, now);
    expect(p.flightDate).toBe("28JUL");
    expect(isSearchQueryTooShort(p)).toBe(false);
  });

  it("rejects short text queries", () => {
    expect(isSearchQueryTooShort(parseGlobalSearchParams({ q: "ab" }, now))).toBe(true);
    expect(isSearchQueryTooShort(parseGlobalSearchParams({ q: "784" }, now))).toBe(false);
  });

  it("parses excludeSession and rejects invalid ymd", () => {
    const p = parseGlobalSearchParams({ q: "sin", excludeSession: "2026-09-20" }, now);
    expect(p.excludeSession).toBe("2026-09-20");
    expect(parseGlobalSearchParams({ q: "sin", excludeSession: "nope" }, now).excludeSession).toBe("");
  });
});

describe("resolveLotSearchKind", () => {
  it("prefers MAWB digits then shipper", () => {
    const parsed = parseGlobalSearchParams({ q: "78420042005" });
    expect(
      resolveLotSearchKind(
        { awb: "784-2004 2005", awb_digits: "78420042005", hawb: "", shipper_name_print: "" },
        parsed
      )
    ).toBe("mawb");
    const ship = parseGlobalSearchParams({ q: "anh duong" });
    expect(
      resolveLotSearchKind(
        {
          awb: "1",
          awb_digits: "1",
          hawb: "",
          shipper_name_print: "Công ty TNHH Ánh Dương",
          consignee_name_print: "",
          goods_description_print: "",
          customer: "",
          customer_code: "",
          flight_date: "",
        },
        ship
      )
    ).toBe("shipper");
  });
});

describe("GET /api/search auth", () => {
  it("returns 401 when not logged in", async () => {
    const auth = createAppAuth({
      token: "test-token-at-least-24-characters",
      isProduction: true,
      allowUnauthenticated: false,
      disableLoginGate: false,
    });
    const app = express();
    auth.registerRoutes(app);
    registerGlobalSearchRoutes(app, { requireAuth: auth.requireAuth });
    const http = await listen(app);
    try {
      const res = await fetch(`${http.baseUrl}/api/search?q=7842004`);
      expect(res.status).toBe(401);
    } finally {
      await http.close();
    }
  });

  it("returns empty hits for short q when auth is open", async () => {
    const app = express();
    registerGlobalSearchRoutes(app, { requireAuth: (_req, _res, next) => next() });
    const http = await listen(app);
    try {
      const res = await fetch(`${http.baseUrl}/api/search?q=ab`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hits).toEqual([]);
      expect(body.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    } finally {
      await http.close();
    }
  });
});

describe("foldSearchText on server", () => {
  it("matches client fold", () => {
    expect(foldSearchText("Nguyễn")).toBe("nguyen");
  });
});
