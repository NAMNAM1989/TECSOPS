import type { Shipment } from "../types/shipment";

export type ScscPrintProfileChoice = {
  useBookingShipper: boolean;
  shipperId: string;
  useBookingConsignee: boolean;
  consigneeId: string;
  useBookingAgent: boolean;
  agentId: string;
  useBookingGoods: boolean;
  goodsId: string;
};

export function shipmentForScscPrintPicker(shipment: Shipment, state: ScscPrintProfileChoice): Shipment {
  return {
    ...shipment,
    customerShipperId: state.useBookingShipper ? shipment.customerShipperId : state.shipperId,
    globalAgentId: state.useBookingAgent ? shipment.globalAgentId : state.agentId,
    customerAgentId: state.useBookingAgent ? shipment.customerAgentId : state.agentId,
    customerConsigneeId: state.useBookingConsignee ? shipment.customerConsigneeId : state.consigneeId,
    customerGoodsId: state.useBookingGoods ? shipment.customerGoodsId : state.goodsId,
  };
}

export function mapOptionsForScscPrintPicker(state: ScscPrintProfileChoice) {
  return {
    skipAutoSingleConsignee: state.useBookingConsignee,
    skipAutoDefaultAgent: state.useBookingAgent,
    skipAutoSingleShipper: state.useBookingShipper,
    skipAutoSingleGoods: state.useBookingGoods,
  };
}
