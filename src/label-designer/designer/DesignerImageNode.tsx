import { Image as KonvaImage, Rect } from "react-konva";
import useImage from "use-image";
import type { ImageObject } from "../core/types";
import { mmToPx } from "../render/htmlMmRenderer";

type Props = {
  obj: ImageObject;
  zoom: number;
  common: Record<string, unknown>;
};

export function DesignerImageNode({ obj, zoom, common }: Props) {
  const px = mmToPx(1) * zoom;
  const [img] = useImage(obj.src, "anonymous");

  if (!img) {
    return (
      <Rect
        {...common}
        x={obj.x * px}
        y={obj.y * px}
        width={obj.width * px}
        height={obj.height * px}
        fill="#f0f0f0"
        stroke="#999"
        dash={[4, 4]}
      />
    );
  }

  return (
    <KonvaImage
      {...common}
      image={img}
      x={obj.x * px}
      y={obj.y * px}
      width={obj.width * px}
      height={obj.height * px}
    />
  );
}
