import type { LabelObject, LabelTemplateV1 } from "./types";

let idSeq = 0;

export function newObjectId(prefix = "obj"): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

export function sortByZIndex(objects: LabelObject[]): LabelObject[] {
  return [...objects].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
}

export function upsertObject(template: LabelTemplateV1, obj: LabelObject): LabelTemplateV1 {
  const idx = template.objects.findIndex((o) => o.id === obj.id);
  const objects =
    idx >= 0 ? template.objects.map((o, i) => (i === idx ? obj : o)) : [...template.objects, obj];
  return { ...template, objects: sortByZIndex(objects), updatedAt: new Date().toISOString() };
}

export function removeObject(template: LabelTemplateV1, id: string): LabelTemplateV1 {
  return {
    ...template,
    objects: template.objects.filter((o) => o.id !== id),
    updatedAt: new Date().toISOString(),
  };
}

export function duplicateObject(template: LabelTemplateV1, id: string): LabelTemplateV1 {
  const src = template.objects.find((o) => o.id === id);
  if (!src) return template;
  const copy = {
    ...structuredClone(src),
    id: newObjectId(src.type),
    x: src.x + 2,
    y: src.y + 2,
    zIndex: (src.zIndex ?? 0) + 1,
  } as LabelObject;
  return upsertObject(template, copy);
}

export function bringForward(template: LabelTemplateV1, id: string): LabelTemplateV1 {
  const maxZ = Math.max(0, ...template.objects.map((o) => o.zIndex ?? 0));
  return upsertObject(
    template,
    { ...template.objects.find((o) => o.id === id)!, zIndex: maxZ + 1 }
  );
}

export function sendBackward(template: LabelTemplateV1, id: string): LabelTemplateV1 {
  const minZ = Math.min(0, ...template.objects.map((o) => o.zIndex ?? 0));
  return upsertObject(
    template,
    { ...template.objects.find((o) => o.id === id)!, zIndex: minZ - 1 }
  );
}
