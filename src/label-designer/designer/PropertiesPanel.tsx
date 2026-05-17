import { useState } from "react";
import {
  lineAngleDeg,
  lineLengthMm,
  setLineAngleFromStart,
  setLineHorizontal,
  setLineLengthFromStart,
  setLineVertical,
} from "../core/lineGeometry";
import {
  distributeTableColWidths,
  distributeTableRowHeights,
  getTableMasterCell,
  mergeTableCells,
  patchTableCell,
  setTableBorder,
  setTableColWidth,
  setTableRowHeight,
  unmergeTableCell,
} from "../core/tableEditor";
import type { LabelObject, LineObject, RectObject, TableObject } from "../core/types";

/* ─── Button style helpers ─────────────────────────────────────── */

const btnSm =
  "select-none inline-flex items-center justify-center rounded-md border border-black/[0.12] bg-white px-2 py-1 text-[10px] font-medium text-slate-700 shadow-sm transition-all duration-100 hover:bg-slate-50 active:scale-[0.93] active:bg-slate-100";

const btnDanger =
  "select-none inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm transition-all duration-100 hover:bg-red-100 hover:border-red-300 active:scale-[0.93] active:bg-red-200";

const sectionCard = "space-y-2.5 rounded-xl border border-black/[0.09] bg-white p-3 shadow-sm";

const inputCls =
  "mt-0.5 w-full rounded-lg border border-black/[0.12] bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-inner " +
  "placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 " +
  "transition-shadow";

const inputSmCls =
  "mt-0.5 w-full rounded-md border border-black/[0.12] bg-white px-2 py-1 text-[10px] font-mono text-slate-800 " +
  "focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400/20 transition-shadow";

const labelCls = "block text-[10px] font-medium text-slate-500";

/* ─── BIND_HINTS ─────────────────────────────────────────────────── */

const BIND_HINTS = [
  "{{awb}}",
  "{{mawb}}",
  "{{origin}}",
  "{{dest}}",
  "{{pieces}}",
  "{{airlineLine1}}",
  "{{hawbLine}}",
  "{{awbDigits}}",
  "{{shipperName}}",
  "{{consigneeName}}",
  "{{grossWeight}}",
  "{{chargeableWeight}}",
];

/* ─── Props ──────────────────────────────────────────────────────── */

type Props = {
  selected: LabelObject | null;
  onPatch: (patch: Partial<LabelObject>) => void;
  onReplace: (obj: LabelObject) => void;
  onDelete: () => void;
  onDuplicate: () => void;
};

