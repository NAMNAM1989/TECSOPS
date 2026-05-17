export type ScscFitTextLayoutResult = {
  fontMm: number;
  multiline: boolean;
  displayText: string;
  lineHeightMm: number;
  heightMm: number;
};

export type ScscFitTextBoxConfig = {
  minFontMm: number;
  maxFontMm: number;
  maxHeightMm: number;
  charWidthFactor: number;
  lineHeightFactor: number;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function maxCharsPerLine(widthMm: number, fontMm: number, factor: number): number {
  return Math.max(1, Math.floor(widthMm / (fontMm * factor)));
}

function textFitsOneLine(text: string, widthMm: number, fontMm: number, factor: number): boolean {
  return text.length * fontMm * factor <= widthMm;
}

function pushLongToken(lines: string[], token: string, maxChars: number): void {
  let rest = token;
  while (rest.length > maxChars) {
    lines.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  if (rest) lines.push(rest);
}

export function wrapTextLines(text: string, widthMm: number, fontMm: number, factor: number): string[] {
  const maxChars = maxCharsPerLine(widthMm, fontMm, factor);
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

/** Thu nhỏ cỡ chữ rồi xuống dòng để vừa ô in. */
export function layoutScscFitText(
  text: string,
  widthMm: number,
  cfg: ScscFitTextBoxConfig
): ScscFitTextLayoutResult {
  const raw = text.trim();
  const emptyLh = round1(cfg.maxFontMm * cfg.lineHeightFactor);
  if (!raw) {
    return {
      fontMm: cfg.maxFontMm,
      multiline: false,
      displayText: "",
      lineHeightMm: emptyLh,
      heightMm: emptyLh,
    };
  }

  for (let f: number = cfg.maxFontMm; f >= cfg.minFontMm - 0.001; f = round1(f - 0.1)) {
    if (textFitsOneLine(raw, widthMm, f, cfg.charWidthFactor)) {
      const lh = round1(f * cfg.lineHeightFactor);
      return {
        fontMm: round1(f),
        multiline: false,
        displayText: raw,
        lineHeightMm: lh,
        heightMm: lh,
      };
    }
  }

  const fontMm = cfg.minFontMm;
  const lineHeightMm = round1(fontMm * cfg.lineHeightFactor);
  const maxLines = Math.max(1, Math.floor(cfg.maxHeightMm / lineHeightMm));
  let lines = wrapTextLines(raw, widthMm, fontMm, cfg.charWidthFactor);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const maxChars = maxCharsPerLine(widthMm, fontMm, cfg.charWidthFactor);
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] =
      last.length > maxChars ? `${last.slice(0, Math.max(0, maxChars - 1))}…` : last;
  }

  return {
    fontMm,
    multiline: true,
    displayText: lines.join("\n"),
    lineHeightMm,
    heightMm: round1(Math.min(cfg.maxHeightMm, lines.length * lineHeightMm)),
  };
}
