import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalFocusTrap(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
  fallbackFocusSelector?: string,
) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFirst = () => {
      const first = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    };
    const timer = window.setTimeout(focusFirst, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((item) => item.getClientRects().length > 0);
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => {
        if (previouslyFocused?.isConnected && previouslyFocused !== document.body) {
          previouslyFocused.focus();
        }
        else if (fallbackFocusSelector) {
          Array.from(document.querySelectorAll<HTMLElement>(fallbackFocusSelector))
            .find((element) => element.getClientRects().length > 0)
            ?.focus();
        }
      }, 0);
    };
  }, [containerRef, fallbackFocusSelector, open]);
}
