import { describe, expect, it } from "vitest";
import { ndjson } from "./ndjson";

function streamOf(...chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((x) => c.enqueue(enc.encode(x)));
      c.close();
    },
  });
}

describe("ndjson", () => {
  it("joins lines split across chunks and keeps unicode intact", async () => {
    const out: unknown[] = [];
    for await (const o of ndjson(streamOf('{"a":1}\n{"b":"¬', '∧"}\n', '{"c":3}'))) out.push(o);
    expect(out).toEqual([{ a: 1 }, { b: "¬∧" }, { c: 3 }]);
  });
});
