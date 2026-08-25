import { useCallback, useEffect, useMemo, useState } from "react";
import { OverflowMenu, type OverflowMenuItem } from "../ui/OverflowMenu";
import { useToast } from "../ui";
import {
  fetchChromeExtensionsCatalog,
  recommendedChromeExtensionPacks,
  triggerChromeExtensionDownload,
  type ChromeExtensionPackInfo,
} from "../utils/chromeExtensionDownloads";

type Props = {
  compact?: boolean;
};

/** Items overflow «Tải Ext» — dùng chung desktop menu và mobile chrome ⋯. */
export function useChromeExtensionMenuItems(): OverflowMenuItem[] {
  const toast = useToast();
  const [packs, setPacks] = useState<ChromeExtensionPackInfo[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const catalog = await fetchChromeExtensionsCatalog();
      setPacks(recommendedChromeExtensionPacks(catalog.extensions));
      setLoadError(
        catalog.ok
          ? null
          : catalog.error || "Chưa có gói Ext — cần build/deploy lại.",
      );
    } catch (e) {
      setPacks(null);
      setLoadError(e instanceof Error ? e.message : "Không tải được danh sách Ext");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const downloadPack = useCallback(async (pack: ChromeExtensionPackInfo) => {
    setBusyId(String(pack.id));
    try {
      let target = pack;
      if (!target.ok || !target.download_url) {
        const catalog = await fetchChromeExtensionsCatalog();
        const recommended = recommendedChromeExtensionPacks(catalog.extensions);
        setPacks(recommended);
        target =
          recommended.find((x) => x.id === pack.id) ||
          recommended.find((x) => x.label === pack.label) ||
          pack;
      }
      triggerChromeExtensionDownload(target);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Tải Chrome Ext thất bại",
        "Chrome Ext"
      );
    } finally {
      setBusyId(null);
    }
  }, [toast]);

  const items = useMemo((): OverflowMenuItem[] => {
    const list = packs?.length
      ? packs
      : ([
          { ok: false, id: "tcs", label: "TCS" },
          { ok: false, id: "scsc", label: "SCSC" },
        ] satisfies ChromeExtensionPackInfo[]);

    return list.map((pack) => {
      const version = pack.version ? `v${pack.version}` : "—";
      const busy = busyId === String(pack.id);
      const descParts = [
        pack.title || pack.warehouse || pack.label,
        pack.ok ? version : pack.error || loadError || "Chưa đóng gói",
      ];
      return {
        id: String(pack.id),
        label: busy ? `Đang tải ${pack.label}…` : `Tải Ext ${pack.label}`,
        description: descParts.filter(Boolean).join(" · "),
        disabled: busy || Boolean(busyId),
        onPrefetch: () => {
          if (!packs) void refresh();
        },
        onSelect: () => {
          void downloadPack(pack);
        },
      };
    });
  }, [busyId, downloadPack, loadError, packs, refresh]);

  return items;
}

/**
 * Nút tải Chrome Ext chuẩn: TCS + SCSC.
 */
export function ChromeExtensionsDownloadMenu({ compact = false }: Props) {
  const items = useChromeExtensionMenuItems();

  return (
    <OverflowMenu
      label="Tải Ext"
      compact={compact}
      align="right"
      items={items}
      triggerClassName={
        compact
          ? "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-ui-border bg-ui-surface text-ui-navy shadow-ui-sm transition hover:bg-ui-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus touch-manipulation"
          : undefined
      }
    >
      {compact ? (
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12l4.5 4.5L16.5 12M12 3v13.5"
          />
        </svg>
      ) : null}
    </OverflowMenu>
  );
}
