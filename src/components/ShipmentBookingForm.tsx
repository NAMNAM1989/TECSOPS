import { useState, useRef, useEffect, useMemo } from "react";
import type { Shipment, Warehouse } from "../types/shipment";
import type { CustomerDirectoryEntry } from "../types/customerDirectory";
import type { GlobalAgentCatalog } from "../types/globalAgents";
import { findGlobalAgentById } from "../utils/globalAgentsCore";
import { formatAwb, rawAwbDigits } from "../utils/awbFormat";
import { isAwbDigitsTaken } from "../utils/awbUnique";
import { mergeCustomerOptions, persistNewCustomer } from "../utils/customerStorage";
import { warehouseLabel } from "../constants/warehouses";
import { CUSTOMERS, WAREHOUSES, DESTINATIONS } from "../data/customers";
import {
  buildCutoffIsoFromDateAndTimeText,
  formatYmdToFlightDateDdMon,
  parseBookingDateLoose,
  parseCutoffTimeCompact,
  splitIsoToLocalDateTime,
  ymdToDdMon,
} from "../utils/bookingDateParse";
import { deriveAutoWorkflowStatus, isAutoWorkflowStatus } from "../utils/shipmentWorkflowStatus";
import { lookupCustomerCodeByName, lookupCustomerEntryByName } from "../utils/customerDirectoryCore";
import {
  resolveDefaultConsignee,
  resolveDefaultGoods,
  resolveDefaultShipper,
} from "../utils/customerDirectoryDefaults";
import { normalizePrintAddressMultiline } from "../utils/printAddressMultiline";

type BaseProps = {
  sessionDateYmd: string;
  allRows: Shipment[];
  onClose: () => void;
  /** Danh bạ từ máy chủ — nếu có phần tử, booking chỉ chọn khách trong danh sách (có mã). */
  customerDirectory?: readonly CustomerDirectoryEntry[];
  globalAgents?: GlobalAgentCatalog;
};

type AddMode = BaseProps & {
  mode?: "add";
  onAdd: (shipment: Omit<Shipment, "id" | "stt">) => void;
};

type EditMode = BaseProps & {
  mode: "edit";
  shipment: Shipment;
  onSave: (patch: Partial<Shipment>) => void;
};

export type ShipmentBookingFormProps = AddMode | EditMode;

