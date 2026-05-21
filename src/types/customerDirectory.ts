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

/** Xe / tài xế lưu sẵn theo khách — dùng khi đăng ký eCargo KHO SCSC. */
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

export type CustomerDirectoryEntry = {

  id: string;

  code: string;

  name: string;

  /** @deprecated Chỉ dùng khi migrate JSON cũ — dữ liệu mới nằm trong `savedShippers`. */
  shipperName?: string;
  /** @deprecated */
  shipperAddress?: string;
  /** @deprecated */
  shipperPhone?: string;
  /** @deprecated */
  shipperEmail?: string;
  /** @deprecated */
  taxCode?: string;

  /** Shipper mặc định khi khách có nhiều `savedShippers`. */
  defaultShipperId?: string;
  /** CNEE mặc định khi có nhiều `savedConsignees`. */
  defaultConsigneeId?: string;
  /** Tên hàng mặc định khi có nhiều `savedGoods`. */
  defaultGoodsId?: string;
  /** Xe mặc định khi có nhiều `savedVehicles` (đăng ký eCargo). */
  defaultVehicleId?: string;

  /** Shipper lưu sẵn (ưu tiên khi có `customerShipperId` trên booking). */
  savedShippers?: CustomerSavedShipper[];

  /** CNEE lưu sẵn (ưu tiên khi có `customerConsigneeId` trên booking). */
  savedConsignees?: CustomerSavedConsignee[];

  /** Tên hàng lưu sẵn (ưu tiên khi có `customerGoodsId` trên booking). */
  savedGoods?: CustomerSavedGoods[];

  /** Xe / tài xế lưu sẵn — auto-fill eCargo theo mã khách (Agent). */
  savedVehicles?: CustomerSavedVehicle[];

  /** Yêu cầu khác in trên phiếu cân SCSC (theo từng khách). */
  otherRequirementsPrint?: string;

  parties: CustomerParty[];

};


