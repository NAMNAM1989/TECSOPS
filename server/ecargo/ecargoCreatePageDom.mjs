import { buildWarehouseArrivalPlan } from "./ecargoWarehouseCore.mjs";

export async function runEcargoCreatePageDom(page, booking, fixedConfig) {
  const enrichedBooking = {
    ...booking,
    warehouseArrival: booking.warehouseArrival ?? buildWarehouseArrivalPlan(fixedConfig),
  };
  return page.evaluate(evaluateEcargoCreatePageDom, { booking: enrichedBooking, fixedConfig });
}

export async function evaluateEcargoCreatePageDom({ booking: b, fixedConfig: cfg }) {
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      function textOf(el) {
        return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
      }

      function visibleElements(selector) {
        return [...document.querySelectorAll(selector)].filter((el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        });
      }

      function visibleElementsIn(root, selector) {
        if (!root) return [];
        return [...root.querySelectorAll(selector)].filter((el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        });
      }

      function findButtonByText(text) {
        return visibleElements("button, input[type='button'], input[type='submit']").find((btn) => {
          const label = textOf(btn) || btn.value || "";
          return label.includes(text);
        });
      }

      function setNativeValue(input, value) {
        if (!input) throw new Error(`Không tìm thấy input: ${value}`);
        input.focus();
        const prototype = Object.getPrototypeOf(input);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        if (descriptor?.set) descriptor.set.call(input, String(value));
        else input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.blur();
      }

      function chooseRadioByIndex(index) {
        const radios = visibleElements("input[type='radio']");
        const radio = radios[index];
        if (!radio) throw new Error(`Không tìm thấy radio thứ ${index + 1}.`);
        if (!radio.checked) {
          radio.click();
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }

      function chooseDocumentRadio(group, documentType) {
        const offsets = { CCCD: 0, Passport: 1, GPLX: 2 };
        const base = group === "agent" ? 0 : 7;
        chooseRadioByIndex(base + (offsets[documentType] ?? 0));
      }

      function chooseVehicleRadio(vehicleType) {
        const offsets = { "Ô tô": 0, "Xe máy": 1, "Xe ba gác": 2, "Đi bộ": 3 };
        chooseRadioByIndex(3 + (offsets[vehicleType] ?? 0));
      }

      function getArrivalTimeSelect() {
        return (
          visibleElements("select").find(
            (item) => item.name === "Order.ArrivalTime" || item.id === "txtArrivalTime"
          ) ?? visibleElements("select")[0]
        );
      }

      function listTimeSlotTexts() {
        const select = getArrivalTimeSelect();
        if (!select) return [];
        return [...select.options].map((o) => o.textContent.trim()).filter(Boolean);
      }

      function todayAtVietnamTimeInBrowser() {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Ho_Chi_Minh",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(new Date());
        const get = (type) => parts.find((p) => p.type === type)?.value;
        return {
          date: `${get("year")}-${get("month")}-${get("day")}`,
          hour: Number(get("hour")),
          minute: Number(get("minute")),
        };
      }

      /** Chọn khung giờ thực tế trên dropdown — eCargo chặn mở AWB nếu < 6h. */
      function resolveWarehouseTimeSlot(plan) {
        const pageSlots = listTimeSlotTexts();
        if (plan?.timeSlot && pageSlots.includes(plan.timeSlot)) return plan.timeSlot;
        if (!pageSlots.length) return plan?.timeSlot ?? "";
        const vn = todayAtVietnamTimeInBrowser();
        const bufferMinutes = 360;
        const nowMinutes = vn.hour * 60 + vn.minute;
        const next = pageSlots.find((slot) => {
          const startHour = parseSlotStartHour(slot);
          return startHour >= 0 && startHour * 60 >= nowMinutes + bufferMinutes;
        });
        return next ?? pageSlots[pageSlots.length - 1];
      }

      function parseSlotStartHour(slotText) {
        const match = /^(\d{1,2}):/.exec(String(slotText || ""));
        return match ? Number(match[1]) : -1;
      }

      function selectTimeSlot(slotText) {
        const select = getArrivalTimeSelect();
        if (!select) throw new Error(`Không tìm thấy khung giờ ${slotText}`);
        const option = [...select.options].find((o) => o.textContent.trim() === slotText);
        if (!option) throw new Error(`Không tìm thấy khung giờ ${slotText}`);
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }

      function mainInputs() {
        const modal = getOpenModal();
        return visibleElements("input, textarea").filter((item) => {
          if (modal && modal.contains(item)) return false;
          if (["radio", "checkbox", "hidden", "search"].includes(item.type)) return false;
          if (item.classList.contains("select2-search__field")) return false;
          return true;
        });
      }

      function getOpenModal() {
        return visibleElements(".modal.show, .modal, [role='dialog']").find((modal) =>
          textOf(modal).includes("Thêm AWB")
        );
      }

      function modalInputs() {
        const modal = getOpenModal();
        if (!modal) throw new Error("Không thấy cửa sổ Thêm AWB.");
        return visibleElementsIn(modal, "input, textarea").filter(
          (item) => item.type !== "radio" && item.type !== "checkbox" && !item.classList.contains("select2-search__field")
        );
      }

      function mainFormValidationHint() {
        const bits = visibleElements(
          ".text-danger, .invalid-feedback, .field-validation-error, .alert-danger, .alert-warning"
        )
          .map((el) => textOf(el))
          .filter((t) => t && t !== "(*)" && !/email doanh nghiệp/i.test(t));
        return bits.join(" · ");
      }

      function modalValidationHint() {
        const modal = getOpenModal();
        if (!modal) return "";
        const bits = visibleElementsIn(modal, ".text-danger, .invalid-feedback, .field-validation-error, .alert-danger")
          .map((el) => textOf(el))
          .filter(Boolean);
        return bits.join(" · ");
      }

      function splitFlight(value) {
        const flight = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const two = flight.match(/^([A-Z]{2})(\d{3,4}[A-Z]?)$/);
        if (two) return { carrier: two[1], flightNo: two[2] };
        const three = flight.match(/^([A-Z0-9]{3})(\d{3,4}[A-Z]?)$/);
        if (three) return { carrier: three[1], flightNo: three[2] };
        return { carrier: flight.slice(0, 2), flightNo: flight.slice(2) };
      }

      function scoreSaveLabel(label) {
        const t = String(label || "").replace(/\s+/g, " ").trim();
        if (!t) return -100;
        if (/h[uủ]y|cancel|quay\s*lại/i.test(t)) return -100;
        if (/save\s*&?\s*close/i.test(t)) return 100;
        if (/^close$/i.test(t) || (/\bclose\b/i.test(t) && !/save/i.test(t))) return -100;
        if (/^l[uư]u$/i.test(t)) return 100;
        if (/x[aá]c\s*nh[aậ]n/i.test(t)) return 95;
        if (/^ok$/i.test(t) || /^save$/i.test(t)) return 90;
        if (/th[eê]m\s*house/i.test(t)) return 10;
        if (/^th[eê]m$/i.test(t)) return 80;
        if (/th[eê]m\s*awb/i.test(t)) return 20;
        if (/th[eê]m/i.test(t)) return 70;
        return -1;
      }

      function buttonLabel(btn) {
        return textOf(btn) || btn.value || btn.getAttribute("aria-label") || "";
      }

      function findModalSaveButton(modal) {
        const candidates = visibleElementsIn(
          modal,
          "button, input[type='button'], input[type='submit'], a.btn, a.button"
        );
        const ranked = candidates
          .map((btn) => ({ btn, score: scoreSaveLabel(buttonLabel(btn)) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score);
        return ranked[0]?.btn ?? null;
      }

      function rowContainsMawb(rowText, mawbRaw) {
        const compactRow = String(rowText || "").replace(/\s+/g, "");
        if (!compactRow) return false;
        const digits = String(mawbRaw || "").replace(/\D/g, "");
        if (digits.length < 11) return compactRow.length > 0;
        const prefix = digits.slice(0, 3);
        const suffix = digits.slice(3);
        if (compactRow.includes(digits)) return true;
        if (compactRow.includes(`${prefix}-${suffix}`)) return true;
        return compactRow.includes(prefix) && compactRow.includes(suffix);
      }

      function hasAwbRow(expectedMawb) {
        return visibleElements("table tbody tr").some((row) =>
          rowContainsMawb(textOf(row), expectedMawb)
        );
      }

      function applyWarehouseArrival(plan) {
        const inputs = mainInputs();
        if (inputs.length < 4) throw new Error("Không tìm thấy ngày hàng vào.");
        if (!plan?.arrivalDate || !plan?.timeSlot) {
          throw new Error("Thiếu kế hoạch ngày/giờ hàng vào kho.");
        }
        setNativeValue(inputs[3], plan.arrivalDate);
        const slot = resolveWarehouseTimeSlot(plan);
        if (!slot) throw new Error("Không chọn được khung giờ hàng vào kho.");
        selectTimeSlot(slot);
      }

      function fillMainForm(data) {
        const inputs = mainInputs();
        if (inputs.length < 9) throw new Error("Không đủ trường form chính.");
        setNativeValue(inputs[0], cfg.agency.name);
        setNativeValue(inputs[1], cfg.agent.name);
        chooseDocumentRadio("agent", cfg.agent.documentType);
        setNativeValue(inputs[2], cfg.agent.documentNo);
        chooseVehicleRadio(cfg.vehicle.type);
        setNativeValue(inputs[4], data.vehicleNo);
        setNativeValue(inputs[5], data.driverName || cfg.driver.name);
        chooseDocumentRadio("driver", cfg.driver.documentType);
        setNativeValue(inputs[6], data.driverId || cfg.driver.documentNo);
        setNativeValue(inputs[7], cfg.contact.email);
        setNativeValue(inputs[8], cfg.contact.phone);
        applyWarehouseArrival(b.warehouseArrival);
      }

      function fillAwbModal(data) {
        const inputs = modalInputs();
        if (inputs.length < 8) throw new Error("Không đủ trường modal AWB.");
        const { carrier, flightNo } = splitFlight(data.flight);
        const mawbDigits = data.mawb.replace(/\D/g, "");
        setNativeValue(inputs[0], carrier);
        setNativeValue(inputs[1], flightNo);
        setNativeValue(inputs[2], data.flightDate);
        setNativeValue(inputs[3], data.destination);
        setNativeValue(inputs[4], mawbDigits.slice(0, 3));
        setNativeValue(inputs[5], mawbDigits.slice(3));
        setNativeValue(inputs[6], data.hawb && data.hawb !== "0" ? data.hawb : "");
        setNativeValue(inputs[7], data.pcs);
        setNativeValue(inputs[8], data.grossWeight);
        if (inputs.length > 9) {
          const rawCommodity = cfg?.bookingDefaults?.commodity || "Garments";
          const commodity =
            String(rawCommodity)
              .replace(/[^a-zA-Z0-9 ]/g, " ")
              .replace(/\s+/g, " ")
              .trim() || "Garments";
          setNativeValue(inputs[9], commodity);
        }

        if (data.shc && data.shc !== "0") {
          const modal = getOpenModal();
          const search = visibleElementsIn(modal, "input.select2-search__field, input[type='search']").at(-1);
          if (search) {
            search.focus();
            setNativeValue(search, data.shc);
            search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          }
        }
      }

      async function openAwbModal() {
        const button = findButtonByText("Thêm AWB");
        if (!button) throw new Error("Không tìm thấy nút Thêm AWB.");
        button.scrollIntoView({ block: "center", inline: "nearest" });
        button.click();
        for (let i = 0; i < 50; i += 1) {
          if (getOpenModal()) return;
          await sleep(100);
        }
        const hint = mainFormValidationHint();
        throw new Error(
          hint
            ? `Không mở được modal Thêm AWB — ${hint}`
            : "Không mở được modal Thêm AWB — kiểm tra ngày/giờ hàng vào kho (eCargo yêu cầu ≥ 6 giờ)."
        );
      }

      async function saveAwbModal() {
        const modal = getOpenModal();
        if (!modal) throw new Error("Không thấy cửa sổ Thêm AWB.");
        const saveButton = findModalSaveButton(modal);
        if (!saveButton) throw new Error("Không tìm thấy nút lưu AWB.");
        saveButton.click();
        await sleep(800);
      }

      async function waitForAwbSaved(expectedMawb) {
        for (let i = 0; i < 40; i += 1) {
          const modalOpen = Boolean(getOpenModal());
          if (hasAwbRow(expectedMawb) && !modalOpen) return;
          if (hasAwbRow(expectedMawb) && i >= 6) return;
          await sleep(100);
        }
        const hint = modalValidationHint();
        if (getOpenModal()) {
          throw new Error(
            hint
              ? `Modal AWB không đóng — ${hint}`
              : "Modal AWB không đóng sau khi bấm lưu — kiểm tra MAWB/chuyến/ngày bay."
          );
        }
        throw new Error(
          hint
            ? `Chưa lưu được AWB — ${hint}`
            : "Chưa có AWB trong bảng sau khi lưu — kiểm tra MAWB/chuyến/ngày bay hoặc dùng sao chép thủ công."
        );
      }

      async function createOrder() {
        const button = findButtonByText("Tạo phiếu");
        if (!button) throw new Error("Không tìm thấy nút Tạo phiếu.");
        if (!hasAwbRow(b.mawb)) throw new Error("Chưa có AWB trong bảng.");
        button.click();
        await sleep(500);
      }

      fillMainForm(b);
      await sleep(200);
      await openAwbModal();
      await sleep(300);
      fillAwbModal(b);
      await saveAwbModal();
      await waitForAwbSaved(b.mawb);
      await sleep(300);
      await createOrder();
      return { ok: true, vehicleNo: b.vehicleNo, mawb: b.mawb };
}
