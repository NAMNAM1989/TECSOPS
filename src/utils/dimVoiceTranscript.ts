import { parsePositiveNumbersFromText } from "./volumetricDim";

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

/** Trích dãy số dương từ câu nói (sau khi chuẩn hoá). */
export function numbersFromDimVoiceTranscript(raw: string): number[] {
  return parsePositiveNumbersFromText(preprocessDimVoiceTranscript(raw));
}
