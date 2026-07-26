import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/print-label.css";
import { ToastProvider } from "./ui";

/** Light mode chính thức — không kích hoạt dark: utilities. */
document.documentElement.classList.remove("dark");
document.documentElement.style.colorScheme = "light";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
