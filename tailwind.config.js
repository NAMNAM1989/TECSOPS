/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  /** Light mode chính thức (Đợt A). Giữ `class` để token cũ `dark:` không kích hoạt nếu không gắn `.dark` lên html. */
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"Segoe UI"',
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          '"IBM Plex Mono"',
          "ui-monospace",
          "SFMono-Regular",
          '"SF Mono"',
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        /** Semantic tokens — Operational Signal (Đợt A). Legacy dashboard/apple/ops giữ để tương thích. */
        ui: {
          background: "#E8EEF4",
          surface: "#FFFFFF",
          "surface-muted": "#F1F5F9",
          text: "#0F172A",
          "text-muted": "#64748B",
          border: "rgba(15,23,42,0.10)",
          primary: "#0D9488",
          "primary-hover": "#0F766E",
          focus: "rgba(13,148,136,0.35)",
          success: "#059669",
          warning: "#D97706",
          danger: "#DC2626",
          info: "#0284C7",
          navy: "#0F172A",
        },
        dashboard: {
          canvas: "#E8EEF4",
          "canvas-dark": "#070B14",
          surface: "#FFFFFF",
          "surface-dark": "#0F172A",
          primary: "#0F172A",
          "primary-dark": "#F8FAFC",
          muted: "#64748B",
          "muted-dark": "#94A3B8",
          accent: "#0D9488",
          "accent-hover": "#0F766E",
        },
        apple: {
          blue: "#0D9488",
          "blue-hover": "#0F766E",
          label: "#0F172A",
          secondary: "#64748B",
          tertiary: "#94A3B8",
          bg: "#E8EEF4",
          fill: "rgba(15,23,42,0.04)",
          separator: "rgba(15,23,42,0.08)",
        },
        ops: {
          bg: "#0B0F19",
          surface: "#1E293B",
          elevated: "#182232",
          label: "#F8FAFC",
          secondary: "#94A3B8",
          tertiary: "#64748B",
        },
      },
      borderRadius: {
        apple: "1.25rem",
        "apple-lg": "1.75rem",
      },
      boxShadow: {
        apple: "0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)",
        "apple-md": "0 4px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
        "dashboard-card": "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.04)",
        "dashboard-card-hover": "0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.05)",
        "ui-sm": "0 1px 2px rgba(15,23,42,0.05)",
      },
      keyframes: {
        "tecsops-actions-strip": {
          "0%": { opacity: "0", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "ui-toast-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "ui-skeleton": {
          "0%": { opacity: "0.45" },
          "50%": { opacity: "0.9" },
          "100%": { opacity: "0.45" },
        },
      },
      animation: {
        "tecsops-actions-strip": "tecsops-actions-strip 0.2s ease-out forwards",
        "ui-toast-in": "ui-toast-in 0.2s ease-out forwards",
        "ui-skeleton": "ui-skeleton 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