export function ShipmentBookingForm(props: ShipmentBookingFormProps) {
  const isEdit = props.mode === "edit";
  const editShipment = isEdit ? props.shipment : null;
  const directory = props.customerDirectory ?? [];
  const globalAgents = props.globalAgents;
  const useCustomerDirectory = directory.length > 0;

  const [awbRaw, setAwbRaw] = useState("");
  const [hawb, setHawb] = useState("");
  const [flight, setFlight] = useState("");
  /** Ngày bay nhập tay: 15APR, 2026-04-15, 15/04/2026 … */
  const [flightDateText, setFlightDateText] = useState("");
  /** Ngày cutoff nhập tay (cùng định dạng). */
  const [cutoffDateText, setCutoffDateText] = useState("");
  /** Giờ cutoff: 17, 17H, 17:30, 1730 */
  const [cutoffTimeText, setCutoffTimeText] = useState("");
  const [dest, setDest] = useState("");
  const [destSearch, setDestSearch] = useState("");
  const [showDestList, setShowDestList] = useState(false);
  const [warehouse, setWarehouse] = useState<Warehouse>("TECS-TCS");
  const [customer, setCustomer] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [shipperNamePrint, setShipperNamePrint] = useState("");
  const [shipperAddressPrint, setShipperAddressPrint] = useState("");
  const [shipperPhonePrint, setShipperPhonePrint] = useState("");
  const [shipperEmailPrint, setShipperEmailPrint] = useState("");
  const [taxCodePrint, setTaxCodePrint] = useState("");
  const [agentNamePrint, setAgentNamePrint] = useState("");
  const [agentAddressPrint, setAgentAddressPrint] = useState("");
  const [agentPhonePrint, setAgentPhonePrint] = useState("");
  const [agentEmailPrint, setAgentEmailPrint] = useState("");
  const [agentTaxCodePrint, setAgentTaxCodePrint] = useState("");
  const [consigneeNamePrint, setConsigneeNamePrint] = useState("");
  const [consigneeAddressPrint, setConsigneeAddressPrint] = useState("");
  const [consigneePhonePrint, setConsigneePhonePrint] = useState("");
  const [consigneeEmailPrint, setConsigneeEmailPrint] = useState("");
  const [notifyNamePrint, setNotifyNamePrint] = useState("");
  /** Khóa Agent / CNEE lưu sẵn trong danh bạ. */
  const [globalAgentId, setGlobalAgentId] = useState("");
  const [customerGoodsId, setCustomerGoodsId] = useState("");
  const [goodsDescriptionPrint, setGoodsDescriptionPrint] = useState("");
  const [customerShipperId, setCustomerShipperId] = useState("");
  const [customerConsigneeId, setCustomerConsigneeId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [note, setNote] = useState("");
  const [dimKg, setDimKg] = useState("");
  const [showPrintDetails, setShowPrintDetails] = useState(false);

  const awbRef = useRef<HTMLInputElement>(null);
  const hawbRef = useRef<HTMLInputElement>(null);
  const flightRef = useRef<HTMLInputElement>(null);
  const flightDateTextRef = useRef<HTMLInputElement>(null);
  const cutoffDateTextRef = useRef<HTMLInputElement>(null);
  const cutoffTimeTextRef = useRef<HTMLInputElement>(null);
  const destInputRef = useRef<HTMLInputElement>(null);
  const warehouseRef = useRef<HTMLSelectElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const dimKgRef = useRef<HTMLInputElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  const destRef = useRef<HTMLDivElement>(null);

  const sessionYear = useMemo(() => parseInt(props.sessionDateYmd.slice(0, 4), 10), [props.sessionDateYmd]);

  useEffect(() => {
    if (!isEdit || !editShipment) return;
    setAwbRaw(rawAwbDigits(editShipment.awb));
    setHawb((editShipment.hawb ?? "").trim());
    setFlight(editShipment.flight);
    setFlightDateText(editShipment.flightDate?.trim() || "");
    const co = editShipment.cutoff ? splitIsoToLocalDateTime(editShipment.cutoff) : { date: "", hour: "", minute: "" };
    setCutoffDateText(co.date ? ymdToDdMon(co.date) : "");
    setCutoffTimeText(
      co.hour !== "" && co.minute !== "" ? `${co.hour}:${co.minute}` : ""
    );
    setDest(editShipment.dest);
    setDestSearch("");
    setWarehouse(editShipment.warehouse);
    setCustomer(editShipment.customer);
    setCustomerCode((editShipment.customerCode ?? "").trim());
    setCustomerId((editShipment.customerId ?? "").trim());
    setShipperNamePrint((editShipment.shipperNamePrint ?? "").trim());
    setShipperAddressPrint(normalizePrintAddress(editShipment.shipperAddressPrint ?? "", 2));
    setShipperPhonePrint((editShipment.shipperPhonePrint ?? "").trim());
    setShipperEmailPrint((editShipment.shipperEmailPrint ?? "").trim());
    setTaxCodePrint((editShipment.taxCodePrint ?? "").trim());
    setAgentNamePrint((editShipment.agentNamePrint ?? "").trim());
    setAgentAddressPrint(normalizePrintAddress(editShipment.agentAddressPrint ?? ""));
    setAgentPhonePrint((editShipment.agentPhonePrint ?? "").trim());
    setAgentEmailPrint((editShipment.agentEmailPrint ?? "").trim());
    setAgentTaxCodePrint((editShipment.agentTaxCodePrint ?? "").trim());
    setConsigneeNamePrint((editShipment.consigneeNamePrint ?? "").trim());
    setConsigneeAddressPrint(normalizePrintAddress(editShipment.consigneeAddressPrint ?? ""));
    setConsigneePhonePrint((editShipment.consigneePhonePrint ?? "").trim());
    setConsigneeEmailPrint((editShipment.consigneeEmailPrint ?? "").trim());
    setNotifyNamePrint((editShipment.notifyNamePrint ?? "").trim());
    setGlobalAgentId((editShipment.globalAgentId ?? editShipment.globalAgentId ?? "").trim());
    setCustomerGoodsId((editShipment.customerGoodsId ?? "").trim());
    setGoodsDescriptionPrint((editShipment.goodsDescriptionPrint ?? "").trim());
    setCustomerShipperId((editShipment.customerShipperId ?? "").trim());
    setCustomerConsigneeId((editShipment.customerConsigneeId ?? "").trim());
    setCustomerSearch("");
    setNote(editShipment.note ?? "");
    setDimKg(editShipment.dimWeightKg != null ? String(editShipment.dimWeightKg) : "");
  }, [isEdit, editShipment?.id]);

  useEffect(() => {
    if (isEdit) return;
    awbRef.current?.focus();
  }, [isEdit]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!customerRef.current?.contains(t)) setShowCustomerList(false);
      if (!destRef.current?.contains(t)) setShowDestList(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [customerListVersion, setCustomerListVersion] = useState(0);
  const customerOptions = useMemo(
    () => mergeCustomerOptions(CUSTOMERS),
    [customerListVersion]
  );

  const directoryCustomer = useMemo(() => {
    if (!useCustomerDirectory || !customerId.trim()) return undefined;
    return directory.find((e) => e.id.trim() === customerId.trim());
  }, [useCustomerDirectory, customerId, directory]);

  const globalAgentOptions = globalAgents?.agents ?? [];
  const savedShipperOptions = directoryCustomer?.savedShippers ?? [];
  const savedConsigneeOptions = directoryCustomer?.savedConsignees ?? [];
  const savedGoodsOptions = directoryCustomer?.savedGoods ?? [];

  const filteredCustomers = useCustomerDirectory
    ? directory.filter(
        (e) =>
          e.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
          e.code.toLowerCase().includes(customerSearch.toLowerCase())
      )
    : customerOptions.filter((c) => c.toLowerCase().includes(customerSearch.toLowerCase()));

  const searchTrim = customerSearch.trim();
  const canUseTypedCustomer =
    !useCustomerDirectory &&
    searchTrim.length > 0 &&
    !customerOptions.some((c) => c.toLowerCase() === searchTrim.toLowerCase());

  const destOptions = useMemo(
    () => [...DESTINATIONS].sort((a, b) => a.localeCompare(b)),
    []
  );
  const filteredDests = destOptions.filter((d) =>
    d.toLowerCase().includes(destSearch.toLowerCase())
  );
  const destSearchTrim = destSearch.trim().toUpperCase();
  const canUseTypedDest =
    destSearchTrim.length > 0 &&
    !destOptions.some((d) => d.toUpperCase() === destSearchTrim);

  const awbDisplay = formatAwb(awbRaw);
  const awbDigits = rawAwbDigits(awbRaw);
  const awbValid = awbDigits.length === 11;
  const exceptId = isEdit ? editShipment!.id : null;
  const awbConflict =
    awbValid && isAwbDigitsTaken(props.allRows, awbDigits, exceptId);

  function buildCutoffIso(): string {
    return buildCutoffIsoFromDateAndTimeText(cutoffDateText, cutoffTimeText, sessionYear);
  }

  const flightYmdResolved = useMemo(
    () => parseBookingDateLoose(flightDateText.trim(), sessionYear),
    [flightDateText, sessionYear]
  );

  const effectiveCustomer = (customer || searchTrim).trim();
  const effectiveDest = (dest || destSearchTrim).trim();
  const customerPickOk =
    !useCustomerDirectory ||
    Boolean(
      customer &&
        customerCode &&
        customerId &&
        directory.some(
          (e) =>
            e.id.trim() === customerId.trim() &&
            e.code.trim() === customerCode.trim() &&
            e.name.trim() === customer.trim()
        )
    );
  const canSubmit =
    awbValid &&
    !awbConflict &&
    flight.trim() &&
    !!flightYmdResolved &&
    effectiveDest.length > 0 &&
    warehouse &&
    effectiveCustomer.length > 0 &&
    customerPickOk;

  function focusNextFrom(el: EventTarget | null) {
    const order: (HTMLElement | null)[] = [
      awbRef.current,
      hawbRef.current,
      flightRef.current,
      flightDateTextRef.current,
      cutoffDateTextRef.current,
      cutoffTimeTextRef.current,
      destInputRef.current,
      warehouseRef.current,
      customerInputRef.current,
      noteRef.current,
      dimKgRef.current,
    ];
    const node = el as HTMLElement | null;
    const idx = node ? order.indexOf(node) : -1;
    if (idx >= 0 && idx < order.length - 1) {
      order[idx + 1]?.focus();
      return;
    }
    if (idx === order.length - 1) {
      if (canSubmit) {
        (node?.closest("form") as HTMLFormElement | null)?.requestSubmit();
      } else {
        submitBtnRef.current?.focus();
      }
    }
  }

  function handleEnterAdvance(e: React.KeyboardEvent, field: "field" | "customer" | "dim") {
    if (e.key !== "Enter" || (e.nativeEvent as KeyboardEvent).isComposing) return;
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

    if (field === "dim") {
      e.preventDefault();
      if (canSubmit) {
        (e.currentTarget.closest("form") as HTMLFormElement | null)?.requestSubmit();
      } else {
        submitBtnRef.current?.focus();
      }
      return;
    }

    if (field === "customer") {
      e.preventDefault();
      if (canSubmit) {
        (e.currentTarget.closest("form") as HTMLFormElement | null)?.requestSubmit();
      } else {
        noteRef.current?.focus();
      }
      return;
    }

    e.preventDefault();
    focusNextFrom(e.currentTarget);
  }

  function normalizePrintText(v: string): string {
    return v.replace(/\s+/g, " ").trim();
  }

  function normalizePrintAddress(v: string, maxLines = 6): string {
    return normalizePrintAddressMultiline(v, maxLines).slice(0, 300);
  }

  function applyCustomerToPrintFields(nextName: string, nextCode: string): void {
    const byCode = nextCode
      ? directory.find((e) => e.code.trim().toLowerCase() === nextCode.trim().toLowerCase())
      : undefined;
    const entry = byCode ?? lookupCustomerEntryByName(directory, nextName);
    if (!entry) {
      setShipperNamePrint(normalizePrintText(nextName).slice(0, 45));
      setShipperAddressPrint("");
      setShipperPhonePrint("");
      setShipperEmailPrint("");
      setTaxCodePrint("");
      setAgentNamePrint("");
      setAgentAddressPrint("");
      setAgentPhonePrint("");
      setAgentEmailPrint("");
      setAgentTaxCodePrint("");
      setConsigneeNamePrint("");
      setConsigneeAddressPrint("");
      setConsigneePhonePrint("");
      setConsigneeEmailPrint("");
      setNotifyNamePrint("");
      setGlobalAgentId("");
      setCustomerGoodsId("");
      setGoodsDescriptionPrint("");
      setCustomerShipperId("");
      setCustomerConsigneeId("");
      return;
    }
    const defaultAgent = globalAgents ? findGlobalAgentById(globalAgents, globalAgents.defaultAgentId) : undefined;
    const pickShipper = resolveDefaultShipper(entry);
    const pickCnee = resolveDefaultConsignee(entry);
    const pickGoods = resolveDefaultGoods(entry);
    setCustomerShipperId(pickShipper?.id ?? "");
    setShipperNamePrint(normalizePrintText(pickShipper?.shipperName ?? "").slice(0, 45));
    setShipperAddressPrint(normalizePrintAddress(pickShipper?.shipperAddress ?? "", 2));
    setShipperPhonePrint(normalizePrintText(pickShipper?.shipperPhone ?? "").slice(0, 24));
    setTaxCodePrint(normalizePrintText(pickShipper?.taxCode ?? "").slice(0, 24));
    setShipperEmailPrint(normalizePrintText(pickShipper?.shipperEmail ?? "").slice(0, 50));
    setGlobalAgentId(globalAgents?.defaultAgentId ?? "");
    if (defaultAgent && !defaultAgent.isNone) {
      setAgentNamePrint(normalizePrintText(defaultAgent.agentName).slice(0, 45));
      setAgentAddressPrint(normalizePrintAddress(defaultAgent.agentAddress));
      setAgentPhonePrint(normalizePrintText(defaultAgent.agentPhone).slice(0, 24));
      setAgentEmailPrint(normalizePrintText(defaultAgent.agentEmail).slice(0, 50));
      setAgentTaxCodePrint(normalizePrintText(defaultAgent.agentTaxCode).slice(0, 24));
    } else {
      setAgentNamePrint("");
      setAgentAddressPrint("");
      setAgentPhonePrint("");
      setAgentEmailPrint("");
      setAgentTaxCodePrint("");
    }
    setCustomerConsigneeId(pickCnee?.id ?? "");
    setConsigneeNamePrint(normalizePrintText(pickCnee?.consigneeName ?? "").slice(0, 45));
    setConsigneeAddressPrint(normalizePrintAddress(pickCnee?.consigneeAddress ?? ""));
    setConsigneePhonePrint(normalizePrintText(pickCnee?.consigneePhone ?? "").slice(0, 24));
    setConsigneeEmailPrint(normalizePrintText(pickCnee?.consigneeEmail ?? "").slice(0, 50));
    setNotifyNamePrint(normalizePrintText(pickCnee?.notifyName ?? "").slice(0, 80));
    setCustomerGoodsId(pickGoods?.id ?? "");
    setGoodsDescriptionPrint(normalizePrintText(pickGoods?.goodsDescription ?? "").slice(0, 60));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const flightYmd = parseBookingDateLoose(flightDateText.trim(), sessionYear);
    if (!flightYmd) {
      window.alert(
        "Ngày bay không hợp lệ. VD: 15APR, 15 APR 2026, 2026-04-15, 15/04/2026 — hoặc Tab sang ô và chỉnh lại."
      );
      flightDateTextRef.current?.focus();
      return;
    }

    const cdt = cutoffDateText.trim();
    const ctt = cutoffTimeText.trim();
    if (cdt || ctt) {
      if (!cdt || !ctt) {
        window.alert("Cutoff: nhập cả ngày và giờ, hoặc để trống cả hai ô.");
        return;
      }
      if (!parseBookingDateLoose(cdt, sessionYear)) {
        window.alert("Ngày cutoff không hợp lệ. VD: 15APR, 15/04/2026, 2026-04-15");
        cutoffDateTextRef.current?.focus();
        return;
      }
      if (!parseCutoffTimeCompact(ctt)) {
        window.alert("Giờ cutoff không hợp lệ. VD: 17, 17H, 17:30, 1730");
        cutoffTimeTextRef.current?.focus();
        return;
      }
    }

    if (!useCustomerDirectory) {
      persistNewCustomer(effectiveCustomer, CUSTOMERS);
      setCustomerListVersion((v) => v + 1);
    }

    const cutoff = buildCutoffIso();
    const dimTrim = dimKg.trim();
    let dimWeightKg: number | null = null;
    if (dimTrim !== "") {
      const n = Number(dimTrim.replace(",", "."));
      if (Number.isNaN(n) || n < 0) {
        window.alert("DIM (kg) không hợp lệ — để trống hoặc nhập số ≥ 0.");
        return;
      }
      dimWeightKg = n;
    }

    const initialDimStr = isEdit && editShipment ? (editShipment.dimWeightKg != null ? String(editShipment.dimWeightKg) : "") : "";
    const dimFieldChanged = isEdit && dimTrim !== initialDimStr;
    const dimLinesPayload =
      isEdit && editShipment && !dimFieldChanged ? editShipment.dimLines : null;
    const dimDivisorPayload =
      isEdit && editShipment && !dimFieldChanged ? editShipment.dimDivisor : null;

    const pcsVal = isEdit ? editShipment!.pcs : null;
    const derivedStatus = deriveAutoWorkflowStatus({
      awb: awbDisplay,
      pcs: pcsVal,
      dimWeightKg,
      dimLines: dimLinesPayload,
    });
    const nextStatus =
      isEdit && editShipment && !isAutoWorkflowStatus(editShipment.status)
        ? editShipment.status
        : derivedStatus;

    const payloadCommon = {
      awb: awbDisplay,
      hawb: normalizePrintText(hawb).slice(0, 32),
      flight: flight.toUpperCase(),
      flightDate: formatYmdToFlightDateDdMon(flightYmd),
      cutoff,
      cutoffNote: isEdit ? editShipment!.cutoffNote : "",
      note: note.trim(),
      dest: effectiveDest.toUpperCase(),
      warehouse,
      pcs: pcsVal,
      kg: isEdit ? editShipment!.kg : null,
      dimWeightKg,
      dimLines: dimLinesPayload,
      dimDivisor: dimDivisorPayload,
      customer: effectiveCustomer,
      customerCode: useCustomerDirectory
        ? customerCode.trim()
        : lookupCustomerCodeByName(directory, effectiveCustomer) || "",
      customerId: useCustomerDirectory ? customerId.trim() : "",
      globalAgentId: useCustomerDirectory ? globalAgentId.trim() : "",
      customerGoodsId: useCustomerDirectory ? customerGoodsId.trim() : "",
      goodsDescriptionPrint: normalizePrintText(goodsDescriptionPrint).slice(0, 60),
      customerShipperId: useCustomerDirectory ? customerShipperId.trim() : "",
      customerConsigneeId: useCustomerDirectory ? customerConsigneeId.trim() : "",
      shipperNamePrint: normalizePrintText(shipperNamePrint).slice(0, 45),
      shipperAddressPrint: normalizePrintAddress(shipperAddressPrint, 2),
      shipperPhonePrint: normalizePrintText(shipperPhonePrint).slice(0, 24),
      shipperEmailPrint: normalizePrintText(shipperEmailPrint).slice(0, 50),
      taxCodePrint: normalizePrintText(taxCodePrint).slice(0, 24),
      agentNamePrint: normalizePrintText(agentNamePrint).slice(0, 45),
      agentAddressPrint: normalizePrintAddress(agentAddressPrint),
      agentPhonePrint: normalizePrintText(agentPhonePrint).slice(0, 24),
      agentEmailPrint: normalizePrintText(agentEmailPrint).slice(0, 50),
      agentTaxCodePrint: normalizePrintText(agentTaxCodePrint).slice(0, 24),
      consigneeNamePrint: normalizePrintText(consigneeNamePrint).slice(0, 45),
      consigneeAddressPrint: normalizePrintAddress(consigneeAddressPrint),
      consigneePhonePrint: normalizePrintText(consigneePhonePrint).slice(0, 24),
      consigneeEmailPrint: normalizePrintText(consigneeEmailPrint).slice(0, 50),
      notifyNamePrint: normalizePrintText(notifyNamePrint).slice(0, 80),
      status: nextStatus,
    };

    if (isEdit) {
      props.onSave(payloadCommon);
      props.onClose();
    } else {
      props.onAdd({
        ...payloadCommon,
        sessionDate: props.sessionDateYmd,
      });
      setAwbRaw("");
      setHawb("");
      setFlight("");
      setFlightDateText("");
      setCutoffDateText("");
      setCutoffTimeText("");
      setDest("");
      setDestSearch("");
      setNote("");
      setDimKg("");
      setCustomer("");
      setCustomerCode("");
      setCustomerId("");
      setGlobalAgentId("");
      setCustomerGoodsId("");
      setGoodsDescriptionPrint("");
      setCustomerConsigneeId("");
      setCustomerSearch("");
      setShipperNamePrint("");
      setShipperAddressPrint("");
      setShipperPhonePrint("");
      setShipperEmailPrint("");
      setTaxCodePrint("");
      setAgentNamePrint("");
      setAgentAddressPrint("");
      setAgentPhonePrint("");
      setAgentEmailPrint("");
      setAgentTaxCodePrint("");
      setConsigneeNamePrint("");
      setConsigneeAddressPrint("");
      setConsigneePhonePrint("");
      setConsigneeEmailPrint("");
      setNotifyNamePrint("");
      setCustomerConsigneeId("");
      awbRef.current?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 backdrop-blur-xl sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            props.onClose();
          }
        }}
        className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-black/[0.08] bg-white shadow-apple-md"
      >
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
          <div>
            <h2 className="text-[19px] font-semibold tracking-tight text-apple-label">
              {isEdit ? "Sửa lô hàng" : "Nhập booking mới"}
            </h2>
            <p className="text-xs text-apple-secondary">
              Phiên ngày <span className="font-mono font-semibold text-apple-label">{props.sessionDateYmd}</span>
              {isEdit && (
                <>
                  {" "}
                  · AWB 11 số, không trùng trong toàn hệ thống
                </>
              )}
              {!isEdit && " — AWB 11 số tự format IATA"}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-apple-tertiary">
              <kbd className="rounded-md border border-black/[0.08] bg-black/[0.04] px-1.5 font-mono text-[10px]">Tab</kbd> /{" "}
              <kbd className="rounded-md border border-black/[0.08] bg-black/[0.04] px-1.5 font-mono text-[10px]">Enter</kbd> chuyển ô
              (ngày <span className="font-semibold text-apple-secondary">15APR</span>, giờ{" "}
              <span className="font-semibold text-apple-secondary">17H</span> / 17:30) ·{" "}
              <kbd className="rounded-md border border-black/[0.08] bg-black/[0.04] px-1.5 font-mono text-[10px]">Enter</kbd> ở ô DIM (hoặc
              Khách hàng khi đủ điều kiện) = <span className="font-semibold text-apple-secondary">Thêm lô</span> · Note:{" "}
              <kbd className="rounded-md border border-black/[0.08] bg-black/[0.04] px-1 font-mono text-[10px]">Enter</kbd> sang DIM,{" "}
              <kbd className="rounded-md border border-black/[0.08] bg-black/[0.04] px-1 font-mono text-[10px]">Shift+Enter</kbd> xuống
              dòng · <kbd className="rounded-md border border-black/[0.08] bg-black/[0.04] px-1.5 font-mono text-[10px]">Esc</kbd> đóng
            </p>
          </div>
          <button
            type="button"
            tabIndex={-1}
            onClick={props.onClose}
            className="rounded-full p-2 text-apple-tertiary hover:bg-black/[0.05] hover:text-apple-label"
            aria-label="Đóng (hoặc phím Esc)"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-apple-secondary">
              AWB (11 số)
            </label>
            <input
              ref={awbRef}
              type="text"
              inputMode="numeric"
              placeholder="VD: 78420042005"
              value={awbRaw}
              onChange={(e) => setAwbRaw(e.target.value.replace(/\D/g, "").slice(0, 11))}
              onKeyDown={(e) => handleEnterAdvance(e, "field")}
              className="w-full rounded-2xl border border-black/[0.08] bg-white px-4 py-3 font-mono text-lg font-semibold tracking-wide text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
            />
            {awbRaw.length > 0 && (
              <p className={`mt-1.5 font-mono text-sm font-bold ${awbValid && !awbConflict ? "text-emerald-600" : "text-amber-600"}`}>
                {awbDisplay}
                {!awbValid && (
                  <span className="ml-2 font-sans text-xs font-normal text-apple-tertiary">({awbDigits.length}/11 số)</span>
                )}
                {awbValid && awbConflict && (
                  <span className="ml-2 font-sans text-xs font-bold text-red-600">Đã có lô khác dùng số này</span>
                )}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-apple-secondary">
              HAWB (tuỳ chọn)
            </label>
            <input
              ref={hawbRef}
              type="text"
              placeholder="VD: SGN12345678"
              value={hawb}
              onChange={(e) => setHawb(e.target.value.slice(0, 32))}
              onKeyDown={(e) => handleEnterAdvance(e, "field")}
              className="w-full rounded-2xl border border-black/[0.08] bg-white px-4 py-2.5 font-mono text-sm font-semibold text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
            />
            <p className="mt-1 text-[10px] text-apple-tertiary">Hiển thị trên tem nhãn & phiếu cân khi có.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">
                Chuyến bay
              </label>
              <input
                ref={flightRef}
                type="text"
                placeholder="VD: MH751"
                value={flight}
                onChange={(e) => setFlight(e.target.value.toUpperCase())}
                onKeyDown={(e) => handleEnterAdvance(e, "field")}
                className="w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-semibold uppercase text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">
                Ngày bay
              </label>
              <input
                ref={flightDateTextRef}
                type="text"
                autoComplete="off"
                placeholder="VD: 15APR hoặc 2026-04-15"
                value={flightDateText}
                onChange={(e) => setFlightDateText(e.target.value.toUpperCase())}
                onBlur={() => {
                  if (isEdit) return;
                  const ymd = parseBookingDateLoose(flightDateText.trim(), sessionYear);
                  if (!ymd || cutoffDateText.trim() !== "") return;
                  setCutoffDateText(ymdToDdMon(ymd));
                }}
                onKeyDown={(e) => handleEnterAdvance(e, "field")}
                className="w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 font-mono text-sm font-semibold text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
              />
              {flightDateText.trim() && !flightYmdResolved ? (
                <p className="mt-1 text-[11px] font-medium text-amber-700">Chưa khớp định dạng ngày — kiểm tra lại.</p>
              ) : flightYmdResolved ? (
                <p className="mt-1 text-[11px] text-apple-tertiary">
                  → <span className="font-mono font-semibold text-apple-secondary">{flightYmdResolved}</span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">
                Ngày cutoff
              </label>
              <input
                ref={cutoffDateTextRef}
                type="text"
                autoComplete="off"
                placeholder="VD: 15APR (để trống nếu không có)"
                value={cutoffDateText}
                onChange={(e) => setCutoffDateText(e.target.value.toUpperCase())}
                onKeyDown={(e) => handleEnterAdvance(e, "field")}
                className="w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 font-mono text-sm font-semibold text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">
                Giờ cutoff (24h)
              </label>
              <input
                ref={cutoffTimeTextRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="VD: 17 hoặc 17H hoặc 17:30"
                value={cutoffTimeText}
                onChange={(e) => setCutoffTimeText(e.target.value)}
                onKeyDown={(e) => handleEnterAdvance(e, "field")}
                className="w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 font-mono text-sm font-bold text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                aria-label="Giờ cutoff nhập tay: 17, 17H, 17:30, 1730"
              />
              <p className="mt-1 text-[11px] text-apple-tertiary">
                Một ô — <span className="font-semibold text-apple-secondary">17</span> = 17:00,{" "}
                <span className="font-semibold text-apple-secondary">1730</span> = 17:30. Để trống cả ngày + giờ nếu không có cutoff.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div ref={destRef} className="relative">
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">
                Điểm đến (DEST)
              </label>
              <p className="mb-1 text-[11px] text-apple-tertiary">Gõ mã tùy ý hoặc chọn gợi ý.</p>
              <div
                className={`flex min-h-[42px] flex-wrap items-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-3 py-2 transition-colors ${
                  showDestList ? "border-apple-blue ring-2 ring-apple-blue/20" : ""
                }`}
              >
                {dest && (
                  <span className="shrink-0 rounded-full bg-apple-label px-2.5 py-1 text-xs font-semibold text-white">
                    {dest}
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        setDest("");
                        setDestSearch("");
                      }}
                      className="ml-1.5 text-white/70 hover:text-white"
                    >
                      ×
                    </button>
                  </span>
                )}
                <input
                  ref={destInputRef}
                  type="text"
                  placeholder={dest ? "" : "VD: KUL hoặc gõ mã mới…"}
                  value={destSearch}
                  onChange={(e) => {
                    setDestSearch(e.target.value.toUpperCase());
                    setShowDestList(true);
                  }}
                  onFocus={() => setShowDestList(true)}
                  onKeyDown={(e) => handleEnterAdvance(e, "field")}
                  className="min-w-[6rem] flex-1 bg-transparent text-sm font-semibold uppercase text-apple-label placeholder:text-apple-tertiary focus:outline-none"
                />
              </div>
              {showDestList && (
                <div className="absolute left-0 right-0 z-20 mt-1 max-h-40 overflow-y-auto rounded-2xl border border-black/[0.08] bg-white py-1 shadow-xl">
                  {canUseTypedDest && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        setDest(destSearchTrim);
                        setDestSearch("");
                        setShowDestList(false);
                      }}
                      className="block w-full border-b border-black/[0.06] bg-apple-blue/10 px-4 py-2.5 text-left text-sm font-semibold text-apple-blue hover:bg-apple-blue/15"
                    >
                      + Dùng mã «{destSearchTrim}»
                    </button>
                  )}
                  {filteredDests.length > 0 ? (
                    filteredDests.map((d) => (
                      <button
                        key={d}
                        type="button"
                        tabIndex={-1}
                        onClick={() => {
                          setDest(d);
                          setDestSearch("");
                          setShowDestList(false);
                        }}
                        className={`block w-full px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                          dest === d ? "bg-apple-blue/10 text-apple-blue" : "text-apple-label hover:bg-black/[0.03]"
                        }`}
                      >
                        {d}
                      </button>
                    ))
                  ) : (
                    !canUseTypedDest && (
                      <p className="px-4 py-3 text-xs text-apple-tertiary">Gõ mã DEST hoặc chọn từ danh sách</p>
                    )
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">
                Kho hàng
              </label>
              <select
                ref={warehouseRef}
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value as Warehouse)}
                onKeyDown={(e) => handleEnterAdvance(e, "field")}
                className="w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm font-bold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                aria-label="Kho hàng (↑↓ chọn, Enter sang khách hàng)"
              >
                {WAREHOUSES.map((w) => (
                  <option key={w} value={w}>
                    {warehouseLabel[w]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div ref={customerRef} className="relative">
            <label className="mb-1 block text-xs font-semibold text-apple-secondary">
              Khách hàng
            </label>
            <p className="mb-1 text-[11px] text-apple-tertiary">
              {useCustomerDirectory
                ? "Chọn khách trong danh bạ (mã + tên). Chỉnh danh sách tại nút «Danh sách khách hàng» trên đầu trang."
                : "Gõ tên mới rồi lưu — hệ thống tự nhớ lần sau (chế độ không dùng danh bạ mã)."}
            </p>
            <div
              className={`flex items-center gap-2 rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 transition-colors ${
                showCustomerList ? "border-apple-blue ring-2 ring-apple-blue/20" : ""
              }`}
            >
              {customer && (
                <span className="shrink-0 rounded-full bg-apple-label px-2.5 py-1 text-xs font-semibold text-white">
                  {useCustomerDirectory && customerCode ? `${customerCode} · ` : null}
                  {customer}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setCustomer("");
                      setCustomerCode("");
                      setCustomerId("");
                      setGlobalAgentId("");
      setCustomerGoodsId("");
      setGoodsDescriptionPrint("");
                      setCustomerConsigneeId("");
                      setShipperNamePrint("");
                      setShipperAddressPrint("");
                      setShipperPhonePrint("");
                      setShipperEmailPrint("");
                      setTaxCodePrint("");
                      setCustomerSearch("");
                    }}
                    className="ml-1.5 text-white/70 hover:text-white"
                  >
                    ×
                  </button>
                </span>
              )}
              <input
                ref={customerInputRef}
                type="text"
                placeholder={
                  customer ? "" : useCustomerDirectory ? "Tìm theo mã hoặc tên…" : "Tìm, chọn hoặc gõ tên khách mới..."
                }
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerList(true);
                }}
                onFocus={() => setShowCustomerList(true)}
                onKeyDown={(e) => handleEnterAdvance(e, "customer")}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-apple-label placeholder:text-apple-tertiary focus:outline-none"
              />
            </div>
            {showCustomerList && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-2xl border border-black/[0.08] bg-white py-1 shadow-xl">
                {canUseTypedCustomer && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      setCustomer(searchTrim);
                      setCustomerId("");
                      applyCustomerToPrintFields(searchTrim, "");
                      setCustomerSearch("");
                      setShowCustomerList(false);
                    }}
                    className="block w-full border-b border-black/[0.06] bg-apple-blue/10 px-4 py-2.5 text-left text-sm font-semibold text-apple-blue hover:bg-apple-blue/15"
                  >
                    + Dùng tên mới «{searchTrim}» (sẽ được lưu)
                  </button>
                )}
                {filteredCustomers.length > 0 ? (
                  useCustomerDirectory
                    ? (filteredCustomers as CustomerDirectoryEntry[]).map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          tabIndex={-1}
                          onClick={() => {
                            setCustomer(e.name);
                            setCustomerCode(e.code);
                            setCustomerId(e.id);
                            applyCustomerToPrintFields(e.name, e.code);
                            setCustomerSearch("");
                            setShowCustomerList(false);
                          }}
                          className={`block w-full px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                            customer === e.name && customerCode === e.code && customerId === e.id
                              ? "bg-apple-blue/10 text-apple-blue"
                              : "text-apple-label hover:bg-black/[0.03]"
                          }`}
                        >
                          <span className="font-mono text-xs text-apple-secondary">{e.code}</span>
                          <span className="mx-1.5 text-apple-tertiary">·</span>
                          {e.name}
                        </button>
                      ))
                    : (filteredCustomers as string[]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          tabIndex={-1}
                          onClick={() => {
                            setCustomer(c);
                            const code = lookupCustomerCodeByName(directory, c);
                            setCustomerCode(code);
                            const id = directory.find((e) => e.code.trim() === code.trim())?.id ?? "";
                            setCustomerId(id);
                            applyCustomerToPrintFields(c, code);
                            setCustomerSearch("");
                            setShowCustomerList(false);
                          }}
                          className={`block w-full px-4 py-2.5 text-left text-sm font-semibold transition-colors ${
                            customer === c ? "bg-apple-blue/10 text-apple-blue" : "text-apple-label hover:bg-black/[0.03]"
                          }`}
                        >
                          {c}
                        </button>
                      ))
                ) : (
                  !canUseTypedCustomer && (
                    <p className="px-4 py-3 text-xs text-apple-tertiary">Không tìm thấy — gõ tên khách mới</p>
                  )
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-black/[0.06] bg-black/[0.015] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-apple-secondary">
              Dữ liệu in phiếu cân thực tế
            </p>
            {useCustomerDirectory ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {savedShipperOptions.length > 0 ? (
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-apple-tertiary">Shipper</label>
                    <select
                      value={customerShipperId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomerShipperId(v);
                        const ss = savedShipperOptions.find((x) => x.id === v);
                        if (ss) {
                          setShipperNamePrint(normalizePrintText(ss.shipperName).slice(0, 45));
                          setShipperAddressPrint(normalizePrintAddress(ss.shipperAddress, 2));
                          setShipperPhonePrint(normalizePrintText(ss.shipperPhone).slice(0, 24));
                          setShipperEmailPrint(normalizePrintText(ss.shipperEmail).slice(0, 50));
                          setTaxCodePrint(normalizePrintText(ss.taxCode).slice(0, 24));
                        }
                      }}
                      className="w-full rounded-xl border border-black/[0.08] bg-white px-2 py-2 text-xs font-medium text-apple-label"
                    >
                      <option value="">— Shipper —</option>
                      {savedShipperOptions.map((ss) => (
                        <option key={ss.id} value={ss.id}>
                          {(ss.label.trim() ? `${ss.label} — ` : "") + (ss.shipperName.trim() || ss.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {savedConsigneeOptions.length > 0 ? (
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-apple-tertiary">CNEE</label>
                    <select
                      value={customerConsigneeId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomerConsigneeId(v);
                        const sc = savedConsigneeOptions.find((x) => x.id === v);
                        if (sc) {
                          setConsigneeNamePrint(normalizePrintText(sc.consigneeName).slice(0, 45));
                          setConsigneeAddressPrint(normalizePrintAddress(sc.consigneeAddress));
                          setConsigneePhonePrint(normalizePrintText(sc.consigneePhone).slice(0, 24));
                          setConsigneeEmailPrint(normalizePrintText(sc.consigneeEmail).slice(0, 50));
                          setNotifyNamePrint(normalizePrintText(sc.notifyName).slice(0, 80));
                        }
                      }}
                      className="w-full rounded-xl border border-black/[0.08] bg-white px-2 py-2 text-xs font-medium text-apple-label"
                    >
                      <option value="">— CNEE —</option>
                      {savedConsigneeOptions.map((sc) => (
                        <option key={sc.id} value={sc.id}>
                          {(sc.label.trim() ? `${sc.label} — ` : "") + (sc.consigneeName.trim() || sc.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {globalAgentOptions.length > 0 ? (
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-apple-tertiary">Agent</label>
                    <select
                      value={globalAgentId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setGlobalAgentId(v);
                        const ag = globalAgentOptions.find((x) => x.id === v);
                        if (ag) {
                          setAgentNamePrint(normalizePrintText(ag.agentName).slice(0, 45));
                          setAgentAddressPrint(normalizePrintAddress(ag.agentAddress));
                          setAgentPhonePrint(normalizePrintText(ag.agentPhone).slice(0, 24));
                          setAgentEmailPrint(normalizePrintText(ag.agentEmail).slice(0, 50));
                          setAgentTaxCodePrint(normalizePrintText(ag.agentTaxCode).slice(0, 24));
                        }
                      }}
                      className="w-full rounded-xl border border-black/[0.08] bg-white px-2 py-2 text-xs font-medium text-apple-label"
                    >
                      <option value="">— Agent —</option>
                      {globalAgentOptions.map((ag) => (
                        <option key={ag.id} value={ag.id}>
                          {(ag.label.trim() ? `${ag.label} — ` : "") + (ag.agentName.trim() || ag.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {savedGoodsOptions.length > 0 ? (
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-apple-tertiary">Tên hàng</label>
                    <select
                      value={customerGoodsId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomerGoodsId(v);
                        const g = savedGoodsOptions.find((x) => x.id === v);
                        if (g) setGoodsDescriptionPrint(normalizePrintText(g.goodsDescription).slice(0, 60));
                      }}
                      className="w-full rounded-xl border border-black/[0.08] bg-white px-2 py-2 text-xs font-medium text-apple-label"
                    >
                      <option value="">— Tên hàng —</option>
                      {savedGoodsOptions.map((g) => (
                        <option key={g.id} value={g.id}>
                          {(g.label.trim() ? `${g.label} — ` : "") + (g.goodsDescription.trim() || g.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            ) : null}
            <label className="flex cursor-pointer items-center gap-2 text-xs text-apple-secondary">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-black/20 accent-apple-blue"
                checked={showPrintDetails}
                onChange={(e) => setShowPrintDetails(e.target.checked)}
              />
              Chi tiết chỉnh sửa tay (địa chỉ, email…)
            </label>
            {showPrintDetails ? (
            <>
            <div>
              <p className="mb-1 text-[10px] leading-snug text-apple-tertiary">
                Shipper in trên phiếu cân — không nhầm với tên account khách ở trên.
              </p>
              {useCustomerDirectory && savedShipperOptions.length > 0 ? (
                <div className="mb-2">
                  <label className="mb-1 block text-[10px] font-semibold text-apple-tertiary">Shipper lưu sẵn</label>
                  <select
                    value={customerShipperId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomerShipperId(v);
                      const ss = savedShipperOptions.find((x) => x.id === v);
                      if (ss) {
                        setShipperNamePrint(normalizePrintText(ss.shipperName).slice(0, 45));
                        setShipperAddressPrint(normalizePrintAddress(ss.shipperAddress, 2));
                        setShipperPhonePrint(normalizePrintText(ss.shipperPhone).slice(0, 24));
                        setShipperEmailPrint(normalizePrintText(ss.shipperEmail).slice(0, 50));
                        setTaxCodePrint(normalizePrintText(ss.taxCode).slice(0, 24));
                      }
                    }}
                    className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-medium text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                  >
                    <option value="">— Chọn Shipper / nhập tay —</option>
                    {savedShipperOptions.map((ss) => (
                      <option key={ss.id} value={ss.id}>
                        {(ss.label.trim() ? `${ss.label} — ` : "") + (ss.shipperName.trim() || ss.id)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <label className="mb-1 block text-xs font-semibold text-apple-secondary">Người gửi (Shipper)</label>
              <input
                type="text"
                value={shipperNamePrint}
                onChange={(e) => setShipperNamePrint(e.target.value)}
                maxLength={45}
                className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-apple-secondary">SĐT</label>
                <input type="text" value={shipperPhonePrint} onChange={(e) => setShipperPhonePrint(e.target.value)} maxLength={24} className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-apple-secondary">Email</label>
                <input type="text" value={shipperEmailPrint} onChange={(e) => setShipperEmailPrint(e.target.value)} maxLength={50} className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <textarea value={shipperAddressPrint} onChange={(e) => setShipperAddressPrint(e.target.value)} rows={2} maxLength={300} placeholder="Địa chỉ — Enter = dòng 2 trên phiếu (tối đa 2 dòng)" className="sm:col-span-1 w-full resize-y rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
              <div>
                <label className="mb-1 block text-xs font-semibold text-apple-secondary">MST</label>
                <input type="text" value={taxCodePrint} onChange={(e) => setTaxCodePrint(e.target.value)} maxLength={24} className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 border-t border-black/[0.06] pt-2">
              <p className="text-[11px] font-semibold uppercase text-apple-secondary">Đơn vị dịch vụ (Agent)</p>
              {useCustomerDirectory && globalAgentOptions.length > 0 ? (
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-apple-tertiary">
                    Agent chung (phiếu cân)
                  </label>
                  <select
                    value={globalAgentId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setGlobalAgentId(v);
                      const ag = globalAgentOptions.find((x) => x.id === v);
                      if (ag) {
                        setAgentNamePrint(normalizePrintText(ag.agentName).slice(0, 45));
                        setAgentAddressPrint(normalizePrintAddress(ag.agentAddress));
                        setAgentPhonePrint(normalizePrintText(ag.agentPhone).slice(0, 24));
                        setAgentEmailPrint(normalizePrintText(ag.agentEmail).slice(0, 50));
                        setAgentTaxCodePrint(normalizePrintText(ag.agentTaxCode).slice(0, 24));
                      }
                    }}
                    className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-medium text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                  >
                    <option value="">— Chọn Agent —</option>
                    {globalAgentOptions.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {(ag.label.trim() ? `${ag.label} — ` : "") + (ag.agentName.trim() || ag.id)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <input type="text" value={agentNamePrint} onChange={(e) => setAgentNamePrint(e.target.value)} maxLength={45} placeholder="Tên agent" className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
              <textarea value={agentAddressPrint} onChange={(e) => setAgentAddressPrint(e.target.value)} rows={2} maxLength={300} placeholder="Địa chỉ agent — Enter để xuống dòng khi in" className="w-full resize-y rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input type="text" value={agentPhonePrint} onChange={(e) => setAgentPhonePrint(e.target.value)} maxLength={24} placeholder="SĐT agent" className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
                <input type="text" value={agentEmailPrint} onChange={(e) => setAgentEmailPrint(e.target.value)} maxLength={50} placeholder="Email agent" className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
                <input type="text" value={agentTaxCodePrint} onChange={(e) => setAgentTaxCodePrint(e.target.value)} maxLength={24} placeholder="MST agent" className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 border-t border-black/[0.06] pt-2">
              <p className="text-[11px] font-semibold uppercase text-apple-secondary">Tên hàng (phiếu cân)</p>
              {useCustomerDirectory && savedGoodsOptions.length > 0 ? (
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-apple-tertiary">Tên hàng lưu sẵn</label>
                  <select
                    value={customerGoodsId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomerGoodsId(v);
                      const g = savedGoodsOptions.find((x) => x.id === v);
                      if (g) setGoodsDescriptionPrint(normalizePrintText(g.goodsDescription).slice(0, 60));
                    }}
                    className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-medium text-apple-label"
                  >
                    <option value="">— Chọn tên hàng / nhập tay —</option>
                    {savedGoodsOptions.map((g) => (
                      <option key={g.id} value={g.id}>
                        {(g.label.trim() ? `${g.label} — ` : "") + (g.goodsDescription.trim() || g.id)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <input
                type="text"
                value={goodsDescriptionPrint}
                onChange={(e) => setGoodsDescriptionPrint(e.target.value)}
                maxLength={60}
                placeholder="Tên hàng in phiếu cân"
                className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 border-t border-black/[0.06] pt-2">
              <p className="text-[11px] font-semibold uppercase text-apple-secondary">Người nhận / Notify</p>
              {useCustomerDirectory && savedConsigneeOptions.length > 0 ? (
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-apple-tertiary">
                    CNEE lưu sẵn (phiếu cân)
                  </label>
                  <select
                    value={customerConsigneeId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomerConsigneeId(v);
                      const sc = savedConsigneeOptions.find((x) => x.id === v);
                      if (sc) {
                        setConsigneeNamePrint(normalizePrintText(sc.consigneeName).slice(0, 45));
                        setConsigneeAddressPrint(normalizePrintAddress(sc.consigneeAddress));
                        setConsigneePhonePrint(normalizePrintText(sc.consigneePhone).slice(0, 24));
                        setConsigneeEmailPrint(normalizePrintText(sc.consigneeEmail).slice(0, 50));
                        setNotifyNamePrint(normalizePrintText(sc.notifyName).slice(0, 80));
                      }
                    }}
                    className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-medium text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
                  >
                    <option value="">— Hồ sơ CNEE chính / nhập tay dưới —</option>
                    {savedConsigneeOptions.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {(sc.label.trim() ? `${sc.label} — ` : "") + (sc.consigneeName.trim() || sc.id)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <input type="text" value={consigneeNamePrint} onChange={(e) => setConsigneeNamePrint(e.target.value)} maxLength={45} placeholder="Tên consignee" className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
              <textarea value={consigneeAddressPrint} onChange={(e) => setConsigneeAddressPrint(e.target.value)} rows={2} maxLength={300} placeholder="Địa chỉ consignee — Enter để xuống dòng khi in" className="w-full resize-y rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input type="text" value={consigneePhonePrint} onChange={(e) => setConsigneePhonePrint(e.target.value)} maxLength={24} placeholder="SĐT consignee" className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
                <input type="text" value={consigneeEmailPrint} onChange={(e) => setConsigneeEmailPrint(e.target.value)} maxLength={50} placeholder="Email consignee" className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
                <input type="text" value={notifyNamePrint} onChange={(e) => setNotifyNamePrint(e.target.value)} maxLength={80} placeholder="Notify" className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm text-apple-label focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20" />
              </div>
            </div>
            </>
            ) : null}
          </div>

          <div>
            <label htmlFor="booking-note" className="mb-1 block text-xs font-semibold text-apple-secondary">
              Note
            </label>
            <p className="mb-1 text-[11px] text-apple-tertiary">Ghi chú thêm cho lô (tùy chọn).</p>
            <textarea
              ref={noteRef}
              id="booking-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || (e.nativeEvent as KeyboardEvent).isComposing) return;
                if (e.shiftKey) return;
                e.preventDefault();
                dimKgRef.current?.focus();
              }}
              rows={3}
              maxLength={2000}
              placeholder="VD: hàng dễ vỡ, ưu tiên xuất kho…"
              className="w-full resize-y rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
            />
          </div>

          <div>
            <label htmlFor="booking-dim-kg" className="mb-1 block text-xs font-semibold text-apple-secondary">
              Dimensional weight (kg)
            </label>
            <p className="mb-1 text-[11px] text-apple-tertiary">Trọng lượng thể tích — tùy chọn.</p>
            <input
              ref={dimKgRef}
              id="booking-dim-kg"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={dimKg}
              onChange={(e) => setDimKg(e.target.value)}
              onKeyDown={(e) => handleEnterAdvance(e, "dim")}
              placeholder="VD: 120.5"
              className="w-full rounded-2xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-apple-label placeholder:text-apple-tertiary focus:border-apple-blue focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-black/[0.06] px-5 py-4">
          <button
            ref={submitBtnRef}
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-full bg-apple-blue px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-apple-blue-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-apple-tertiary disabled:text-white/80"
          >
            {isEdit ? "Lưu thay đổi" : "Thêm lô hàng"}
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-full border border-black/[0.12] bg-white px-6 py-3.5 text-sm font-semibold text-apple-label hover:bg-black/[0.03]"
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}
