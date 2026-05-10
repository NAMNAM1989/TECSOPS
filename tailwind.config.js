/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
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
        apple: {
          blue: "#0071e3",
          "blue-hover": "#0077ed",
          label: "#1d1d1f",
          secondary: "#86868b",
          tertiary: "#aeaeb2",
          bg: "#f5f5f7",
          fill: "rgba(0,0,0,0.04)",
          separator: "rgba(0,0,0,0.08)",
        },
      },
      borderRadius: {
        apple: "1.25rem",
        "apple-lg": "1.75rem",
      },
      boxShadow: {
        apple: "0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)",
        "apple-md": "0 4px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
      },
      keyframes: {
        "tecsops-actions-strip": {
          "0%": { opacity: "0", transform: "translateY(-6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "ecargo-backdrop-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "ecargo-card-in": {
          "0%": { opacity: "0", transform: "scale(0.9) translateY(1rem)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },
      animation: {
        "tecsops-actions-strip": "tecsops-actions-strip 0.2s ease-out forwards",
        "ecargo-backdrop-in": "ecargo-backdrop-in 0.22s ease-out forwards",
        "ecargo-card-in": "ecargo-card-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards",
      },
    },
  },
  plugins: [],
};
