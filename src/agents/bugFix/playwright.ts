import type { PlaywrightEvidence, PlaywrightHost, PlaywrightReproduceRequest } from "./types";

/**
 * Playwright integration surface for UI bugs.
 * Production wiring should reuse `tests/e2e/support.mjs`
 * (`BASE_URL`, `loginIfConfigured`) and existing `npm run test:e2e*`.
 */
export const PLAYWRIGHT_NPM_SCRIPTS = {
  smoke: "qa:smoke",
  readonly: "test:e2e",
  ai: "test:e2e:ai",
  a11y: "test:e2e:a11y",
  mutation: "test:e2e:mutation",
} as const;

export function playwrightRequestFromReport(input: {
  baseUrl?: string;
  workflow?: string[];
  expect?: string[];
}): PlaywrightReproduceRequest {
  return {
    baseUrl: input.baseUrl || "http://127.0.0.1:5173",
    workflow: input.workflow?.length ? input.workflow : ["open app", "navigate user workflow"],
    collectConsole: true,
    collectNetwork: true,
    expect: input.expect,
  };
}

export function summarizePlaywrightEvidence(evidence: PlaywrightEvidence): string[] {
  const lines: string[] = [];
  if (evidence.pageUrl) lines.push(`page ${evidence.pageUrl}`);
  for (const item of evidence.console.filter((row) => row.type === "error")) {
    lines.push(`console.${item.type}: ${item.text}`);
  }
  for (const item of evidence.network.filter((row) => row.status >= 400 || row.status === 0)) {
    lines.push(`http ${item.status} ${item.method ?? "GET"} ${item.url}`);
  }
  lines.push(...evidence.domErrors, ...evidence.httpErrors, ...evidence.notes);
  return lines;
}

export function hasPlaywrightHost(host: { playwright?: PlaywrightHost }): host is { playwright: PlaywrightHost } {
  return Boolean(host.playwright);
}
