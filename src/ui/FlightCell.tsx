import { isCargoReportFlightDateUrgent } from "../utils/cargoDayReport";

export type FlightCellProps = {
  flight?: string;
  flightDate?: string;
  sessionYmd?: string;
  cutoff?: string;
  cutoffNote?: string;
  className?: string;
  "data-testid"?: string;
};

export function FlightCell({
  flight,
  flightDate,
  sessionYmd,
  cutoff,
  cutoffNote,
  className = "",
  "data-testid": testId,
}: FlightCellProps) {
  const isToday = Boolean(
    flightDate && sessionYmd && isCargoReportFlightDateUrgent(flightDate, sessionYmd)
  );

  return (
    <div data-testid={testId} className={`flex flex-col gap-0.5 ${className}`}>
      {/* Line 1: Flight number */}
      <span className="font-mono text-[13px] font-semibold tracking-tight text-ui-text">
        {flight || "—"}
      </span>

      {/* Line 2: Flight Date + badge if today */}
      <div className="flex items-center gap-1">
        <span
          className={`font-mono text-2xs ${
            isToday ? "font-bold text-red-700 dark:text-red-400" : "font-medium text-ui-text-muted"
          }`}
        >
          {flightDate || "—"}
        </span>

        {isToday ? (
          <span
            title="Chuyến bay trong ngày phiên"
            className="rounded bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 px-1 py-px text-2xs font-bold text-red-700 dark:text-red-300 select-none"
          >
            Hôm nay
          </span>
        ) : null}
      </div>

      {/* Line 3: Cutoff if exists */}
      {cutoff ? (
        <span className="text-2xs text-ui-text-muted truncate">
          {cutoff}
          {cutoffNote ? ` · ${cutoffNote}` : ""}
        </span>
      ) : null}
    </div>
  );
}
