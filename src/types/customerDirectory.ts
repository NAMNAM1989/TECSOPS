export type CustomerPartyType = "SHIPPER" | "CNEE" | "NOTIFY" | "OTHER";

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
  parties: CustomerParty[];
};
