import type { CSSProperties, ReactNode } from "react";

const RULER_PX = 22;
const MM_TO_PX = 96 / 25.4;

type Props = {
  pageWidthMm: number;
  pageHeightMm: number;
  /** Kích thước thật A4 trên màn hình (210×297 mm). */
  physicalSize?: boolean;
  /** Thu nhỏ khi không dùng physicalSize (0–1). */
  scale?: number;
  children: ReactNode;
};

function RulerTicks({
  lengthMm,
  axis,
  physicalSize,
  scale,
}: {
  lengthMm: number;
  axis: "horizontal" | "vertical";
  physicalSize: boolean;
  scale: number;
}) {
  const ticks: { mm: number; major: boolean; posPct: number }[] = [];
  for (let mm = 0; mm <= lengthMm; mm += 1) {
    ticks.push({ mm, major: mm % 10 === 0, posPct: (mm / lengthMm) * 100 });
  }

  const boxStyle: CSSProperties =
    axis === "horizontal"
      ? physicalSize
        ? { width: `${lengthMm}mm`, height: RULER_PX }
        : { width: lengthMm * MM_TO_PX * scale, height: RULER_PX }
      : physicalSize
        ? { width: RULER_PX, height: `${lengthMm}mm` }
        : { width: RULER_PX, height: lengthMm * MM_TO_PX * scale };

  return (
    <div
      className="relative shrink-0 bg-slate-100 text-[8px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
      style={boxStyle}
      aria-hidden
    >
      {ticks.map(({ mm, major, posPct }) => {
        if (axis === "horizontal") {
          return (
            <span
              key={mm}
              className="absolute bottom-0 border-l border-slate-400/70 dark:border-slate-500/70"
              style={{
                left: `${posPct}%`,
                height: major ? 10 : mm % 5 === 0 ? 6 : 3,
              }}
            >
              {major && mm > 0 ? (
                <span className="absolute -top-px left-0.5 -translate-y-full whitespace-nowrap tabular-nums">
                  {mm}
                </span>
              ) : null}
            </span>
          );
        }
        return (
          <span
            key={mm}
            className="absolute left-0 border-t border-slate-400/70 dark:border-slate-500/70"
            style={{
              top: `${posPct}%`,
              width: major ? 10 : mm % 5 === 0 ? 6 : 3,
            }}
          >
            {major && mm > 0 ? (
              <span className="absolute top-0.5 left-full ml-0.5 whitespace-nowrap tabular-nums">
                {mm}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/** Khung preview A4 kèm thước kẻ mm (trục X/Y). */
export function ScscWeighMmRulerFrame({
  pageWidthMm,
  pageHeightMm,
  physicalSize = false,
  scale = 1,
  children,
}: Props) {
  const pageBoxStyle: CSSProperties = physicalSize
    ? { width: `${pageWidthMm}mm`, height: `${pageHeightMm}mm` }
    : { width: pageWidthMm * MM_TO_PX * scale, height: pageHeightMm * MM_TO_PX * scale };

  return (
    <div className="inline-flex flex-col">
      <div className="flex" style={{ paddingLeft: RULER_PX }}>
        <RulerTicks
          lengthMm={pageWidthMm}
          axis="horizontal"
          physicalSize={physicalSize}
          scale={scale}
        />
      </div>
      <div className="flex">
        <RulerTicks lengthMm={pageHeightMm} axis="vertical" physicalSize={physicalSize} scale={scale} />
        <div className="relative shrink-0 overflow-hidden bg-white shadow-md ring-1 ring-black/15 dark:ring-white/20" style={pageBoxStyle}>
          {children}
        </div>
      </div>
    </div>
  );
}
