/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
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
          "ui-monospace",
          "SFMono-Regular",
          '"SF Mono"',
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
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
      },
      keyframes: {
        "tecsops-actions-strip": {
          "0%": { opacity: "0", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "tecsops-actions-strip": "tecsops-actions-strip 0.2s ease-out forwards",
      },
    },
  },
  plugins: [],
};
