/** Gửi cookie đăng nhập trang (`tecsops_gate`) khi gọi API cùng origin. */
export const credFetch: RequestInit = { credentials: "include" };
