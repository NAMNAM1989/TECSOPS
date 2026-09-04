import express from "express";
import { applyMutation } from "./stateStore.mjs";

/** Express tối giản cho smoke test HTTP — state in-memory, không Postgres. */
export function createMutationTestApp(initialState) {
  let state = structuredClone(initialState);
  const app = express();
  app.use(express.json());
  app.get("/api/state", (_req, res) => {
    res.json(state);
  });
  app.post("/api/mutation", (req, res) => {
    try {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }
      state = applyMutation(state, body);
      res.json(state);
    } catch (e) {
      res.status(400).json({ error: String(e?.message ?? e) });
    }
  });
  app.post("/api/mutations", (req, res) => {
    try {
      const list = req.body;
      if (!Array.isArray(list) || list.some((m) => !m || typeof m !== "object")) {
        res.status(400).json({ error: "Body phải là mảng mutation" });
        return;
      }
      let next = state;
      for (const m of list) next = applyMutation(next, m);
      state = next;
      res.json(state);
    } catch (e) {
      res.status(400).json({ error: String(e?.message ?? e) });
    }
  });
  return { app, getState: () => state };
}
