import { useCallback, useState } from "react";
import { credFetch } from "../apiFetch";
import type { WeighSlipDraft, WeighSlipRecord } from "../types/weighSlip";
import type { ScaleTicketFormData } from "../utils/mapBookingToScaleTicketFormData";

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(typeof data === "object" && data && "error" in data ? String(data.error) : res.statusText);
  }
  return data;
}

export function useWeighSlips() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useCallback(async (params?: { status?: string; q?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.q) qs.set("q", params.q);
      const res = await fetch(`/api/weigh-slips?${qs}`, { ...credFetch, cache: "no-store" });
      const data = await parseJson<{ items: WeighSlipRecord[] }>(res);
      return data.items;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const getById = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/weigh-slips/${encodeURIComponent(id)}`, { ...credFetch });
      return await parseJson<WeighSlipRecord>(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(
    async (draft: WeighSlipDraft, opts?: { status?: "draft" | "final"; printFormSnapshot?: ScaleTicketFormData }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/weigh-slips", {
          ...credFetch,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...draft,
            status: opts?.status ?? "draft",
            printFormSnapshot: opts?.printFormSnapshot,
          }),
        });
        return await parseJson<WeighSlipRecord>(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const update = useCallback(
    async (
      id: string,
      draft: Partial<WeighSlipDraft> & { status?: "draft" | "final" | "archived" },
      opts?: { printFormSnapshot?: ScaleTicketFormData }
    ) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/weigh-slips/${encodeURIComponent(id)}`, {
          ...credFetch,
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...draft, printFormSnapshot: opts?.printFormSnapshot }),
        });
        return await parseJson<WeighSlipRecord>(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const duplicate = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/weigh-slips/${encodeURIComponent(id)}/duplicate`, {
        ...credFetch,
        method: "POST",
      });
      return await parseJson<WeighSlipRecord>(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, list, getById, create, update, duplicate };
}
