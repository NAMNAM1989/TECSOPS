import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchChromeExtensionsCatalog,
  recommendedChromeExtensionPacks,
  triggerChromeExtensionDownload,
} from "./chromeExtensionDownloads";

describe("chromeExtensionDownloads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetchChromeExtensionsCatalog đọc /api/chrome-extensions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          count: 2,
          total: 2,
          extensions: [
            { ok: true, id: "tcs", label: "TCS", version: "1.5.2" },
            { ok: true, id: "scsc", label: "SCSC", version: "1.0.1" },
          ],
        }),
      })),
    );
    const catalog = await fetchChromeExtensionsCatalog();
    expect(catalog.ok).toBe(true);
    expect(catalog.extensions).toHaveLength(2);
    expect(catalog.extensions.map((p) => p.id)).toEqual(["tcs", "scsc"]);
  });

  it("recommendedChromeExtensionPacks chỉ TCS + SCSC (bỏ sót TECS-TCS)", () => {
    const recommended = recommendedChromeExtensionPacks([
      { ok: true, id: "tecs-tcs", label: "TECS-TCS", deprecated: true },
      { ok: true, id: "tcs", label: "TCS" },
      { ok: true, id: "scsc", label: "SCSC" },
    ]);
    expect(recommended.map((p) => p.id)).toEqual(["tcs", "scsc"]);
  });

  it("triggerChromeExtensionDownload tạo thẻ a download", () => {
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation((node) => node);
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      rel: "",
      click,
      remove,
    } as unknown as HTMLAnchorElement);

    const name = triggerChromeExtensionDownload({
      ok: true,
      id: "tcs",
      label: "TCS",
      version: "1.3.1",
      filename: "tecsops-chrome-extension-tcs-v1.3.1.zip",
      download_url: "/downloads/tecsops-chrome-extension-tcs-v1.3.1.zip",
    });

    expect(name).toBe("tecsops-chrome-extension-tcs-v1.3.1.zip");
    expect(click).toHaveBeenCalled();
    expect(appendChild).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });
});