export function PropertiesPanel({ selected, onPatch, onReplace, onDelete, onDuplicate }: Props) {
  const [cellR, setCellR] = useState(0);
  const [cellC, setCellC] = useState(0);
  const [mergeR2, setMergeR2] = useState(0);
  const [mergeC2, setMergeC2] = useState(0);

  if (!selected) {
    return (
      <div className="rounded-xl border border-black/[0.07] bg-white/60 p-4 text-center">
        <p className="text-[11px] leading-relaxed text-slate-400">
          Chọn một đối tượng trên canvas để chỉnh thuộc tính.
        </p>
      </div>
    );
  }

  const numField = (label: string, key: keyof LabelObject, step = 0.5) => (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input
        type="number"
        step={step}
        className={inputSmCls}
        value={(selected[key] as number) ?? 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onPatch({ [key]: n } as Partial<LabelObject>);
        }}
      />
    </label>
  );

  const handleImageFile = (file: File | undefined) => {
    if (!file || selected.type !== "image") return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onPatch({ src: reader.result });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Object header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {selected.type}
          </span>
          <span className="ml-1.5 font-mono text-[9px] text-slate-400">{selected.id.slice(-8)}</span>
        </div>
        <div className="flex gap-1.5">
          <button type="button" className={btnSm} onClick={onDuplicate} title="Nhân đôi">
            ⧉ Nhân đôi
          </button>
          <button type="button" className={btnDanger} onClick={onDelete} title="Xóa đối tượng">
            🗑 Xóa
          </button>
        </div>
      </div>

      {/* Position & Size */}
      <div className={sectionCard}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Vị trí & Kích thước</p>
        <div className="grid grid-cols-2 gap-2">
          {numField("X (mm)", "x")}
          {numField("Y (mm)", "y")}
          {selected.type !== "line" && "width" in selected ? numField("Rộng (mm)", "width" as keyof LabelObject) : null}
          {selected.type !== "line" && "height" in selected ? numField("Cao (mm)", "height" as keyof LabelObject) : null}
          {selected.type === "text" ? numField("Cỡ chữ (mm)", "fontSize" as keyof LabelObject, 0.5) : null}
          {numField("Z-index", "zIndex" as keyof LabelObject, 1)}
        </div>
      </div>

      {/* Line props */}
      {selected.type === "line" ? <LineProps line={selected} onReplace={onReplace} onPatch={onPatch} /> : null}

      {/* Rect props */}
      {selected.type === "rect" ? <RectProps rect={selected} onPatch={onPatch} /> : null}

      {/* Text / barcode / QR content */}
      {(selected.type === "text" || selected.type === "barcode" || selected.type === "qr") && (
        <div className={sectionCard}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Nội dung</p>
          <label className="block">
            <span className={labelCls}>Nội dung tĩnh</span>
            <input
              className={inputCls}
              value={
                selected.type === "text" ? selected.text : selected.type === "barcode" ? selected.value : selected.value
              }
              onChange={(e) => {
                if (selected.type === "text") onPatch({ text: e.target.value });
                else onPatch({ value: e.target.value });
              }}
              placeholder="Nhập nội dung..."
            />
          </label>
          <label className="block">
            <span className={labelCls}>Bind (ưu tiên khi in)</span>
            <input
              className={inputCls}
              value={selected.bind ?? ""}
              onChange={(e) => onPatch({ bind: e.target.value || undefined })}
              list="bind-hints-dl"
              placeholder="{{awb}}"
            />
            <datalist id="bind-hints-dl">
              {BIND_HINTS.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </label>
          {selected.type === "text" && (
            <label className="block">
              <span className={labelCls}>Căn chỉnh</span>
              <select
                className={inputCls}
                value={selected.align ?? "left"}
                onChange={(e) => onPatch({ align: e.target.value as "left" | "center" | "right" })}
              >
                <option value="left">⇤ Trái</option>
                <option value="center">↔ Giữa</option>
                <option value="right">⇥ Phải</option>
              </select>
            </label>
          )}
        </div>
      )}

      {/* Image */}
      {selected.type === "image" && (
        <div className={sectionCard}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Hình ảnh</p>
          <label className="block cursor-pointer select-none">
            <div className="flex items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 hover:border-blue-400 hover:bg-blue-50 transition-colors">
              <span className="text-lg">⊡</span>
              <div>
                <p className="text-[11px] font-medium text-slate-600">Chọn tệp ảnh</p>
                <p className="text-[9px] text-slate-400">PNG, JPG, SVG…</p>
              </div>
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageFile(e.target.files?.[0])} />
          </label>
          {selected.src ? (
            <img src={selected.src} alt="" className="w-full max-h-24 rounded-lg border border-black/[0.08] object-contain bg-slate-50" />
          ) : (
            <p className="text-center text-[10px] text-slate-400">Chưa có ảnh.</p>
          )}
          <label className="block">
            <span className={labelCls}>URL / Data URL</span>
            <input
              className={inputCls + " font-mono text-[10px]"}
              value={selected.src}
              onChange={(e) => onPatch({ src: e.target.value })}
              placeholder="https://..."
            />
          </label>
        </div>
      )}

      {/* Table */}
      {selected.type === "table" && (
        <TableProps
          table={selected}
          cellR={cellR}
          cellC={cellC}
          mergeR2={mergeR2}
          mergeC2={mergeC2}
          onCellR={setCellR}
          onCellC={setCellC}
          onMergeR2={setMergeR2}
          onMergeC2={setMergeC2}
          onReplace={onReplace}
        />
      )}

      {/* Hide when */}
      <div className={sectionCard}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Hiển thị có điều kiện</p>
        <label className="block">
          <span className={labelCls}>Ẩn khi giá trị truthy</span>
          <input
            className={inputCls + " font-mono"}
            value={selected.hideWhen ?? ""}
            onChange={(e) => onPatch({ hideWhen: e.target.value || undefined })}
            placeholder="{{hasHawb}}"
          />
        </label>
      </div>
    </div>
  );
}

