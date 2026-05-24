export const SCSC_GOODS_MAX_LINES = 3;

/** Ô tên hàng trên phiếu SCSC (mm). */
export const SCSC_GOODS_BOX = {
  leftMm: 35,
  rightMm: 110,
  topMm: 160,
  minFontMm: 2,
  maxFontMm: 4,
  /** Vùng dọc trước hàng pieces (168.5mm). */
  maxHeightMm: 8.5,
  charWidthFactor: 0.52,
  lineHeightFactor: 1.15,
} as const;

export function scscGoodsBoxWidthMm(): number {
  return SCSC_GOODS_BOX.rightMm - SCSC_GOODS_BOX.leftMm;
}

export type ScscGoodsLayoutResult = {
  fontMm: number;
  multiline: boolean;
  displayText: string;
  lineHeightMm: number;
  heightMm: number;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function maxCharsPerGoodsLine(widthMm: number, fontMm: number): number {
  return Math.max(1, Math.floor(widthMm / (fontMm * SCSC_GOODS_BOX.charWidthFactor)));
}

function textFitsOneLine(text: string, widthMm: number, fontMm: number): boolean {
  return text.length * fontMm * SCSC_GOODS_BOX.charWidthFactor <= widthMm;
}

function pushLongToken(lines: string[], token: string, maxChars: number): void {
  let rest = token;
  while (rest.length > maxChars) {
    lines.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  if (rest) lines.push(rest);
}

export function wrapGoodsLines(text: string, widthMm: number, fontMm: number): string[] {
  const maxChars = maxCharsPerGoodsLine(widthMm, fontMm);
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (word.length <= maxChars) {
      current = word;
    } else {
      pushLongToken(lines, word, maxChars);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/** Cỡ 4mm → 2mm một dòng; nếu vẫn dài thì 2mm và xuống dòng. */
export function layoutScscGoods(
  text: string,
  widthMm: number = scscGoodsBoxWidthMm()
): ScscGoodsLayoutResult {
  const raw = text.trim();
  const emptyLh = round1(SCSC_GOODS_BOX.maxFontMm * SCSC_GOODS_BOX.lineHeightFactor);
  if (!raw) {
    return {
      fontMm: SCSC_GOODS_BOX.maxFontMm,
      multiline: false,
      displayText: "",
      lineHeightMm: emptyLh,
      heightMm: emptyLh,
    };
  }

  for (let f: number = SCSC_GOODS_BOX.maxFontMm; f >= SCSC_GOODS_BOX.minFontMm - 0.001; f = round1(f - 0.1)) {
    if (textFitsOneLine(raw, widthMm, f)) {
      const lh = round1(f * SCSC_GOODS_BOX.lineHeightFactor);
      return {
        fontMm: round1(f),
        multiline: false,
        displayText: raw,
        lineHeightMm: lh,
        heightMm: lh,
      };
    }
  }

  const fontMm = SCSC_GOODS_BOX.minFontMm;
  const lineHeightMm = round1(fontMm * SCSC_GOODS_BOX.lineHeightFactor);
  const maxLines = Math.min(
    SCSC_GOODS_MAX_LINES,
    Math.max(1, Math.floor(SCSC_GOODS_BOX.maxHeightMm / lineHeightMm))
  );
  let lines = wrapGoodsLines(raw, widthMm, fontMm);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const maxChars = maxCharsPerGoodsLine(widthMm, fontMm);
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] =
      last.length > maxChars ? `${last.slice(0, Math.max(0, maxChars - 1))}…` : last;
  }

  return {
    fontMm,
    multiline: true,
    displayText: lines.join("\n"),
    lineHeightMm,
    heightMm: round1(lines.length * lineHeightMm),
  };
}

/** @deprecated dùng layoutScscGoods */
export function fitScscGoodsFontMm(text: string, widthMm: number = scscGoodsBoxWidthMm()): number {
  return layoutScscGoods(text, widthMm).fontMm;
}
