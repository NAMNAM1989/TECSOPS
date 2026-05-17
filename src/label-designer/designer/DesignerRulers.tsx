import { Line, Text } from "react-konva";

type Props = {
  pageW: number;
  pageH: number;
  offsetX: number;
  offsetY: number;
  pxPerMm: number;
  majorEveryMm?: number;
};

/** Thước mm trên và trái vùng trang. */
export function DesignerRulers({
  pageW,
  pageH,
  offsetX,
  offsetY,
  pxPerMm,
  majorEveryMm = 10,
}: Props) {
  const rulerH = 18;
  const rulerW = 22;
  const ticks: JSX.Element[] = [];
  const wMm = pageW / pxPerMm;
  const hMm = pageH / pxPerMm;

  for (let mm = 0; mm <= wMm + 0.01; mm += 1) {
    const x = offsetX + mm * pxPerMm;
    const major = mm % majorEveryMm === 0;
    ticks.push(
      <Line
        key={`rt-${mm}`}
        points={[x, offsetY - (major ? rulerH : rulerH * 0.55), x, offsetY]}
        stroke={major ? "#555" : "#aaa"}
        strokeWidth={major ? 1 : 0.5}
      />
    );
    if (major && mm > 0) {
      ticks.push(
        <Text
          key={`rtl-${mm}`}
          x={x - 8}
          y={offsetY - rulerH - 2}
          text={String(mm)}
          fontSize={9}
          fill="#444"
        />
      );
    }
  }

  for (let mm = 0; mm <= hMm + 0.01; mm += 1) {
    const y = offsetY + mm * pxPerMm;
    const major = mm % majorEveryMm === 0;
    ticks.push(
      <Line
        key={`rl-${mm}`}
        points={[offsetX - (major ? rulerW : rulerW * 0.55), y, offsetX, y]}
        stroke={major ? "#555" : "#aaa"}
        strokeWidth={major ? 1 : 0.5}
      />
    );
    if (major && mm > 0) {
      ticks.push(
        <Text
          key={`rll-${mm}`}
          x={2}
          y={y - 5}
          text={String(mm)}
          fontSize={9}
          fill="#444"
        />
      );
    }
  }

  return <>{ticks}</>;
}
