import { describe, expect, it } from "vitest";
import { safeCell, toCsv } from "./csv";

describe("safeCell", () => {
  it("turns anything a spreadsheet would run as a formula into text", () => {
    expect(safeCell("=HYPERLINK(\"http://evil\")")).toBe("'=HYPERLINK(\"http://evil\")");
    expect(safeCell("+91 98480 22338")).toBe("'+91 98480 22338");
    expect(safeCell("-5 discount")).toBe("'-5 discount");
    expect(safeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(safeCell("\t=1+1")).toBe("'\t=1+1");
    expect(safeCell("\r=1+1")).toBe("'\r=1+1");
  });

  it("leaves ordinary text and amounts alone", () => {
    expect(safeCell("Groceries")).toBe("Groceries");
    expect(safeCell("2500.50")).toBe("2500.50");
    expect(safeCell("a=b")).toBe("a=b");
    expect(safeCell("")).toBe("");
  });
});

describe("toCsv", () => {
  it("starts with the UTF-8 byte-order mark and uses Windows line endings", () => {
    const csv = toCsv([["Date", "Amount"], ["2026-10-01", "2500.50"]]);
    expect(csv).toBe("﻿Date,Amount\r\n2026-10-01,2500.50\r\n");
  });

  it("quotes cells with commas, quotes or line breaks and doubles the quotes", () => {
    const csv = toCsv([["Milk, bread", 'Said "thanks"', "two\nlines", "₹ and తెలుగు"]]);
    expect(csv).toBe('﻿"Milk, bread","Said ""thanks""","two\nlines",₹ and తెలుగు\r\n');
  });

  it("escapes formulas before quoting", () => {
    expect(toCsv([["=1+1,2"]])).toBe("﻿\"'=1+1,2\"\r\n");
  });
});
