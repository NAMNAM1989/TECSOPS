import type { TcsExtPresence } from "../utils/tcsChromeExtension";
import { PORTAL_BAR_UI, PORTAL_EXT_CHIP_LABEL } from "./portalBarUi";

type Props = {
  presence: TcsExtPresence;
  title: string;
  testId: string;
  className?: string;
};

/** Chip Ext dùng chung TCS / SCSC — một trạng thái, không chồng badge. */
export function PortalExtStatusChip({
  presence,
  title,
  testId,
  className = "",
}: Props) {
  const label = PORTAL_EXT_CHIP_LABEL[presence];
  return (
    <span
      role="status"
      aria-label={`Ext ${label}`}
      title={title}
      data-testid={testId}
      data-ext-presence={presence}
      className={`${PORTAL_BAR_UI.chipBase} ${PORTAL_BAR_UI.chipTone[presence]} ${className}`}
    >
      Ext · {label}
    </span>
  );
}
