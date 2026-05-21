import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildCutoffIsoFromDateAndTimeText,
  cutoffIsoToDateDdMon,
  cutoffIsoToTimeInputText,
  formatCutoffDisplayVi,
} from "../utils/bookingDateParse";
import { getCutoffUrgency } from "../utils/cutoffUrgency";

const inp =
  "w-full rounded-xl border-2 border-apple-blue bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums antialiased focus:outline-none focus:ring-2 focus:ring-apple-blue/20 dark:bg-ops-surface dark:text-ops-label";

const urgencyTone = {
  empty: "ops-grid-placeholder text-xs",
  ok: "font-semibold tabular-nums text-slate-900 dark:text-zinc-100",
  warning: "font-bold tabular-nums text-amber-700 dark:text-amber-300",
  urgent: "font-bold tabular-nums text-red-600 dark:text-red-400",
  past: "font-bold tabular-nums text-red-700 line-through opacity-80 dark:text-red-400",
} as const;

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
  const urgency = useMemo(() => getCutoffUrgency(cutoffIso), [cutoffIso]);

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
        className="flex w-full items-center gap-0.5 rounded px-1 py-0.5 text-left hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/30 dark:hover:bg-white/[0.06]"
      >
        {cutoffIso ? (
          <>
            {(urgency === "urgent" || urgency === "warning" || urgency === "past") && (
              <svg
                className={`h-3 w-3 shrink-0 ${urgency === "warning" ? "text-amber-600" : "text-red-600"}`}
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span className={`whitespace-nowrap text-xs ${urgencyTone[urgency]}`}>
              {formatCutoffDisplayVi(cutoffIso)}
            </span>
          </>
        ) : (
          <span className={`text-xs ${urgencyTone.empty}`}>Giờ / ngày</span>
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
