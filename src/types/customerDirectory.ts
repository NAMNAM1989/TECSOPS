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
  /** Hồ sơ chuẩn dùng để đổ vào phiếu cân SCSC. */
  shipperName?: string;
  shipperAddress?: string;
  shipperPhone?: string;
  shipperEmail?: string;
  taxCode?: string;
  agentName?: string;
  agentAddress?: string;
  agentPhone?: string;
  agentEmail?: string;
  agentTaxCode?: string;
  consigneeName?: string;
  consigneeAddress?: string;
  consigneePhone?: string;
  consigneeEmail?: string;
  notifyName?: string;
  /** CNEE lưu sẵn (ưu tiên khi có `customerConsigneeId` trên booking). */
  savedConsignees?: CustomerSavedConsignee[];
  parties: CustomerParty[];
};
