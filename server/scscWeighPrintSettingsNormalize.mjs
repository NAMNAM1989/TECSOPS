/** Đồng bộ với `src/printing/scscWeigh/scscWeighPrintSettingsCore.ts` */

function clip(s, max) {
  return String(s ?? "").slice(0, max);
}

function clampSenderBlock(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  return {
    senderName: clip(o.senderName, 60).trim(),
    senderPhone: clip(o.senderPhone, 24).trim(),
  };
}

export function defaultScscWeighPrintSettings() {
  const empty = clampSenderBlock({});
  return {
    senders: {
      "TECS-SCSC": { ...empty },
      "KHO-SCSC": { ...empty },
    },
  };
}

export function normalizeScscWeighPrintSettingsLoose(raw) {
  if (!raw || typeof raw !== "object") return defaultScscWeighPrintSettings();
  if ("senderName" in raw || "senderPhone" in raw) {
    const legacy = clampSenderBlock(raw);
    return {
      senders: {
        "TECS-SCSC": { ...legacy },
        "KHO-SCSC": { ...legacy },
      },
    };
  }
  const sendersRaw = raw.senders && typeof raw.senders === "object" ? raw.senders : {};
  return {
    senders: {
      "TECS-SCSC": clampSenderBlock(sendersRaw["TECS-SCSC"]),
      "KHO-SCSC": clampSenderBlock(sendersRaw["KHO-SCSC"]),
    },
  };
}
