export interface ParsedObjects {
  objects: Record<string, unknown>[];
  end: number;
}

/** Extract complete top-level JSON objects while leaving a trailing partial object for the next chunk. */
export function extractJsonObjects(text: string, from = 0): ParsedObjects {
  const objects: Record<string, unknown>[] = [];
  let cursor = from;
  while (cursor < text.length) {
    const start = text.indexOf("{", cursor);
    if (start < 0) return { objects, end: text.length };
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = start;
    let complete = false;
    for (; end < text.length; end += 1) {
      const char = text[end];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          complete = true;
          break;
        }
      }
    }
    if (!complete) return { objects, end: start };
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        objects.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Malformed complete JSON objects are skipped; following objects remain parseable.
    }
    cursor = end + 1;
  }
  return { objects, end: cursor };
}
