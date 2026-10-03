/** Một dòng ghi chú gấp trên header kho. Thêm mục khi có nội dung cần chạy ngang. */
export type OpsUrgentNotice = {
  id: string;
  text: string;
};

export const OPS_URGENT_NOTICES: readonly OpsUrgentNotice[] = [];
