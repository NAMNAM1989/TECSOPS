/**
 * Đóng ô edit ngay, lưu nền — khớp optimistic sync.
 * Bỏ trạng thái disabled/saving blocking trên input để người dùng tiếp tục thao tác mượt mà.
 */
export function runInlineAsyncCommit(
  result: void | boolean | Promise<boolean | void>,
  opts: {
    setEditing: (v: boolean) => void;
    setSaving?: (v: boolean) => void;
    onReject?: () => void;
  },
): void {
  opts.setEditing(false);
  if (result && typeof (result as Promise<unknown>).then === "function") {
    void (result as Promise<boolean | void>).then((ok) => {
      if (ok === false) {
        opts.onReject?.();
        opts.setEditing(true);
      }
    });
  }
}
