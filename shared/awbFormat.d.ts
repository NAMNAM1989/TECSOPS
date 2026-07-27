export function awbDigitsKey(awb: string): string;
export function rawAwbDigits(formatted: string): string;
export function formatAwb(raw: string): string;
/** Tem in: `695-56301136` (không khoảng) — chuỗi ngắn hơn → chữ to hơn. */
export function formatAwbLabel(raw: string): string;