/* ─── ColorField ─────────────────────────────────────────────────── */

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <div className="mt-0.5 flex gap-1.5">
        <input
          type="color"
          className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-black/[0.12] p-0.5 transition-all hover:scale-105 active:scale-95"
          value={value.startsWith("#") ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className={inputSmCls + " flex-1"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </label>
  );
}

/* ─── LineProps ──────────────────────────────────────────────────── */

function LineProps({
  line,
  onReplace,
  onPatch,
}: {
  line: LineObject;
  onReplace: (obj: LabelObject) => void;
  onPatch: (patch: Partial<LabelObject>) => void;
}) {
  const len = lineLengthMm(line);
  const angle = Math.round(lineAngleDeg(line) * 10) / 10;

  const numLine = (label: string, key: "x" | "y" | "x2" | "y2" | "strokeWidth", step = 0.5) => (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input
        type="number"
        step={step}
        className={inputSmCls}
        value={line[key] ?? 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onPatch({ [key]: n });
        }}
      />
    </label>
  );

  return (
    <div className={sectionCard}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Đường kẻ</p>
      <div className="grid grid-cols-2 gap-2">
        {numLine("Điểm đầu X", "x")}
        {numLine("Điểm đầu Y", "y")}
        {numLine("Điểm cuối X", "x2")}
        {numLine("Điểm cuối Y", "y2")}
      </div>
      <label className="block">
        <span className={labelCls}>Chiều dài (mm)</span>
        <input
          type="number"
          step={0.5}
          min={0.5}
          className={inputSmCls}
          value={Math.round(len * 100) / 100}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n > 0) onReplace(setLineLengthFromStart(line, n));
          }}
        />
      </label>
      <label className="block">
        <span className={labelCls}>Góc (độ)</span>
        <input
          type="number"
          step={1}
          className={inputSmCls}
          value={angle}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onReplace(setLineAngleFromStart(line, n));
          }}
        />
      </label>
      {numLine("Độ dày nét (mm)", "strokeWidth", 0.05)}
      <ColorField
        label="Màu nét"
        value={line.stroke ?? "#000000"}
        onChange={(stroke) => onPatch({ stroke })}
      />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={btnSm} onClick={() => onReplace(setLineHorizontal(line))}>
          ↔ Ngang
        </button>
        <button type="button" className={btnSm} onClick={() => onReplace(setLineVertical(line))}>
          ↕ Dọc
        </button>
        <button type="button" className={btnSm} onClick={() => onReplace(setLineLengthFromStart(line, 50))}>
          50mm
        </button>
      </div>
      <p className="text-[9px] text-slate-400">💡 Kéo hai đầu tròn xanh trên canvas để chỉnh trực tiếp.</p>
    </div>
  );
}

/* ─── RectProps ──────────────────────────────────────────────────── */

