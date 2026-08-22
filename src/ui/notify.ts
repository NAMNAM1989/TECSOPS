/** Thông báo non-blocking cho module không-React (export / in / portal).
 * ToastProvider đăng ký sink — không bao giờ dùng window.alert (chặn mobile).
 */

export type NotifyTone = "info" | "success" | "warning" | "danger";

export type NotifyInput = {
  message: string;
  title?: string;
  tone?: NotifyTone;
};

export type NotifySink = (input: NotifyInput) => void;

let sink: NotifySink | null = null;

export function registerNotifySink(next: NotifySink | null): void {
  sink = next;
}

export function notify(input: NotifyInput): void {
  const tone = input.tone ?? "warning";
  if (sink) {
    sink({ ...input, tone });
    return;
  }
  if (typeof console !== "undefined") {
    const prefix = input.title ? `${input.title}: ` : "";
    console.warn(`[tecsops-notify] ${prefix}${input.message}`);
  }
}

export function notifyError(message: string, title?: string): void {
  notify({ message, title, tone: "danger" });
}

export function notifyWarning(message: string, title?: string): void {
  notify({ message, title, tone: "warning" });
}

export function notifyInfo(message: string, title?: string): void {
  notify({ message, title, tone: "info" });
}

export function notifySuccess(message: string, title?: string): void {
  notify({ message, title, tone: "success" });
}
