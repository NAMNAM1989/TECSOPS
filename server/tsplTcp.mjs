import net from "node:net";

/**
 * Gửi buffer RAW tới cổng 9100 (JetDirect / nhiều máy nhiệt mạng).
 * USB: Windows thường cần share printer + cổng IP hoặc driver RAW — không dùng được TCP trực tiếp từ Node nếu không có IP.
 *
 * @param {string} host
 * @param {number} [port=9100]
 * @param {Buffer} payload
 * @param {number} [timeoutMs=8000]
 */
export function sendRawToPrinter(host, port = 9100, payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port }, () => {
      sock.write(payload, (err) => {
        if (err) {
          sock.destroy();
          reject(err);
          return;
        }
        sock.end();
      });
    });
    sock.setTimeout(timeoutMs);
    sock.on("timeout", () => {
      sock.destroy();
      reject(new Error("Printer TCP timeout"));
    });
    sock.on("error", reject);
    sock.on("close", () => resolve(undefined));
  });
}
