/** CTA đăng nhập TCS — luôn cụm đầy đủ, không viết tắt «ĐN». */

export function tcsLoginCtaLabel(opts: { retry?: boolean } = {}): string {
  return opts.retry ? "Thử Đăng Nhập TCS" : "Đăng Nhập TCS";
}

export function tcsLoginCtaHasAbbreviation(text: string): boolean {
  return text.includes("ĐN");
}
