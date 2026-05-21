export type CneePanelPlacement = "below" | "overlay";

export type CneeMagnifyPanelPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: CneePanelPlacement;
};

const PAD = 8;
const GAP = 4;
const PREFERRED_HEIGHT = 460;

/**
 * Tính vị trí panel CNEE (fixed viewport) bám theo ô kích hoạt.
 * Ưu tiên mở ngay **dưới** ô; chỉ thu chiều cao — không flip lên `bottom - maxHeight`.
 */
export function computeCneeMagnifyPanelPos(anchorRect: DOMRect, viewport = getViewportSize()): CneeMagnifyPanelPos {
  const { vw, vh } = viewport;
  const width = Math.min(520, Math.max(anchorRect.width, 300, vw - PAD * 2));

  let left = anchorRect.left;
  if (left + width > vw - PAD) {
    left = Math.max(PAD, anchorRect.right - width);
  }
  if (left < PAD) left = PAD;

  const belowTop = anchorRect.bottom + GAP;
  const spaceBelow = Math.max(0, vh - PAD - belowTop);

  if (spaceBelow >= GAP) {
    return {
      top: belowTop,
      left,
      width,
      maxHeight: Math.min(PREFERRED_HEIGHT, spaceBelow),
      placement: "below",
    };
  }

  // Fallback hiếm: ô sát đáy viewport — neo tại mép trên ô, không nhảy lên xa.
  const overlayTop = Math.max(PAD, anchorRect.top);
  const overlaySpace = Math.max(0, vh - PAD - overlayTop);
  return {
    top: overlayTop,
    left,
    width,
    maxHeight: Math.max(
      anchorRect.height,
      Math.min(PREFERRED_HEIGHT, overlaySpace || anchorRect.height)
    ),
    placement: "overlay",
  };
}

function getViewportSize() {
  if (typeof window === "undefined") {
    return { vw: 1280, vh: 800 };
  }
  return { vw: window.innerWidth, vh: window.innerHeight };
}
