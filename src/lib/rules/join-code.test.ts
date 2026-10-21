import { describe, expect, it } from "vitest";
import { password } from "@/lib/validation/auth";
import { joinCodeSchema } from "@/lib/validation/family";
import { suggestTempPassword } from "@/lib/temp-password";
import { formatJoinCode, isJoinCode, JOIN_CODE_ALPHABET, normalizeJoinCode } from "./join-code";

describe("join codes", () => {
  it("accepts any reasonable way of typing the code", () => {
    expect(normalizeJoinCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(normalizeJoinCode("ABCD 2345")).toBe("ABCD2345");
    expect(formatJoinCode("ABCD2345")).toBe("ABCD-2345");
  });

  it("has no look-alike characters", () => {
    for (const c of "0O1IL") expect(JOIN_CODE_ALPHABET).not.toContain(c);
    expect(isJoinCode("ABCD2345")).toBe(true);
    expect(isJoinCode("ABCD0345")).toBe(false); // zero
    expect(isJoinCode("ABCD234")).toBe(false);
  });

  it("form schema normalises and explains a bad code", () => {
    expect(joinCodeSchema.safeParse({ code: "abcd-2345" }).data).toEqual({ code: "ABCD2345" });
    const bad = joinCodeSchema.safeParse({ code: "hello" });
    expect(bad.success).toBe(false);
  });
});

describe("suggested temporary passwords", () => {
  it("always pass the password rules", () => {
    for (let i = 0; i < 50; i++) expect(password.safeParse(suggestTempPassword()).success).toBe(true);
  });
});