function RectProps({ rect, onPatch }: { rect: RectObject; onPatch: (patch: Partial<LabelObject>) => void }) {
  const numRect = (label: string, key: keyof RectObject, step = 0.5) => (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input
        type="number"
        step={step}
        className={inputSmCls}
        value={(rect[key] as number) ?? 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onPatch({ [key]: n } as Partial<LabelObject>);
        }}
      />
    </label>
  );

  return (
    <div className={sectionCard}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Hình chữ nhật</p>
      <div className="grid grid-cols-2 gap-2">
        {numRect("Rộng (mm)", "width")}
        {numRect("Cao (mm)", "height")}
        {numRect("Bo góc (mm)", "cornerRadius", 0.5)}
        {numRect("Độ dày viền", "strokeWidth", 0.05)}
      </div>
      <ColorField label="Màu viền" value={rect.stroke ?? "#000000"} onChange={(stroke) => onPatch({ stroke })} />
      <ColorField
        label="Màu nền"
        value={rect.fill && rect.fill !== "transparent" ? rect.fill : "#ffffff"}
        onChange={(fill) => onPatch({ fill: fill === "#ffffff" ? "transparent" : fill })}
      />
      <label className="flex cursor-pointer select-none items-center gap-2 text-[10px] text-slate-600">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-blue-500"
          checked={!rect.fill || rect.fill === "transparent"}
          onChange={(e) => onPatch({ fill: e.target.checked ? "transparent" : "#ffffff" })}
        />
        Không tô nền (trong suốt)
      </label>
    </div>
  );
}

/* ─── TableProps ─────────────────────────────────────────────────── */

