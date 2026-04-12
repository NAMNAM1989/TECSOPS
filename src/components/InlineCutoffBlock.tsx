import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  buildCutoffIsoFromDateAndTimeText,
  cutoffIsoToDateDdMon,
  cutoffIsoToTimeInputText,
  formatCutoffDisplayVi,
} from "../utils/bookingDateParse";

const inp =
  "w-full rounded-xl border-2 border-apple-blue bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums antialiased focus:outline-none focus:ring-2 focus:ring-apple-blue/20";

type Props = {
  rowId: string;
  cutoffIso: string;
  sessionYear: number;
  onCommit: (iso: string) => void;
  /** Sau Enter ở ô ngày (đã commit thành công). */
  onEnterAfterCommit?: () => void;
};

export function InlineCutoffBlock({ rowId, cutoffIso, sessionYear, onCommit, onEnterAfterCommit }: Props) {
  const [editing, setEditing] = useState(false);
  const [timeDraft, setTimeDraft] = useState("");
  const [dateDraft, setDateDraft] = useState("");
  const timeRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const syncFromIso = (iso: string) => {
    setTimeDraft(cutoffIsoToTimeInputText(iso));
    setDateDraft(cutoffIsoToDateDdMon(iso));
  };

  useEffect(() => {
    if (!editing) syncFromIso(cutoffIso);
  }, [cutoffIso, editing]);

  useLayoutEffect(() => {
    if (!editing) return;
    timeRef.current?.focus();
    timeRef.current?.select();
  }, [editing]);

  const gridBtn = { "data-grid-row": rowId, "data-grid-field": "cutoff" };

  function commit(): boolean {
    const iso = buildCutoffIsoFromDateAndTimeText(dateDraft, timeDraft, sessionYear);
    const dEmpty = !dateDraft.trim();
    const tEmpty = !timeDraft.trim();
    if (dEmpty && tEmpty) {
      if (cutoffIso) onCommit("");
      setEditing(false);
      return true;
    }
    if (!iso) {
      window.alert(
        "Cutoff: nhập đủ ngày (VD 15APR) và giờ (VD 17H, 17:30, 1730), hoặc xóa hết cả hai ô."
      );
      return false;
    }
    if (iso !== cutoffIso) onCommit(iso);
    setEditing(false);
    return true;
  }

  if (!editing) {
    return (
      <button
        type="button"
        {...gridBtn}
        onClick={(e) => {
          e.stopPropagation();
          syncFromIso(cutoffIso);
          setEditing(true);
        }}
        onFocus={(e) => {
          e.stopPropagation();
          syncFromIso(cutoffIso);
          setEditing(true);
        }}
        className="w-full rounded px-1 py-0.5 text-left hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/30"
      >
        {cutoffIso ? (
          <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-apple-label">
            {formatCutoffDisplayVi(cutoffIso)}
          </span>
        ) : (
          <span className="text-xs italic text-apple-tertiary">Giờ / ngày</span>
        )}
      </button>
    );
  }

  return (
    <div
      className="flex flex-col gap-1"
      onBlur={(e) => {
        const rt = e.relatedTarget as Node | null;
        if (rt && e.currentTarget.contains(rt)) return;
        commit();
      }}
    >
      <input
        ref={timeRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        data-grid-row={rowId}
        data-grid-field="cutoffTime"
        value={timeDraft}
        onChange={(e) => setTimeDraft(e.target.value.toUpperCase())}
        placeholder="17H"
        maxLength={8}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) {
            e.preventDefault();
            dateRef.current?.focus();
            dateRef.current?.select();
          }
          if (e.key === "Escape") {
            syncFromIso(cutoffIso);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={inp}
      />
      <input
        ref={dateRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        data-grid-row={rowId}
        data-grid-field="cutoffDate"
        value={dateDraft}
        onChange={(e) => setDateDraft(e.target.value.toUpperCase())}
        placeholder="15APR"
        maxLength={16}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !(e.nativeEvent as KeyboardEvent).isComposing) {
            e.preventDefault();
            if (commit()) queueMicrotask(() => onEnterAfterCommit?.());
          }
          if (e.key === "Escape") {
            syncFromIso(cutoffIso);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={inp}
      />
    </div>
  );
}
