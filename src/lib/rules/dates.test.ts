import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  editWindow,
  firstOfMonth,
  isInWindow,
  isIsoDate,
  todayInIndia,
  addMonths,
  isIsoMonth,
  monthOf,
  monthRange,
  rangeDays,
} from "./dates";

describe("todayInIndia", () => {
  it("uses India time, not UTC", () => {
    // 20:00 UTC on 21 Oct = 01:30 IST on 22 Oct
    expect(todayInIndia(new Date("2026-10-21T20:00:00Z"))).toBe("2026-10-22");
    // 18:29 UTC = 23:59 IST, still the same day
    expect(todayInIndia(new Date("2026-10-21T18:29:00Z"))).toBe("2026-10-21");
  });
});

describe("isIsoDate", () => {
  it.each(["2026-10-21", "2024-02-29", "2000-01-01"])("accepts %s", (d) => {
    expect(isIsoDate(d)).toBe(true);
  });
  it.each(["2026-02-29", "2026-13-01", "2026-10-32", "21-10-2026", "2026-1-5", ""])("rejects %s", (d) => {
    expect(isIsoDate(d)).toBe(false);
  });
});

describe("date arithmetic", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-11-03", -6)).toBe("2026-10-28");
    expect(addDays("2027-01-02", -6)).toBe("2026-12-27");
    expect(firstOfMonth("2026-10-21")).toBe("2026-10-01");
    expect(firstOfMonth("2027-01-15", -2)).toBe("2026-11-01");
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
  });
});

describe("editWindow", () => {
  it("member mid-month: whole current month", () => {
    expect(editWindow("MEMBER", "2026-10-21")).toEqual({ from: "2026-10-01", to: "2026-10-21" });
  });

  it("member early in the month: last 7 days reach into the previous month", () => {
    expect(editWindow("MEMBER", "2026-11-03")).toEqual({ from: "2026-10-28", to: "2026-11-03" });
    expect(editWindow("MEMBER", "2027-01-01")).toEqual({ from: "2026-12-26", to: "2027-01-01" });
  });

  it("member on the 7th: both rules give the 1st", () => {
    expect(editWindow("MEMBER", "2026-10-07")).toEqual({ from: "2026-10-01", to: "2026-10-07" });
  });

  it("head: current month and two before, across a year boundary", () => {
    expect(editWindow("HEAD", "2026-10-21")).toEqual({ from: "2026-08-01", to: "2026-10-21" });
    expect(editWindow("HEAD", "2027-01-31")).toEqual({ from: "2026-11-01", to: "2027-01-31" });
  });

  it("window excludes future dates and dates before the start", () => {
    const w = editWindow("MEMBER", "2026-10-21");
    expect(isInWindow("2026-10-01", w)).toBe(true);
    expect(isInWindow("2026-10-21", w)).toBe(true);
    expect(isInWindow("2026-09-30", w)).toBe(false);
    expect(isInWindow("2026-10-22", w)).toBe(false);
  });
});

describe("months", () => {
  it("recognises YYYY-MM", () => {
    expect(isIsoMonth("2026-10")).toBe(true);
    expect(isIsoMonth("2026-13")).toBe(false);
    expect(isIsoMonth("2026-1")).toBe(false);
    expect(isIsoMonth("2026-10-01")).toBe(false);
  });

  it("moves across year boundaries", () => {
    expect(monthOf("2026-10-21")).toBe("2026-10");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("knows the last day of each month, leap years included", () => {
    expect(monthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthRange("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("counts both ends of a range", () => {
    expect(rangeDays({ from: "2026-10-21", to: "2026-10-21" })).toBe(1);
    expect(rangeDays({ from: "2024-01-01", to: "2024-12-31" })).toBe(366);
  });
});
