/**
 * Chặn mutation nguy hiểm trên production.
 * @param {object} mutation
 */
export function assertMutationAllowed(mutation) {
  const action = String(mutation?.action ?? "").trim();
  if (action === "RESET_TRIAL_DATA" && process.env.NODE_ENV === "production") {
    throw new Error("RESET_TRIAL_DATA bị vô hiệu trên production.");
  }
}
