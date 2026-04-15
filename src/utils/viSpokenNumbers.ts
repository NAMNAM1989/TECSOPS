/**
 * Trích số từ câu nói tiếng Việt khi STT không trả chữ số La Tinh.
 * Chiến lược: tách cụm theo dấu phẩy / "phẩy" / "và", mỗi cụm đọc từng chữ số (một hai không → 120)
 * hoặc số có chữ số.
 */

import { parsePositiveNumbersFromText } from "./volumetricDim";

const DIGIT_WORD: Record<string, number> = {
  không: 0,
  khong: 0,
  một: 1,
  mot: 1,
  hai: 2,
  ba: 3,
  bốn: 4,
  bon: 4,
  tư: 4,
  tu: 4,
  năm: 5,
  nam: 5,
  lăm: 5,
  lam: 5,
  sáu: 6,
  sau: 6,
  bảy: 7,
  bay: 7,
  tám: 8,
  tam: 8,
  chín: 9,
  chin: 9,
};

function normToken(t: string): string {
  return t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function isMuoi(token: string): boolean {
  const n = normToken(token);
  if (n === "muoi" || n === "mươi") return true;
  return /mươi|muoi/i.test(token.trim());
}

/** "một hai không" hoặc "1 2 0" → 120 (2–4 từ/chữ số). */
function parseDigitWordSequence(tokens: string[]): number | null {
  if (tokens.length < 2 || tokens.length > 4) return null;
  const parts: string[] = [];
  for (const t of tokens) {
    if (/^\d+$/.test(t)) {
      parts.push(t);
      continue;
    }
    const k = normToken(t);
    const v = DIGIT_WORD[k];
    if (v === undefined) return null;
    parts.push(String(v));
  }
  const n = Number(parts.join(""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "năm mươi" / "hai mươi mốt" → số (đơn giản). */
function parseTensCompound(tokens: string[], i: number): { n: number; len: number } | null {
  const a = DIGIT_WORD[normToken(tokens[i] ?? "")];
  const midTok = tokens[i + 1] ?? "";
  const b = tokens[i + 2] ? DIGIT_WORD[normToken(tokens[i + 2])] : undefined;
  if (a == null || a < 2 || a > 9) return null;
  if (!isMuoi(midTok)) return null;
  let v = a * 10;
  let len = 2;
  if (b === 1 || tokens[i + 2] === "mốt" || normToken(tokens[i + 2] ?? "") === "mot") {
    v += 1;
    len = 3;
  } else if (b === 4 || normToken(tokens[i + 2] ?? "") === "tu") {
    v += 4;
    len = 3;
  } else if (b === 5 || normToken(tokens[i + 2] ?? "") === "lam") {
    v += 5;
    len = 3;
  } else if (b != null && b >= 1 && b <= 9) {
    v += b;
    len = 3;
  }
  return { n: v, len };
}

function parsePhraseToNumbers(phrase: string): number[] {
  const trimmed = phrase.trim();
  if (!trimmed) return [];
  const fromDigits = parsePositiveNumbersFromText(trimmed);
  if (fromDigits.length > 0) return fromDigits;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const out: number[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tens = parseTensCompound(tokens, i);
    if (tens) {
      out.push(tens.n);
      i += tens.len;
      continue;
    }
    const slice3 = tokens.slice(i, i + 3);
    const seq3 = parseDigitWordSequence(slice3);
    if (seq3 != null) {
      out.push(seq3);
      i += 3;
      continue;
    }
    const slice2 = tokens.slice(i, i + 2);
    const seq2 = parseDigitWordSequence(slice2);
    if (seq2 != null) {
      out.push(seq2);
      i += 2;
      continue;
    }
    const one = DIGIT_WORD[normToken(tokens[i])];
    if (one != null && one > 0) {
      out.push(one);
      i += 1;
      continue;
    }
    i += 1;
  }
  return out;
}

/**
 * Tách câu theo dấu / từ nối, mỗi đoạn parse riêng rồi gộp số.
 */
export function numbersFromVietnameseSpeech(raw: string): number[] {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return [];

  const chunks = s.split(/\s*(?:,|;|\.|phẩy|phảy|và|với|rồi)\s*/i).filter(Boolean);
  const all: number[] = [];
  for (const ch of chunks) {
    all.push(...parsePhraseToNumbers(ch));
  }
  if (all.length > 0) return all;

  return parsePhraseToNumbers(s);
}
