import type { FixAttempt } from "./types";

export function attemptSignature(strategy: string, files: Array<{ path: string; content: string }>): string {
  const parts = files
    .map((file) => `${file.path}::${simpleHash(file.content)}`)
    .sort()
    .join("|");
  return `${strategy}#${simpleHash(parts)}`;
}

export function detectOscillation(attempts: FixAttempt[]): boolean {
  if (attempts.length < 3) return false;
  const sigs = attempts.map((attempt) => attempt.signature);
  const last = sigs[sigs.length - 1];
  const prev = sigs[sigs.length - 2];
  const earlier = sigs[sigs.length - 3];
  return Boolean(last && prev && earlier && last === earlier && last !== prev);
}

export function consecutiveFailures(attempts: FixAttempt[]): number {
  let count = 0;
  for (let i = attempts.length - 1; i >= 0; i -= 1) {
    if (attempts[i]?.passed) break;
    count += 1;
  }
  return count;
}

export function alreadyAttempted(attempts: FixAttempt[], signature: string): boolean {
  return attempts.some((attempt) => attempt.signature === signature);
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
