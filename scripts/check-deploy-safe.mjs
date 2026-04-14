#!/usr/bin/env node
/**
 * Safety gate: abort deploy/release if repo config looks destructive.
 * This project has no SQL migrations; state lives in Redis (see docs/railway-safe-deploy.md).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

/** Patterns that must NOT appear in deployment-related files. */
const FORBIDDEN = [
  { re: /prisma\s+db\s+push[^"\n]*--force-reset/i, why: "Prisma db push --force-reset" },
  { re: /prisma\s+migrate\s+reset\b/i, why: "prisma migrate reset" },
  { re: /prisma\s+migrate\s+dev\b/i, why: "prisma migrate dev (dev-only; use migrate deploy in prod)" },
  { re: /--accept-data-loss/i, why: "Prisma --accept-data-loss" },
  { re: /sequelize[^\n]*sync\s*\([^)]*force\s*:\s*true/i, why: "Sequelize sync({ force: true })" },
  { re: /\.sync\s*\(\s*\{\s*force\s*:\s*true\s*\}/i, why: "ORM sync({ force: true })" },
  { re: /DROP\s+DATABASE/i, why: "DROP DATABASE" },
  { re: /DROP\s+TABLE[^;]*;/i, why: "DROP TABLE (review migration manually)" },
];

function scanFile(rel) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) return;
  const text = fs.readFileSync(fp, "utf8");
  for (const { re, why } of FORBIDDEN) {
    if (re.test(text)) {
      console.error(`[check-deploy-safe] BLOCKED: ${rel} matches forbidden pattern: ${why}`);
      process.exit(1);
    }
  }
}

const targets = ["package.json", "railway.toml", "nixpacks.toml"];

for (const rel of targets) {
  scanFile(rel);
}

console.info("[check-deploy-safe] OK — no destructive DB/sync patterns in checked files.");
