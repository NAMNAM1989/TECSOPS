import { parsePositiveNumbersFromText } from "./volumetricDim";
import { numbersFromVietnameseSpeech } from "./viSpokenNumbers";

/**
 * Chuẩn hoá transcript STT (tiếng Việt) trước khi trích số cho DIM.
 * Xử lý số fullwidth, từ "phẩy/chấm" giữa chữ số (thường gặp khi đọc thập phân).
 */
export function preprocessDimVoiceTranscript(raw: string): string {
  let s = raw.normalize("NFKC").trim();
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));
  s = s.replace(/(\d)\s*(?:phẩy|phảy|chấm)\s*(\d)/gi, "$1.$2");
  return s;
}

/**
 * Trích dãy số dương từ câu nói (sau khi chuẩn hoá).
 * Ưu tiên chữ số La Tinh; nếu thiếu (STT chỉ trả chữ tiếng Việt) thì parse từ đọc số.
 */
export function numbersFromDimVoiceTranscript(raw: string): number[] {
  const pre = preprocessDimVoiceTranscript(raw);
  const digits = parsePositiveNumbersFromText(pre);
  if (digits.length >= 3) return digits;
  const vi = numbersFromVietnameseSpeech(pre);
  if (vi.length >= 3) return vi;
  return digits.length ? digits : vi;
}
