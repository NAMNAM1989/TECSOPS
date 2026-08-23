import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Shipment } from "../types/shipment";
import { blankShipmentDraft } from "../utils/blankShipment";
import {
  MobileDimKgModal,
  resolveDimChargeable,
  resolveDimModalStatus,
} from "./MobileDimKgModal";

const baseRow = {
  ...blankShipmentDraft("2026-08-23", "TCS"),
  id: "s1",
  stt: 1,
  awb: "17612345675",
  flight: "VN623",
  pcs: 2,
  kg: 20,
} as Shipment;

function renderModal(row: Shipment = baseRow) {
  return renderToStaticMarkup(
    <MobileDimKgModal row={row} onClose={() => undefined} onSave={() => undefined} />,
  );
}

describe("resolveDimModalStatus", () => {
  const base = {
    pcsExcess: false,
    pcsMatch: false,
    pcsShort: false,
    remainingPcs: 0,
    sumDimPcs: 0,
    declaredPcs: 10,
    actionNote: null,
    parseError: null,
    limitMessages: [] as string[],
  };

  it("ưu tiên dư kiện / lỗi hơn hạn mức và đủ kiện", () => {
    expect(
      resolveDimModalStatus({ ...base, pcsExcess: true, sumDimPcs: 12, pcsMatch: true }),
    ).toMatchObject({ tone: "danger" });
    expect(
      resolveDimModalStatus({ ...base, actionNote: "❌ Sai kích thước", pcsMatch: true }),
    ).toMatchObject({ tone: "danger", title: "Sai kích thước" });
  });

  it("hạn mức SCSC là warning, trước success đủ kiện", () => {
    expect(
      resolveDimModalStatus({
        ...base,
        pcsMatch: true,
        limitMessages: ["Vượt max 120×80×80"],
      }),
    ).toMatchObject({ tone: "warning", title: "Vượt max 120×80×80" });
  });

  it("đủ kiện → success; thiếu kiện → warning", () => {
    expect(resolveDimModalStatus({ ...base, pcsMatch: true })).toMatchObject({
      tone: "success",
    });
    expect(
      resolveDimModalStatus({
        ...base,
        pcsShort: true,
        remainingPcs: 3,
        sumDimPcs: 7,
      }),
    ).toMatchObject({ tone: "warning" });
  });
});

describe("resolveDimChargeable", () => {
  it("chargeable = max(kg, DIM) — cân thực khi DIM < gross", () => {
    expect(
      resolveDimChargeable({ declaredKg: 20, totalDim: 16, dimBelowGross: true }),
    ).toEqual({ kg: 20, source: "gross" });
    expect(
      resolveDimChargeable({ declaredKg: 10, totalDim: 16, dimBelowGross: false }),
    ).toEqual({ kg: 16, source: "dim" });
    expect(
      resolveDimChargeable({ declaredKg: 20, totalDim: null, dimBelowGross: null }),
    ).toEqual({ kg: null, source: null });
  });
});

describe("MobileDimKgModal UX", () => {
  it("mặc định Đo nhanh — Nâng cao thu gọn, không lộ mẫu/sinh ảo", () => {
    const html = renderModal();
    expect(html).toContain("Đo nhanh");
    expect(html).toContain("dim-quick-measure");
    expect(html).toContain("Nâng cao");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Mẫu · sinh ảo · gộp dòng");
    expect(html).not.toContain("Sinh ngay");
    expect(html).not.toContain("Điền đủ");
    expect(html).not.toContain("Gộp dòng giống");
    expect(html).not.toContain("Cấu hình Ước tính");
    expect(html).not.toContain("Đo thật");
    expect(html).not.toContain(">Nhanh<");
  });

  it("một banner trạng thái + totals chargeable; CTA Lưu ≥44px", () => {
    const html = renderModal({
      ...baseRow,
      kg: 40,
      dimLines: [{ lCm: 60, wCm: 40, hCm: 40, pcs: 2 }],
    });
    expect(html).toContain("dim-status-banner");
    expect(html).toContain('data-tone="success"');
    expect(html.match(/data-testid="dim-status-banner"/g)?.length).toBe(1);
    expect(html).toContain("dim-chargeable");
    expect(html).toContain("cân thực");
    expect(html).toContain("dim-save");
    expect(html).toContain("min-h-12");
    expect(html).toContain("Thêm dòng");
    expect(html).not.toContain("bg-red-50");
    expect(html).not.toContain("bg-amber-50");
    expect(html).not.toContain("bg-emerald-50");
  });

  it("dư kiện → banner danger; không đổi nhãn Đăng Nhập TCS", () => {
    const html = renderModal({
      ...baseRow,
      pcs: 1,
      dimLines: [{ lCm: 60, wCm: 40, hCm: 40, pcs: 2 }],
    });
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain("Dư kiện");
    expect(html).not.toContain("Đăng Nhập TCS");
  });

  it("DIM &gt; kg lô → chargeable theo DIM", () => {
    const html = renderModal({
      ...baseRow,
      kg: 10,
      pcs: 2,
      dimLines: [{ lCm: 60, wCm: 40, hCm: 40, pcs: 2 }],
    });
    expect(html).toContain("dim-chargeable");
    expect(html).toContain("· DIM");
  });
});
