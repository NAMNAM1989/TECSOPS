import { useState } from "react";
import { EsidAgentSettingsButton } from "./EsidAgentSettingsButton";
import { EsidRegistrantSettingsButton } from "./EsidRegistrantSettingsButton";
import { Button } from "../ui";

type Props = {
  disabled?: boolean;
  compact?: boolean;
};

/**
 * Gom Cài đặt ESID (Người khai + Agent) — một entry, hai panel.
 * Không đổi schema / store.
 */
export function EsidSettingsMenu({ disabled, compact }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-xl border border-ui-border bg-ui-surface px-3 text-[12px] font-semibold text-ui-text shadow-ui-sm transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus disabled:opacity-45 touch-manipulation"
        title="Cài đặt hồ sơ ESID (Người khai · Agent)"
        aria-expanded={open}
      >
        {compact ? "ESID" : "Cài đặt ESID"}
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[12rem] rounded-xl border border-ui-border bg-ui-surface p-2 shadow-md"
          role="dialog"
          aria-label="Cài đặt ESID"
        >
          <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-ui-text-muted">
            Cài đặt ESID
          </p>
          <div className="flex flex-col gap-1.5">
            <EsidRegistrantSettingsButton disabled={disabled} compact={false} />
            <EsidAgentSettingsButton disabled={disabled} compact={false} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setOpen(false)}
          >
            Đóng
          </Button>
        </div>
      ) : null}
    </div>
  );
}
