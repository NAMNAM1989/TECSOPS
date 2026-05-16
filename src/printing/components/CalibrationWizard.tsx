import { useState } from "react";
import { createPortal } from "react-dom";
import type { A4WeighReceiptPrinterProfile } from "../printTypes";
import { mergeCalibrationCorrection } from "../calibrationMath";
import { isA4WeighProfile, isThermalProfile } from "../printerProfileStorage";
import type { PrinterProfile } from "../printTypes";

type Props = {
  open: boolean;
  profile: PrinterProfile;
  onSave: (profile: PrinterProfile) => void;
  onTestPrint: () => void;
  onClose: () => void;
};

export function CalibrationWizard({ open, profile, onSave, onTestPrint, onClose }: Props) {
  const [errorX, setErrorX] = useState(0);
  const [errorY, setErrorY] = useState(0);
  const [measuredW, setMeasuredW] = useState("");
  const [measuredH, setMeasuredH] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  if (!open || typeof document === "undefined") return null;

  const thermal = isThermalProfile(profile);
  const expectedW = thermal ? profile.labelWidthMm : 210;
  const expectedH = thermal ? profile.labelHeightMm : 297;

  const apply = () => {
    if (thermal) {
      const next = mergeCalibrationCorrection(
        {
          offsetXmm: profile.offsetXmm,
          offsetYmm: profile.offsetYmm,
          scaleX: 1,
          scaleY: 1,
        },
        {
          errorXmm: errorX,
          errorYmm: errorY,
          measuredWidthMm: measuredW ? Number(measuredW) : undefined,
          measuredHeightMm: measuredH ? Number(measuredH) : undefined,
          expectedWidthMm: expectedW,
          expectedHeightMm: expectedH,
        }
      );
      setWarnings(next.warnings);
      onSave({
        ...profile,
        offsetXmm: next.offsetXmm,
        offsetYmm: next.offsetYmm,
      });
      return;
    }
    if (!isA4WeighProfile(profile)) return;
    const next = mergeCalibrationCorrection(
      {
        offsetXmm: profile.offsetXmm,
        offsetYmm: profile.offsetYmm,
        scaleX: profile.scaleX,
        scaleY: profile.scaleY,
      },
      {
        errorXmm: errorX,
        errorYmm: errorY,
        measuredWidthMm: measuredW ? Number(measuredW) : undefined,
        measuredHeightMm: measuredH ? Number(measuredH) : undefined,
        expectedWidthMm: expectedW,
        expectedHeightMm: expectedH,
      }
    );
    setWarnings(next.warnings);
    const updated: A4WeighReceiptPrinterProfile = {
      ...profile,
      offsetXmm: next.offsetXmm,
      offsetYmm: next.offsetYmm,
      scaleX: next.scaleX,
      scaleY: next.scaleY,
    };
    onSave(updated);
  };

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-black/[0.12] bg-white p-4 shadow-apple">
        <h3 className="text-base font-semibold text-apple-label">Căn chỉnh in — {profile.name}</h3>
        <p className="mt-1 text-xs text-apple-secondary">
          In thử có khung/thước, đo bằng thước kẹp, nhập sai lệch (mm). Dương = in lệch sang phải / xuống.
        </p>

        <div className="mt-4 grid gap-3">
          <NumField label="Lệch ngang (mm)" value={errorX} onChange={(v) => setErrorX(v === "" ? 0 : v)} />
          <NumField label="Lệch dọc (mm)" value={errorY} onChange={(v) => setErrorY(v === "" ? 0 : v)} />
          <NumField
            label={`Chiều ngang đo được (kỳ vọng ${expectedW}mm)`}
            value={measuredW === "" ? "" : Number(measuredW)}
            onChange={(v) => setMeasuredW(v === "" ? "" : String(v))}
            optional
          />
          <NumField
            label={`Chiều dọc đo được (kỳ vọng ${expectedH}mm)`}
            value={measuredH === "" ? "" : Number(measuredH)}
            onChange={(v) => setMeasuredH(v === "" ? "" : String(v))}
            optional
          />
        </div>

        {!thermal ? (
          <p className="mt-2 text-[10px] text-apple-tertiary">
            Lệch đều → offset. Càng xuống càng lệch → scaleY. Càng phải càng lệch → scaleX.
          </p>
        ) : null}

        {warnings.length > 0 ? (
          <ul className="mt-2 list-disc pl-4 text-[10px] text-amber-800">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={onTestPrint} className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900">
            In thử căn chỉnh
          </button>
          <button type="button" onClick={apply} className="rounded-full bg-apple-blue px-3 py-1.5 text-xs font-semibold text-white">
            Áp dụng & lưu
          </button>
          <button type="button" onClick={onClose} className="ml-auto rounded-full border px-3 py-1.5 text-xs font-semibold text-apple-secondary">
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function NumField({
  label,
  value,
  onChange,
  optional,
}: {
  label: string;
  value: number | "";
  onChange: (n: number | "") => void;
  optional?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-semibold text-apple-secondary">{label}</span>
      <input
        type="number"
        step="0.1"
        value={value}
        placeholder={optional ? "Tùy chọn" : "0"}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? "" : Number(v));
        }}
        className="w-full rounded-lg border border-black/[0.12] px-3 py-2 text-sm"
      />
    </label>
  );
}
