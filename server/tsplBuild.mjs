/**
 * TSPL (TSC / nhiều máy Xprinter label) — lệnh RAW, không qua driver Chrome.
 * XP-470B: kiểm tra manual; nếu máy chỉ hỗ trợ ESC/POS label, đổi sang lệnh tương ứng.
 *
 * Tọa độ dot @ 203 dpi (mặc định tem 203). SIZE/GAP bằng mm theo firmware TSC.
 */

const DEFAULT_DPI = 203;

/** mm → dot (làm tròn) */
export function mmToDots(mm, dpi = DEFAULT_DPI) {
  return Math.round((Number(mm) / 25.4) * dpi);
}

function escTspl(str) {
  return String(str).replace(/"/g, "'");
}

/**
 * @param {object} p
 * @param {number} [p.widthMm]
 * @param {number} [p.heightMm]
 * @param {number} [p.gapMm]
 * @param {number} [p.dpi]
 * @param {string} p.airlineLine1
 * @param {string} p.airlineLine2
 * @param {string} p.awb — đã format
 * @param {string} [p.origin]
 * @param {string} p.dest
 * @param {string} p.pieces
 * @param {string} [p.awbDigits] — chỉ số, cho BARCODE 128
 */
export function buildTspl(p) {
  const w = p.widthMm ?? 100;
  const h = p.heightMm ?? 80;
  const gap = p.gapMm ?? 2;
  const dpi = p.dpi ?? DEFAULT_DPI;

  const d = (mm) => mmToDots(mm, dpi);

  const line1 = escTspl(p.airlineLine1 ?? "");
  const line2 = escTspl(p.airlineLine2 ?? "");
  const awb = escTspl(p.awb ?? "");
  const origin = escTspl(p.origin ?? "SGN");
  const dest = escTspl(p.dest ?? "");
  const pieces = escTspl(p.pieces ?? "");
  const digits = (p.awbDigits ?? "").replace(/\D/g, "").slice(0, 11);

  /* Font "4" thường là bitmap 32×32 TSC — nếu lỗi, đổi "3" hoặc "TSS24.BF2" theo manual máy */
  const F = "4";
  const mulA = 1;
  const mulB = 1;

  const parts = [
    `SIZE ${w} mm, ${h} mm`,
    `GAP ${gap} mm, 0 mm`,
    `DIRECTION 1`,
    `REFERENCE 0,0`,
    `CLS`,
    /* Hãng — hai dòng */
    `TEXT ${d(2)},${d(2)},"${F}",0,${mulA},${mulB},"${line1}"`,
    `TEXT ${d(2)},${d(7)},"${F}",0,${mulA},${mulB},"${line2}"`,
    /* AWB lớn hơn (nhân 2 nếu firmware hỗ trợ) */
    `TEXT ${d(2)},${d(12)},"${F}",0,2,2,"${awb}"`,
    /* Origin / Destination */
    `TEXT ${d(2)},${d(22)},"3",0,1,1,"Origin"`,
    `TEXT ${d(2)},${d(26)},"${F}",0,1,1,"${origin}"`,
    `TEXT ${d(52)},${d(22)},"3",0,1,1,"Destination"`,
    `TEXT ${d(52)},${d(26)},"${F}",0,1,1,"${dest}"`,
    `TEXT ${d(2)},${d(68)},"3",0,1,1,"Total no. of pieces"`,
    /* Số kiện góc phải dưới */
    `TEXT ${d(58)},${d(62)},"${F}",0,2,2,"${pieces}"`,
  ];

  if (digits.length >= 8) {
    parts.push(
      `BARCODE ${d(2)},${d(36)},"128",${d(8)},1,0,2,2,"${digits}"`
    );
  }

  parts.push(`PRINT 1,1`);
  return parts.join("\r\n") + "\r\n";
}
