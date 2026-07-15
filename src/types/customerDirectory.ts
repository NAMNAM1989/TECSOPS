export type CustomerPartyType = "SHIPPER" | "CNEE" | "NOTIFY" | "OTHER";



/** Một bộ CNEE lưu sẵn — chọn khi booking / in phiếu cân. */

export type CustomerSavedConsignee = {

  id: string;

  /** Nhãn hiển thị trong danh sách (VD: Tokyo, Singapore). */

  label: string;

  consigneeName: string;

  consigneeAddress: string;

  consigneePhone: string;

  consigneeEmail: string;

  notifyName: string;

};



/** Một bộ Shipper lưu sẵn — chọn khi booking / in phiếu cân (khác tên account khách). */

export type CustomerSavedShipper = {
  id: string;
  /** Nhãn (VD: HCM, Chi nhánh B). */
  label: string;
  shipperName: string;
  shipperAddress: string;
  shipperPhone: string;
  shipperEmail: string;
  taxCode: string;
};

/** Xe / tài xế lưu sẵn theo khách. */
export type CustomerSavedVehicle = {
  id: string;
  /** Biển số xe (VD: 50H17480). */
  licensePlate: string;
  driverName: string;
  /** CCCD / CMND tài xế. */
  driverId: string;
};

/** Tên hàng lưu sẵn theo khách — chọn khi booking / in phiếu cân. */

export type CustomerSavedGoods = {

  id: string;

  /** Nhãn (VD: Garment, Seafood). */

  label: string;

  goodsDescription: string;

};



/** Một mẫu nội dung cần copy nhanh cho từng khách (VD: nhiều SHIPPER, nhiều CNEE). */

export type CustomerParty = {

  id: string;

  type: CustomerPartyType;

  /** Tên phân biệt trong cùng nhóm, VD: HCM, HN, JAPAN, SINGAPORE. */

  label: string;

  content: string;

};



/** Một dòng danh bạ khách — mã + tên + nhiều mẫu copy nhanh, lưu cùng state máy chủ. */

export type CustomerType = "FORWARDER" | "DIRECT_SHIPPER" | "AGENT" | "OTHER";

export const CUSTOMER_TYPES: readonly CustomerType[] = [
  "FORWARDER",
  "DIRECT_SHIPPER",
  "AGENT",
  "OTHER",
];

export type CustomerDirectoryEntry = {

  id: string;

  /** Mã khách (Customer Code) — khóa đồng bộ, vd. GLO000001. */
  code: string;

  name: string;

  /**
   * Prefix sinh mã (customs_ops) — 2–5 chữ A–Z.
   * Khi tạo mới để trống Code, hệ thống cấp `{PREFIX}{000001…}`.
   */
  prefix?: string;

  /** Short Code — tối đa 10 ký tự, gõ tắt tìm kiếm. */
  shortCode?: string;

  /** MST account (cột Tax Code Excel). */
  taxCode?: string;

  /** Địa chỉ account (Excel). */
  address?: string;

  /** Email account (Excel). */
  email?: string;

  /** SĐT account (Excel). */
  phone?: string;

  /** Đơn giá cố định VND/kg (Excel Default Rate). */
  defaultRate?: number | null;

  /** FORWARDER | DIRECT_SHIPPER | AGENT | OTHER */
  customerType?: CustomerType;

  /** @deprecated Chỉ dùng khi migrate JSON cũ — dữ liệu mới nằm trong `savedShippers`. */
  shipperName?: string;
  /** @deprecated */
  shipperAddress?: string;
  /** @deprecated */
  shipperPhone?: string;
  /** @deprecated */
  shipperEmail?: string;

  /** Shipper mặc định khi khách có nhiều `savedShippers`. */
  defaultShipperId?: string;
  /** CNEE mặc định khi có nhiều `savedConsignees`. */
  defaultConsigneeId?: string;
  /** Tên hàng mặc định khi có nhiều `savedGoods`. */
  defaultGoodsId?: string;
  /** Xe mặc định khi có nhiều `savedVehicles`. */
  defaultVehicleId?: string;

  /** Shipper lưu sẵn (ưu tiên khi có `customerShipperId` trên booking). */
  savedShippers?: CustomerSavedShipper[];

  /** CNEE lưu sẵn (ưu tiên khi có `customerConsigneeId` trên booking). */
  savedConsignees?: CustomerSavedConsignee[];

  /** Tên hàng lưu sẵn (ưu tiên khi có `customerGoodsId` trên booking). */
  savedGoods?: CustomerSavedGoods[];

  /** Xe / tài xế lưu sẵn theo mã khách. */
  savedVehicles?: CustomerSavedVehicle[];

  /** Yêu cầu khác in trên phiếu cân SCSC (theo từng khách). */
  otherRequirementsPrint?: string;

  parties: CustomerParty[];

};


