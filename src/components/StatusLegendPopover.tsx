import { useState, useRef, useEffect } from "react";
import { useUiV2, setUiV2Enabled } from "../utils/featureFlags";
import { statusLabel, statusIcon } from "./statusStyles";
import type { ShipmentStatus } from "../types/shipment";

export function StatusLegendPopover({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isV2 = useUiV2();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const toggleV2 = () => {
    setUiV2Enabled(!isV2);
  };

  const statusItems: Array<{ status: ShipmentStatus; desc: string }> = [
    { status: "PENDING", desc: "Đã tạo booking, chờ tiếp nhận vào kho" },
    { status: "RECEIVED", desc: "Hàng đã vào kho, bắt đầu quy trình cân đo" },
    { status: "VOLUME_DONE", desc: "Đã nhập đầy đủ số kiện & kích thước volume" },
    { status: "OLA_PULL", desc: "Kéo OLA / chuyển tiếp luồng tài liệu" },
    { status: "RECEPTION_COMPLETED", desc: "Hoàn tất kiểm đếm & tiếp nhận kho TCS" },
    { status: "WEIGH_SLIP", desc: "Đã nộp phiếu cân chính thức" },
    { status: "COMPLETED", desc: "Lô hàng lịch sử đã hoàn tất" },
  ];

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Chú giải màu trạng thái"
        title="Chú giải màu trạng thái"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-ui-border bg-ui-surface text-2xs font-bold text-ui-text-muted shadow-sm transition hover:border-ui-primary hover:bg-ui-surface-muted hover:text-ui-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus"
      >
        ?
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="false"
          aria-label="Bảng chú giải màu trạng thái"
          className="absolute right-0 top-full z-50 mt-1.5 w-80 max-w-[calc(100vw-24px)] rounded-xl border border-ui-border bg-ui-surface p-3.5 shadow-ui-lg animate-in fade-in-50 zoom-in-95 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-ui-border pb-2.5">
            <h4 className="m-0 text-xs font-bold uppercase tracking-wide text-ui-navy">
              Chú giải màu trạng thái
            </h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Đóng chú giải"
              className="rounded p-1 text-xs text-ui-text-muted hover:bg-ui-surface-muted hover:text-ui-text"
            >
              ✕
            </button>
          </div>

          {/* Banner thông tin chế độ UI v2 */}
          <div className="mt-2.5 rounded-lg border border-ui-border bg-ui-surface-muted p-2.5 text-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ui-text">
                Chế độ giao diện:{" "}
                <span className={isV2 ? "text-teal-700 font-bold" : "text-ui-text-muted"}>
                  {isV2 ? "UI v2 (Đang BẬT)" : "Tiêu chuẩn (UI v2 TẮT)"}
                </span>
              </span>
              <button
                type="button"
                onClick={toggleV2}
                className="rounded-md border border-ui-border bg-ui-surface px-2 py-0.5 text-2xs font-semibold text-ui-primary shadow-sm hover:bg-ui-surface-muted"
              >
                {isV2 ? "Tắt v2" : "Bật thử v2"}
              </button>
            </div>
            <p className="m-0 mt-1.5 text-ui-text-muted leading-relaxed">
              Màu trạng thái dùng bảng token chung, không trùng màu kho. Công tắc chỉ đổi cỡ chữ AWB thử nghiệm.
            </p>
          </div>

          {/* Danh sách trạng thái */}
          <div className="mt-2.5 space-y-2">
            {statusItems.map(({ status, desc }) => (
              <div key={status} className="flex items-start gap-2 text-2xs">
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center font-mono font-bold text-ui-text">
                  {statusIcon[status]}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-ui-text">{statusLabel[status]}</span>
                  <p className="m-0 text-ui-text-muted leading-snug">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
