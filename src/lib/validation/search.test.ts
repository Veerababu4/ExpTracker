import * as z from "zod";
import { describe, expect, it } from "vitest";
import { NO_CATEGORY, pageNumber, searchSchema } from "./search";

const TODAY = "2026-10-21";
const form = (over: Record<string, string> = {}) => ({ from: "2026-10-01", to: TODAY, member: "", category: "", mode: "", ...over });

function errorsOf(values: Record<string, string>) {
  const r = searchSchema(TODAY).safeParse(values);
  return r.success ? {} : z.flattenError(r.error).fieldErrors;
}

describe("searchSchema", () => {
  it("accepts a range with no other filters", () => {
    expect(searchSchema(TODAY).parse(form())).toEqual({
      from: "2026-10-01",
      to: TODAY,
      memberId: undefined,
      category: undefined,
      mode: undefined,
    });
  });

  it("passes the optional filters through", () => {
    const id = "6f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
    expect(searchSchema(TODAY).parse(form({ member: id, category: NO_CATEGORY, mode: "UPI" }))).toMatchObject({
      memberId: id,
      category: "none",
      mode: "UPI",
    });
  });

  it("needs both dates", () => {
    expect(errorsOf(form({ from: "", to: "" }))).toEqual({ from: ["Choose the From date."], to: ["Choose the To date."] });
    expect(errorsOf(form({ from: "2026-02-30" }))).toEqual({ from: ["Choose a valid date."] });
  });

  it("From must not be after To", () => {
    expect(errorsOf(form({ from: "2026-10-10", to: "2026-10-09" }))).toEqual({ to: ["To must be on or after From."] });
    expect(errorsOf(form({ from: "2026-10-09", to: "2026-10-09" }))).toEqual({}); // one day is fine
  });

  it("To can't be in the future", () => {
    expect(errorsOf(form({ to: "2026-10-22" }))).toEqual({ to: ["To can't be after today."] });
  });

  it("at most one year (366 days, both ends counted)", () => {
    expect(errorsOf(form({ from: "2025-10-21", to: TODAY }))).toEqual({}); // 366 days
    expect(errorsOf(form({ from: "2025-10-20", to: TODAY }))).toEqual({ to: ["Search at most one year (366 days) at a time."] });
  });

  it("dates start from 1 Jan 2000", () => {
    expect(errorsOf(form({ from: "1999-12-31", to: "2000-01-10" }))).toEqual({ from: ["Dates start from 1 Jan 2000."] });
  });

  it("refuses tampered filter values", () => {
    expect(errorsOf(form({ member: "ravi", category: "x", mode: "BITCOIN" }))).toEqual({
      member: ["Choose a member from the list."],
      category: ["Choose a category from the list."],
      mode: ["Choose a payment mode from the list."],
    });
  });
});

describe("pageNumber", () => {
  it("reads positive whole numbers, else 1", () => {
    expect(pageNumber("3")).toBe(3);
    expect(pageNumber(undefined)).toBe(1);
    expect(pageNumber("0")).toBe(1);
    expect(pageNumber("-2")).toBe(1);
    expect(pageNumber("2.5")).toBe(1);
    expect(pageNumber("abc")).toBe(1);
  });
});
