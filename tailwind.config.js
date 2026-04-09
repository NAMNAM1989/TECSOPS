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
    },
  },
  plugins: [],
};
