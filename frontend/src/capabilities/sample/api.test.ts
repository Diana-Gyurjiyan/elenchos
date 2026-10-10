import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CHOICE, loadChoice, saveChoice } from "../settings/modelChoice";
import { CapabilityError } from "../../types";
import { createHttpSample } from "./api";

const lines = (...o: object[]) => new Response(o.map((x) => JSON.stringify(x)).join("\n") + "\n");
afterEach(() => vi.unstubAllGlobals());

describe("http sample adapter", () => {
  it("sends the selected Ollama model and streams text", async () => {
    const fetchMock = vi.fn(async () =>
      lines({ type: "text", text: "a" }, { type: "text", text: "b" }, { type: "done", truncated: false }),
    );
    vi.stubGlobal("fetch", fetchMock);
    let choice = { ...DEFAULT_CHOICE };
    const sample = createHttpSample(() => choice);
    const seen: string[] = [];

    choice = { ...DEFAULT_CHOICE, model: "qwen2.5:14b" };
    const r = await sample("hello", { onText: (u) => seen.push(u.text) });

    expect(r).toEqual({ text: "ab", truncated: false });
    expect(seen).toEqual(["a", "b"]);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ provider: "ollama", model: "qwen2.5:14b", api_key: "" });
  });

  it("surfaces backend error codes with the partial text", async () => {
    vi.stubGlobal("fetch", async () => lines({ type: "text", text: "par" }, { type: "error", code: "ollama_down" }));
    const err = await createHttpSample(() => DEFAULT_CHOICE)("x").catch((e) => e);
    expect(err).toBeInstanceOf(CapabilityError);
    expect(err).toMatchObject({ code: "ollama_down", text: "par" });
  });
});

describe("model choice storage", () => {
  it("defaults to Ollama and round-trips", () => {
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(loadChoice(st)).toEqual(DEFAULT_CHOICE);
    saveChoice({ ...DEFAULT_CHOICE, model: "m" }, st);
    expect(loadChoice(st)).toEqual({ provider: "ollama", model: "m", apiKey: "" });
    st.setItem("argmap.model", "{broken");
    expect(loadChoice(st)).toEqual(DEFAULT_CHOICE);
  });

  it("loads saved provider settings", () => {
    const mem = new Map([["argmap.model", JSON.stringify({ provider: "anthropic", model: "m", apiKey: "secret" })]]);
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(loadChoice(st)).toEqual({ provider: "anthropic", model: "m", apiKey: "secret" });
  });
});
