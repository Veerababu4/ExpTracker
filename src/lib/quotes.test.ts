import { describe, expect, it } from "vitest";
import { QUOTES, quoteForDay } from "./quotes";

describe("quoteForDay", () => {
  it("keeps one quote for the whole day and changes the next day", () => {
    expect(quoteForDay("2026-10-23")).toBe(quoteForDay("2026-10-23"));
    expect(quoteForDay("2026-10-24")).not.toBe(quoteForDay("2026-10-23"));
  });

  it("goes round every quote", () => {
    const seen = new Set(Array.from({ length: QUOTES.length }, (_, i) => quoteForDay(`2026-11-${String(i + 1).padStart(2, "0")}`)));
    expect(seen.size).toBe(QUOTES.length);
  });

  it("works for dates before the start date", () => {
    expect(QUOTES).toContain(quoteForDay("1999-12-25"));
  });
});
