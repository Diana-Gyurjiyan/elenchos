import { afterEach, describe, expect, it, vi } from "vitest";
import { httpLogic } from "./http";

afterEach(() => vi.unstubAllGlobals());

describe("backend logic adapter", () => {
  it("sends the Logic Lab request to the backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, status: "valid" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await httpLogic.checkArgument(["P → Q", "P"], "Q", { mode: "fol", maxSize: 5 });

    expect(fetchMock).toHaveBeenCalledWith("/api/logic/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premises: ["P → Q", "P"], conclusion: "Q", mode: "fol", maxSize: 5 }),
    });
  });

  it("surfaces backend failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));

    await expect(httpLogic.checkArgument(["P"], "Q")).rejects.toThrow("HTTP 503");
  });
});
