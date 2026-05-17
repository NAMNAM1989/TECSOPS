import { Circle, Group, Line } from "react-konva";
import type Konva from "konva";
import type { LineObject } from "../core/types";
import { snapMm } from "../core/snapGrid";
import { mmToPx } from "../render/htmlMmRenderer";

const PX_PER_MM = mmToPx(1);

type Props = {
  obj: LineObject;
  zoom: number;
  isSelected: boolean;
  gridSnap: boolean;
  gridMm: number;
  onSelect: () => void;
  onChange: (obj: LineObject) => void;
};

export function DesignerLineNode({
  obj,
  zoom,
  isSelected,
  gridSnap,
  gridMm,
  onSelect,
  onChange,
}: Props) {
  const px = PX_PER_MM * zoom;
  const x1 = obj.x * px;
  const y1 = obj.y * px;
  const x2 = obj.x2 * px;
  const y2 = obj.y2 * px;
  const stroke = obj.stroke ?? "#000";
  const sw = Math.max(0.1, (obj.strokeWidth ?? 0.35) * px);

  const snap = (v: number) => snapMm(v / px, gridMm, gridSnap);

  const onGroupDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const dx = snap(node.x());
    const dy = snap(node.y());
    node.position({ x: 0, y: 0 });
    if (dx === 0 && dy === 0) return;
    onChange({
      ...obj,
      x: obj.x + dx,
      y: obj.y + dy,
      x2: obj.x2 + dx,
      y2: obj.y2 + dy,
    });
  };

  const dragEndpoint =
    (which: "start" | "end") => (e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      const node = e.target;
      const nx = snap(node.x());
      const ny = snap(node.y());
      if (which === "start") {
        onChange({ ...obj, x: nx, y: ny });
      } else {
        onChange({ ...obj, x2: nx, y2: ny });
      }
    };

  return (
    <Group
      id={obj.id}
      x={0}
      y={0}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={onGroupDragEnd}
    >
      <Line
        points={[x1, y1, x2, y2]}
        stroke={stroke}
        strokeWidth={sw}
        lineCap="round"
        hitStrokeWidth={Math.max(sw, 8)}
      />
      {isSelected ? (
        <>
          <Circle
            x={x1}
            y={y1}
            radius={5}
            fill="#007aff"
            stroke="#fff"
            strokeWidth={1}
            draggable
            onDragMove={dragEndpoint("start")}
            onDragEnd={dragEndpoint("start")}
          />
          <Circle
            x={x2}
            y={y2}
            radius={5}
            fill="#007aff"
            stroke="#fff"
            strokeWidth={1}
            draggable
            onDragMove={dragEndpoint("end")}
            onDragEnd={dragEndpoint("end")}
          />
        </>
      ) : null}
    </Group>
  );
}
