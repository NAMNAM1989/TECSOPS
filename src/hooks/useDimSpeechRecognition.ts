import { useCallback, useEffect, useRef, useState } from "react";

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() != null;
}

function mapSpeechErrorMessage(code: string): string {
  switch (code) {
    case "no-speech":
      return "Không nghe được giọng — nói to, rõ, gần mic rồi thử lại.";
    case "audio-capture":
      return "Không lấy được âm thanh — kiểm tra micro đang hoạt động.";
    case "not-allowed":
      return "Chưa có quyền micro — cho phép mic trong cài đặt trình duyệt.";
    case "network":
      return "Lỗi mạng dịch vụ nhận diện — kiểm tra Internet hoặc nhập tay.";
    case "service-not-allowed":
      return "Dịch vụ nhận diện giọng tạm không khả dụng — thử Chrome hoặc sau ít phút.";
    case "aborted":
      return "";
    default:
      return code ? `Không nhận diện được (${code}).` : "Lỗi không xác định.";
  }
}

export type DimSpeechSession = {
  onFinal: (transcript: string) => void;
  onErrorMessage?: (message: string) => void;
  /** true: nghe đến khi chạm mic lần 2 (dừng) — hữu ích khi cần đọc nhiều cụm. */
  continuous?: boolean;
  /** false: chỉ cập nhật khi có kết quả cuối — giảm nhảy chữ khi nhận DIM. Mặc định true. */
  interimResults?: boolean;
};

/**
 * Nhận diện giọng tiếng Việt (Web Speech API), có chữ tạm (interim) để người dùng thấy phản hồi tức thì.
 */
export function useDimSpeechRecognition() {
  const [listening, setListening] = useState(false);
  const [liveCaption, setLiveCaption] = useState("");
  const recRef = useRef<SpeechRecognition | null>(null);
  const finalAccumRef = useRef("");
  const sessionRef = useRef<DimSpeechSession | null>(null);

  const abort = useCallback(() => {
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    sessionRef.current = null;
    setListening(false);
    setLiveCaption("");
    finalAccumRef.current = "";
  }, []);

  /** Dừng sớm nhưng vẫn lấy transcript đã nhận (không hủy như abort). */
  const finalize = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => () => abort(), [abort]);

  const start = useCallback(
    (session: DimSpeechSession) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        session.onErrorMessage?.("Trình duyệt không hỗ trợ nhận diện giọng — dùng Chrome trên Android hoặc máy tính.");
        return;
      }
      abort();
      sessionRef.current = session;
      finalAccumRef.current = "";
      setLiveCaption("");

      const rec = new Ctor();
      recRef.current = rec;
      rec.lang = "vi-VN";
      rec.continuous = session.continuous === true;
      rec.interimResults = session.interimResults !== false;
      rec.maxAlternatives = 1;
      setListening(true);
      let errored = false;

      rec.onresult = (ev: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const piece = r[0]?.transcript ?? "";
          if (r.isFinal) finalAccumRef.current += piece;
          else interim += piece;
        }
        setLiveCaption((finalAccumRef.current + interim).trim());
      };

      rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
        errored = true;
        const msg = mapSpeechErrorMessage(ev.error);
        if (msg) sessionRef.current?.onErrorMessage?.(msg);
        setListening(false);
        setLiveCaption("");
        finalAccumRef.current = "";
        recRef.current = null;
        sessionRef.current = null;
      };

      rec.onend = () => {
        if (errored) {
          errored = false;
          return;
        }
        const text = finalAccumRef.current.trim();
        const cb = sessionRef.current?.onFinal;
        finalAccumRef.current = "";
        recRef.current = null;
        sessionRef.current = null;
        setListening(false);
        setLiveCaption("");
        cb?.(text);
      };

      try {
        rec.start();
      } catch {
        setListening(false);
        session.onErrorMessage?.("Không bật được mic — thử tải lại trang.");
        sessionRef.current = null;
      }
    },
    [abort]
  );

  return {
    listening,
    liveCaption,
    start,
    abort,
    finalize,
    speechOk: speechRecognitionSupported(),
  };
}
