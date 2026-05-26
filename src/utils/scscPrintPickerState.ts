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
  /** Nội dung in — có thể sửa tại modal. */
  goodsDescriptionPrint: string;
  otherRequirementsPrint: string;
  /** Ghi ngược lên lô khi xác nhận in. */
  saveToShipment: boolean;
};

export function shipmentForScscPrintPicker(shipment: Shipment, state: ScscPrintProfileChoice): Shipment {
  return {
    ...shipment,
    customerShipperId: state.useBookingShipper ? shipment.customerShipperId : state.shipperId,
    globalAgentId: state.useBookingAgent ? shipment.globalAgentId : state.agentId,
    customerAgentId: state.useBookingAgent ? shipment.customerAgentId : state.agentId,
    customerConsigneeId: state.useBookingConsignee ? shipment.customerConsigneeId : state.consigneeId,
    customerGoodsId: state.useBookingGoods ? shipment.customerGoodsId : state.goodsId,
    goodsDescriptionPrint: state.goodsDescriptionPrint,
    otherRequirementsPrint: state.otherRequirementsPrint,
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
