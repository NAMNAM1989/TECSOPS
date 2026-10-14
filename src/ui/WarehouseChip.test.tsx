import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WarehouseChip } from "./WarehouseChip";
import { AwbText } from "./AwbText";
import { FlightCell } from "./FlightCell";

describe("WarehouseChip", () => {
  it("renders TECS│TCS hub distinction properly", () => {
    const html = renderToStaticMarkup(<WarehouseChip warehouse="TECS-TCS" count={12} />);
    expect(html).toContain("TECS");
    expect(html).toContain("│");
    expect(html).toContain("TCS");
    expect(html).toContain("12");
  });

  it("renders direct TCS properly", () => {
    const html = renderToStaticMarkup(<WarehouseChip warehouse="TCS" />);
    expect(html).toContain("TCS");
    expect(html).not.toContain("│");
  });

  it("renders button role and aria-selected when as=button", () => {
    const html = renderToStaticMarkup(
      <WarehouseChip
        warehouse="SCSC"
        as="button"
        active
        role="tab"
        aria-selected={true}
      />
    );
    expect(html).toContain("<button");
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
  });
});

describe("AwbText", () => {
  it("formats 11-digit AWB and renders with navy ui text color", () => {
    const html = renderToStaticMarkup(<AwbText awb="97824088584" />);
    expect(html).toContain("978-2408 8584");
    expect(html).toContain("text-ui-text");
  });

  it("renders warning for incomplete AWB flag", () => {
    const html = renderToStaticMarkup(
      <AwbText awb="978240885" flags={["incomplete"]} />
    );
    expect(html).toContain("⚠");
    expect(html).toContain("AWB chưa đủ 11 số");
  });

  it("renders highlight matching portion", () => {
    const html = renderToStaticMarkup(
      <AwbText awb="97824088584" highlight="8584" />
    );
    expect(html).toContain("decoration-teal-600");
  });
});

describe("FlightCell", () => {
  it("renders flight and date", () => {
    const html = renderToStaticMarkup(
      <FlightCell flight="VJ1813" flightDate="24SEP" sessionYmd="2026-09-25" />
    );
    expect(html).toContain("VJ1813");
    expect(html).toContain("24SEP");
    expect(html).not.toContain("Hôm nay");
  });

  it("renders Hôm nay badge when flight date matches session date", () => {
    const html = renderToStaticMarkup(
      <FlightCell flight="VJ1813" flightDate="25SEP" sessionYmd="2026-09-25" />
    );
    expect(html).toContain("Hôm nay");
  });
});
