import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text as KText, Line, Transformer, Group } from "react-konva";
import type Konva from "konva";
import { mmToPx } from "../render/htmlMmRenderer";
import type { LabelObject, LabelTemplateV1, TableObject, TextObject } from "../core/types";
import { snapMm } from "../core/snapGrid";
import { DesignerImageNode } from "./DesignerImageNode";
import { DesignerLineNode } from "./DesignerLineNode";
import { DesignerRulers } from "./DesignerRulers";

const PX_PER_MM = mmToPx(1);

type Props = {
  template: LabelTemplateV1;
  selectedId: string | null;
  zoom: number;
  gridSnap: boolean;
  gridMm: number;
  onSelect: (id: string | null) => void;
  onChangeObject: (obj: LabelObject) => void;
};

function objectBounds(obj: LabelObject): { w: number; h: number } {
  if (obj.type === "line") {
    return {
      w: Math.abs(obj.x2 - obj.x),
      h: Math.abs(obj.y2 - obj.y) || 1,
    };
  }
  if ("width" in obj && "height" in obj) {
    return { w: obj.width, h: obj.height };
  }
  return { w: 20, h: 8 };
}

export function DesignerCanvas({
  template,
  selectedId,
  zoom,
  gridSnap,
  gridMm,
  onSelect,
  onChangeObject,
}: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });

  const pageW = template.page.width * PX_PER_MM * zoom;
  const pageH = template.page.height * PX_PER_MM * zoom;

  useEffect(() => {
    const el = stageRef.current?.container()?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setStageSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    const selectedObj = selectedId ? template.objects.find((o) => o.id === selectedId) : null;
    if (selectedObj?.type === "line") {
      tr.nodes([]);
    } else {
      const node = selectedId ? stage.findOne(`#${selectedId}`) : null;
      tr.nodes(node ? [node] : []);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId, template.objects]);

  const offsetX = Math.max(16, (stageSize.w - pageW) / 2);
  const offsetY = Math.max(16, (stageSize.h - pageH) / 2);

  const onDragEnd = useCallback(
    (obj: LabelObject, node: Konva.Node) => {
      const x = snapMm(node.x() / (PX_PER_MM * zoom), gridMm, gridSnap);
      const y = snapMm(node.y() / (PX_PER_MM * zoom), gridMm, gridSnap);
      if (obj.type === "line") {
        const dx = x - obj.x;
        const dy = y - obj.y;
        onChangeObject({
          ...obj,
          x,
          y,
          x2: obj.x2 + dx,
          y2: obj.y2 + dy,
        });
        return;
      }
      onChangeObject({ ...obj, x, y } as LabelObject);
    },
    [gridMm, gridSnap, onChangeObject, zoom]
  );

  const onTransformEnd = useCallback(
    (obj: LabelObject, node: Konva.Node) => {
      if (obj.type === "line") return;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      const w = snapMm((objectBounds(obj).w * scaleX), gridMm, gridSnap);
      const h = snapMm((objectBounds(obj).h * scaleY), gridMm, gridSnap);
      const x = snapMm(node.x() / (PX_PER_MM * zoom), gridMm, gridSnap);
      const y = snapMm(node.y() / (PX_PER_MM * zoom), gridMm, gridSnap);
      const rotation = node.rotation();
      onChangeObject({ ...obj, x, y, width: w, height: h, rotation } as LabelObject);
    },
    [gridMm, gridSnap, onChangeObject, zoom]
  );

  const renderObject = (obj: LabelObject) => {
    const id = obj.id;
    const x = obj.x * PX_PER_MM * zoom;
    const y = obj.y * PX_PER_MM * zoom;
    const common = {
      id,
      draggable: true,
      onClick: () => onSelect(id),
      onTap: () => onSelect(id),
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onDragEnd(obj, e.target),
      onTransformEnd: (e: Konva.KonvaEventObject<Event>) => onTransformEnd(obj, e.target),
    };

    if (obj.type === "text") {
      const t = obj as TextObject;
      return (
        <KText
          key={id}
          {...common}
          x={x}
          y={y}
          width={t.width * PX_PER_MM * zoom}
          height={t.height * PX_PER_MM * zoom}
          text={t.text || t.bind || "(text)"}
          fontSize={t.fontSize * PX_PER_MM * zoom * 0.85}
          fontFamily={t.fontFamily}
          fontStyle={t.fontWeight === "bold" ? "bold" : "normal"}
          fill={t.color ?? "#000"}
          align={t.align ?? "left"}
          rotation={t.rotation ?? 0}
        />
      );
    }
    if (obj.type === "rect") {
      return (
        <Rect
          key={id}
          {...common}
          x={x}
          y={y}
          width={obj.width * PX_PER_MM * zoom}
          height={obj.height * PX_PER_MM * zoom}
          stroke={obj.stroke ?? "#000"}
          strokeWidth={(obj.strokeWidth ?? 0.35) * PX_PER_MM * zoom}
          fill={obj.fill ?? "transparent"}
          rotation={obj.rotation ?? 0}
        />
      );
    }
    if (obj.type === "line") {
      return (
        <DesignerLineNode
          key={id}
          obj={obj}
          zoom={zoom}
          isSelected={selectedId === id}
          gridSnap={gridSnap}
          gridMm={gridMm}
          onSelect={() => onSelect(id)}
          onChange={onChangeObject}
        />
      );
    }
    if (obj.type === "barcode" || obj.type === "qr") {
      const w = obj.width * PX_PER_MM * zoom;
      const h = obj.height * PX_PER_MM * zoom;
      return (
        <Group key={id} {...common} x={x} y={y}>
          <Rect width={w} height={h} stroke="#000" strokeWidth={1} fill="#f8f8f8" />
          <KText
            text={obj.type === "barcode" ? `||| ${obj.value || obj.bind || ""}` : `QR ${obj.value || ""}`}
            width={w}
            height={h}
            align="center"
            verticalAlign="middle"
            fontSize={10 * zoom}
          />
        </Group>
      );
    }
    if (obj.type === "image") {
      return (
        <DesignerImageNode
          key={id}
          obj={obj}
          zoom={zoom}
          common={common}
        />
      );
    }
    if (obj.type === "table") {
      const t = obj as TableObject;
      const w = t.width * PX_PER_MM * zoom;
      const h = t.height * PX_PER_MM * zoom;
      const borderColor = t.borderColor ?? "#000";
      const borderPx = Math.max(0.1, (t.borderWidth ?? 0.25) * PX_PER_MM * zoom);
      const gridLines: JSX.Element[] = [];
      let xAcc = 0;
      for (let c = 0; c < t.cols - 1; c++) {
        xAcc += t.colWidths[c] * PX_PER_MM * zoom;
        gridLines.push(
          <Line
            key={`tc-${c}`}
            points={[xAcc, 0, xAcc, h]}
            stroke={borderColor}
            strokeWidth={borderPx}
          />
        );
      }
      let yAcc = 0;
      for (let r = 0; r < t.rows - 1; r++) {
        yAcc += t.rowHeights[r] * PX_PER_MM * zoom;
        gridLines.push(
          <Line
            key={`tr-${r}`}
            points={[0, yAcc, w, yAcc]}
            stroke={borderColor}
            strokeWidth={borderPx}
          />
        );
      }
      return (
        <Group key={id} {...common} x={x} y={y}>
          <Rect
            width={w}
            height={h}
            stroke={borderColor}
            strokeWidth={borderPx}
            fill="rgba(0,0,100,0.04)"
          />
          {gridLines}
        </Group>
      );
    }
    return null;
  };

  const gridLines = [];
  for (let gx = 0; gx <= template.page.width; gx += gridMm) {
    gridLines.push(
      <Line
        key={`gv-${gx}`}
        points={[offsetX + gx * PX_PER_MM * zoom, offsetY, offsetX + gx * PX_PER_MM * zoom, offsetY + pageH]}
        stroke="#e5e5e5"
        strokeWidth={0.5}
      />
    );
  }
  for (let gy = 0; gy <= template.page.height; gy += gridMm) {
    gridLines.push(
      <Line
        key={`gh-${gy}`}
        points={[offsetX, offsetY + gy * PX_PER_MM * zoom, offsetX + pageW, offsetY + gy * PX_PER_MM * zoom]}
        stroke="#e5e5e5"
        strokeWidth={0.5}
      />
    );
  }

  return (
    <Stage ref={stageRef} width={stageSize.w} height={stageSize.h} onMouseDown={(e) => {
      if (e.target === e.target.getStage()) onSelect(null);
    }}>
      <Layer>
        {gridLines}
        <DesignerRulers
          pageW={pageW}
          pageH={pageH}
          offsetX={offsetX}
          offsetY={offsetY}
          pxPerMm={PX_PER_MM * zoom}
        />
        <Rect
          x={offsetX}
          y={offsetY}
          width={pageW}
          height={pageH}
          fill="#fff"
          stroke="#333"
          strokeWidth={1}
        />
        <Group x={offsetX} y={offsetY}>
          {template.objects.map(renderObject)}
        </Group>
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 4 || newBox.height < 4) return oldBox;
            return newBox;
          }}
        />
      </Layer>
    </Stage>
  );
}
