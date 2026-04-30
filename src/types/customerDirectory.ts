/** Một dòng danh bạ khách — mã + tên, lưu cùng state máy chủ (Redis / file). */
export type CustomerDirectoryEntry = {
  id: string;
  code: string;
  name: string;
};
