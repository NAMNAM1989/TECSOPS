export type CsdTemplateSlotStatus = "ready" | "pending";

export type CsdRenderMode = "vector" | "overlay";

export type CsdAirlineTemplateSlot = {
  awbPrefix: string;
  airlineName: string;
  status: CsdTemplateSlotStatus;
  renderMode?: CsdRenderMode;
  slotDir: string;
  uploadHint: string;
  hasCustomBackground: boolean;
  hasCustomFields: boolean;
};

export type CsdTemplateCatalog = {
  paper: "A4";
  defaultPage: { page_width_mm: number; page_height_mm: number };
  defaultTemplate: {
    dir: string;
    name: string;
    hasBackground: boolean;
  };
  airlines: CsdAirlineTemplateSlot[];
  summary: {
    total: number;
    ready: number;
    pending: number;
  };
};

export type CsdTemplateResolve = {
  awbPrefix: string | null;
  airlineName: string | null;
  templateDir: string;
  templateName: string;
  templateStatus: "ready" | "pending" | "default" | "unknown-prefix";
  renderMode?: CsdRenderMode;
  useCustomTemplate: boolean;
  paper: string;
  page: { width_mm: number; height_mm: number };
};
