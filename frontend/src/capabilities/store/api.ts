import type { Collection, Doc, ListOptions, StorePort } from "../../types";

function collection(name: string): Collection {
  const base = `/api/store/${encodeURIComponent(name)}`;
  return {
    async list({ orderBy, desc = true, limit = 30 }: ListOptions = {}) {
      const q = new URLSearchParams({ desc: String(desc), limit: String(limit) });
      if (orderBy) q.set("order_by", orderBy);
      const res = await fetch(`${base}?${q}`);
      if (!res.ok) throw new Error("store.list failed");
      return (await res.json()) as Doc[];
    },
    async get(id) {
      const res = await fetch(`${base}/${encodeURIComponent(id)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("store.get failed");
      return (await res.json()) as Doc;
    },
    async set(id, doc) {
      const res = await fetch(`${base}/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc),
      });
      if (!res.ok) throw new Error("store.set failed");
    },
    async delete(id) {
      const res = await fetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("store.delete failed");
    },
  };
}

export const httpStore: StorePort = { collection };
