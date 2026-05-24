import { formatScscCoordMm } from "./scscFieldCoords";

export type ScscWeighDragGuide = {
  mode: "move" | "resize";
  xMm: number;
  yMm: number;
  widthMm?: number;
};

type Props = {
  guide: ScscWeighDragGuide;
  pageWidthMm: number;
  pageHeightMm: number;
};

const GUIDE_COLOR = "rgba(0, 122, 255, 0.92)";

function GuideLine({
  vertical,
  atMm,
  spanMm,
}: {
  vertical: boolean;
  atMm: number;
  spanMm: number;
}) {
  const style = vertical
    ? {
        position: "absolute" as const,
        left: `${atMm}mm`,
        top: 0,
        height: `${spanMm}mm`,
        width: 0,
        borderLeft: `1.5px dashed ${GUIDE_COLOR}`,
        boxShadow: "0 0 0 0.5px rgba(255,255,255,0.6)",
      }
    : {
        position: "absolute" as const,
        left: 0,
        top: `${atMm}mm`,
        width: `${spanMm}mm`,
        height: 0,
        borderTop: `1.5px dashed ${GUIDE_COLOR}`,
        boxShadow: "0 0 0 0.5px rgba(255,255,255,0.6)",
      };

  return <div style={style} />;
}

export function ScscWeighDragGuides({ guide, pageWidthMm, pageHeightMm }: Props) {
  const rightMm =
    guide.mode === "resize" && guide.widthMm != null ? guide.xMm + guide.widthMm : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[60]" aria-hidden>
      <GuideLine vertical atMm={guide.xMm} spanMm={pageHeightMm} />
      <GuideLine vertical={false} atMm={guide.yMm} spanMm={pageWidthMm} />
      {rightMm != null ? <GuideLine vertical atMm={rightMm} spanMm={pageHeightMm} /> : null}

      <div
        className="absolute z-10 rounded bg-apple-blue px-1.5 py-0.5 text-[8px] font-bold leading-tight text-white shadow-md"
        style={{
          left: `${guide.xMm}mm`,
          top: `${guide.yMm}mm`,
          transform: "translate(3px, 3px)",
        }}
      >
        X {formatScscCoordMm(guide.xMm)} · Y {formatScscCoordMm(guide.yMm)}
        {guide.mode === "resize" && guide.widthMm != null
          ? ` · R ${formatScscCoordMm(guide.widthMm)}`
          : null}
      </div>
    </div>
  );
}
