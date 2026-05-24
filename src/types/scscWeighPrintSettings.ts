/** Người làm phiếu cân SCSC — tách theo kho SCSC (đồng bộ server). */
export type ScscWeighSenderBlock = {
  senderName: string;
  senderPhone: string;
};

export const SCSC_WEIGH_WAREHOUSE_KEYS = ["TECS-SCSC", "KHO-SCSC"] as const;
export type ScscWeighWarehouseKey = (typeof SCSC_WEIGH_WAREHOUSE_KEYS)[number];

export type ScscWeighPrintSettings = {
  senders: Record<ScscWeighWarehouseKey, ScscWeighSenderBlock>;
};
