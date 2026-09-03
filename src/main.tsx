import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./fonts.css";
import "./index.css";
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

/** Bold + IBM Plex Mono — không chặn FCP; AWB/print dùng sau khi idle. */
void import("./fonts-deferred.css");