function TableProps({
  table,
  cellR,
  cellC,
  mergeR2,
  mergeC2,
  onCellR,
  onCellC,
  onMergeR2,
  onMergeC2,
  onReplace,
}: {
  table: TableObject;
  cellR: number;
  cellC: number;
  mergeR2: number;
  mergeC2: number;
  onCellR: (n: number) => void;
  onCellC: (n: number) => void;
  onMergeR2: (n: number) => void;
  onMergeC2: (n: number) => void;
  onReplace: (obj: LabelObject) => void;
}) {
  const { r: mr, c: mc } = getTableMasterCell(table, cellR, cellC);
  const masterKey = `${mr}:${mc}`;
  const masterCell = table.cells[masterKey];

  return (
    <div className={sectionCard}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        Bảng {table.rows} × {table.cols}
        <span className="ml-2 font-mono normal-case text-slate-400">
          {Math.round(table.width * 10) / 10} × {Math.round(table.height * 10) / 10} mm
        </span>
      </p>

      {/* Table global props */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={labelCls}>Độ dày khung (mm)</span>
          <input
            type="number"
            step={0.05}
            min={0.05}
            className={inputSmCls}
            value={table.borderWidth ?? 0.25}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onReplace(setTableBorder(table, n));
            }}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Cỡ chữ (mm)</span>
          <input
            type="number"
            step={0.25}
            min={1.5}
            className={inputSmCls}
            value={table.fontSize ?? 3}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onReplace({ ...table, fontSize: n });
            }}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Rộng tổng (mm)</span>
          <input
            type="number"
            step={0.5}
            min={10}
            className={inputSmCls}
            value={table.width}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) onReplace(distributeTableColWidths(table, n));
            }}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Cao tổng (mm)</span>
          <input
            type="number"
            step={0.5}
            min={6}
            className={inputSmCls}
            value={table.height}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) onReplace(distributeTableRowHeights(table, n));
            }}
          />
        </label>
      </div>

      <ColorField
        label="Màu khung"
        value={table.borderColor ?? "#000000"}
        onChange={(borderColor) => onReplace(setTableBorder(table, table.borderWidth ?? 0.25, borderColor))}
      />

      {/* Add / remove rows & cols */}
      <div>
        <p className={labelCls + " mb-1.5"}>Dòng & Cột</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={btnSm}
            onClick={() => {
              const rows = table.rows + 1;
              const rowHeights = [...table.rowHeights, 8];
              onReplace({ ...table, rows, rowHeights, height: rowHeights.reduce((a, b) => a + b, 0) });
            }}
          >
            + Dòng
          </button>
          <button
            type="button"
            className={btnSm}
            onClick={() => {
              if (table.rows <= 1) return;
              const rowHeights = table.rowHeights.slice(0, -1);
              onReplace({ ...table, rows: table.rows - 1, rowHeights, height: rowHeights.reduce((a, b) => a + b, 0) });
            }}
          >
            − Dòng
          </button>
          <button
            type="button"
            className={btnSm}
            onClick={() => {
              const cols = table.cols + 1;
              const colWidths = [...table.colWidths, 25];
              onReplace({ ...table, cols, colWidths, width: colWidths.reduce((a, b) => a + b, 0) });
            }}
          >
            + Cột
          </button>
          <button
            type="button"
            className={btnSm}
            onClick={() => {
              if (table.cols <= 1) return;
              const colWidths = table.colWidths.slice(0, -1);
              onReplace({ ...table, cols: table.cols - 1, colWidths, width: colWidths.reduce((a, b) => a + b, 0) });
            }}
          >
            − Cột
          </button>
        </div>
      </div>

      {/* Cell editor */}
      <div className="rounded-lg border border-black/[0.07] bg-slate-50 p-2.5">
        <p className={labelCls + " mb-2"}>Chọn ô để sửa</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelCls}>Hàng (0-{table.rows - 1})</span>
            <input
              type="number"
              min={0}
              max={table.rows - 1}
              className={inputSmCls}
              value={cellR}
              onChange={(e) => onCellR(Math.min(table.rows - 1, Math.max(0, Number(e.target.value) || 0)))}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Cột (0-{table.cols - 1})</span>
            <input
              type="number"
              min={0}
              max={table.cols - 1}
              className={inputSmCls}
              value={cellC}
              onChange={(e) => onCellC(Math.min(table.cols - 1, Math.max(0, Number(e.target.value) || 0)))}
            />
          </label>
        </div>
        <label className="mt-2 block">
          <span className={labelCls}>Nội dung ô ({mr},{mc})</span>
          <input
            className={inputCls + " font-mono"}
            value={masterCell?.text ?? ""}
            onChange={(e) => onReplace(patchTableCell(table, mr, mc, { text: e.target.value }))}
            placeholder="Nhập nội dung..."
          />
        </label>
        <label className="mt-2 block">
          <span className={labelCls}>Rộng cột {mc} (mm)</span>
          <input
            type="number"
            step={0.5}
            className={inputSmCls}
            value={table.colWidths[mc]}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onReplace(setTableColWidth(table, mc, n));
            }}
          />
        </label>
        <label className="mt-2 block">
          <span className={labelCls}>Cao dòng {mr} (mm)</span>
          <input
            type="number"
            step={0.5}
            className={inputSmCls}
            value={table.rowHeights[mr]}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onReplace(setTableRowHeight(table, mr, n));
            }}
          />
        </label>
      </div>

      {/* Merge / unmerge */}
      <div>
        <p className={labelCls + " mb-1.5"}>Gộp ô từ ({cellR},{cellC}) đến</p>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelCls}>Đến hàng</span>
            <input
              type="number"
              min={0}
              max={table.rows - 1}
              className={inputSmCls}
              value={mergeR2}
              onChange={(e) => onMergeR2(Number(e.target.value) || 0)}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Đến cột</span>
            <input
              type="number"
              min={0}
              max={table.cols - 1}
              className={inputSmCls}
              value={mergeC2}
              onChange={(e) => onMergeC2(Number(e.target.value) || 0)}
            />
          </label>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            className={btnSm}
            onClick={() => onReplace(mergeTableCells(table, cellR, cellC, mergeR2, mergeC2))}
          >
            ⊞ Gộp ô
          </button>
          <button
            type="button"
            className={btnSm}
            onClick={() => onReplace(unmergeTableCell(table, cellR, cellC))}
          >
            ⊟ Tách ô
          </button>
        </div>
      </div>
    </div>
  );
}
