/**
 * Scene graph tem tối thiểu (mm) — dùng chung preview HTML / TSPL sau này.
 */
import type { LabelElement, LabelFieldKey, LabelScene } from "./labelFoundationTypes";
import type { LabelSheetFormat } from "../utils/labelSheetFormat";

const MASTER_REQUIRED: LabelFieldKey[] = [
  "shipment.mawb",
  "shipment.origin",
  "shipment.destination",
  "shipment.pieces",
];

const HOUSE_REQUIRED: LabelFieldKey[] = [
  "house.hawb",
  "shipment.mawb",
  "shipment.destination",
  "house.pieces",
];

export function canvasMmForFormat(format: LabelSheetFormat): {
  canvasWidthMm: number;
  canvasHeightMm: number;
} {
  return {
    canvasWidthMm: 100,
    canvasHeightMm: format === "100x50" ? 50 : 80,
  };
}

export function emptyLabelScene(format: LabelSheetFormat): LabelScene {
  const { canvasWidthMm, canvasHeightMm } = canvasMmForFormat(format);
  return { canvasWidthMm, canvasHeightMm, format, elements: [] };
}

function elementBounds(el: LabelElement): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const w = Math.max(0, el.widthMm);
  const h = Math.max(0, el.heightMm);
  return { x0: el.xMm, y0: el.yMm, x1: el.xMm + w, y1: el.yMm + h };
}

export type LabelSceneValidation = {
  ok: boolean;
  errors: string[];
};

export function validateLabelScene(
  scene: LabelScene,
  opts?: { kind?: "master-cargo" | "house-cargo"; requireMandatoryFields?: boolean }
): LabelSceneValidation {
  const errors: string[] = [];
  const { canvasWidthMm, canvasHeightMm } = scene;

  if (scene.format !== "100x80" && scene.format !== "100x50") {
    errors.push("Khổ tem chỉ hỗ trợ 100×80 hoặc 100×50");
  }
  const expected = canvasMmForFormat(scene.format);
  if (
    Math.abs(canvasWidthMm - expected.canvasWidthMm) > 0.01 ||
    Math.abs(canvasHeightMm - expected.canvasHeightMm) > 0.01
  ) {
    errors.push(
      `Canvas phải là ${expected.canvasWidthMm}×${expected.canvasHeightMm} mm cho khổ ${scene.format}`
    );
  }

  const ids = new Set<string>();
  for (const el of scene.elements) {
    if (!el.id || ids.has(el.id)) {
      errors.push(`Element id trùng hoặc trống: ${el.id || "(empty)"}`);
    } else {
      ids.add(el.id);
    }
    const b = elementBounds(el);
    if (b.x0 < -0.01 || b.y0 < -0.01 || b.x1 > canvasWidthMm + 0.01 || b.y1 > canvasHeightMm + 0.01) {
      errors.push(`Element ${el.id} vượt canvas`);
    }
    if (el.type === "data-text" && !el.fieldKey) {
      errors.push(`Element ${el.id}: data-text thiếu fieldKey`);
    }
  }

  if (opts?.requireMandatoryFields) {
    const present = new Set(
      scene.elements.filter((e) => e.visible && e.fieldKey).map((e) => e.fieldKey as LabelFieldKey)
    );
    const required = opts.kind === "house-cargo" ? HOUSE_REQUIRED : MASTER_REQUIRED;
    for (const key of required) {
      if (!present.has(key)) {
        errors.push(`Thiếu field bắt buộc: ${key}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Scene mặc định khớp LabelContent Master (4 vùng logic, tọa độ gần đúng). */
export function defaultMasterLabelScene(format: LabelSheetFormat): LabelScene {
  const scene = emptyLabelScene(format);
  const compact = format === "100x50";
  const airlineH = compact ? 8 : 10;
  const mawbH = compact ? 14 : 22;
  const routeH = compact ? 12 : 18;
  const piecesH = compact ? 16 : 30;

  const elements: LabelElement[] = [
    {
      id: "airline",
      type: "data-text",
      fieldKey: "shipment.airline",
      xMm: 2,
      yMm: 1,
      widthMm: 96,
      heightMm: airlineH,
      rotation: 0,
      zIndex: 1,
      locked: false,
      visible: true,
      style: { fontFamily: "sans", fontMm: compact ? 3.3 : 4.2, bold: true, align: "center" },
    },
    {
      id: "mawb",
      type: "data-text",
      fieldKey: "shipment.mawb",
      xMm: 2,
      yMm: 1 + airlineH,
      widthMm: 96,
      heightMm: mawbH,
      rotation: 0,
      zIndex: 2,
      locked: false,
      visible: true,
      style: { fontFamily: "sans", fontMm: compact ? 8 : 12, bold: true, align: "center" },
    },
    {
      id: "origin",
      type: "data-text",
      fieldKey: "shipment.origin",
      xMm: 2,
      yMm: 1 + airlineH + mawbH,
      widthMm: 47,
      heightMm: routeH,
      rotation: 0,
      zIndex: 3,
      locked: false,
      visible: true,
      style: { fontFamily: "sans", fontMm: compact ? 6 : 9, bold: true, align: "center" },
    },
    {
      id: "destination",
      type: "data-text",
      fieldKey: "shipment.destination",
      xMm: 51,
      yMm: 1 + airlineH + mawbH,
      widthMm: 47,
      heightMm: routeH,
      rotation: 0,
      zIndex: 4,
      locked: false,
      visible: true,
      style: { fontFamily: "sans", fontMm: compact ? 7 : 10, bold: true, align: "center" },
    },
    {
      id: "pieces",
      type: "data-text",
      fieldKey: "shipment.pieces",
      xMm: 2,
      yMm: Math.max(1, scene.canvasHeightMm - piecesH - 1),
      widthMm: 96,
      heightMm: piecesH,
      rotation: 0,
      zIndex: 5,
      locked: false,
      visible: true,
      style: { fontFamily: "sans", fontMm: compact ? 12 : 20, bold: true, align: "center" },
    },
  ];

  return { ...scene, elements };
}
