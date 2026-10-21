import { describe, expect, it } from "vitest";
import * as z from "zod";
import { normalizeAnswer } from "@/lib/security-questions";
import { changePasswordSchema, normalizeMobile, registerSchema } from "./auth";

const validRegistration = {
  username: "  Ravi.Kumar ",
  displayName: "  Ravi   Kumar ",
  newPassword: "secret123",
  confirmPassword: "secret123",
  mobile: "",
  email: "",
  question1: "first_school",
  answer1: "  ZP  High School ",
  question2: "first_pet",
  answer2: "Tommy",
};

function errorsOf(result: z.ZodSafeParseResult<unknown>): Record<string, string[] | undefined> {
  return result.success ? {} : z.flattenError(result.error).fieldErrors;
}

describe("registerSchema", () => {
  it("cleans up a valid registration", () => {
    const r = registerSchema.safeParse(validRegistration);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.username).toBe("ravi.kumar");
    expect(r.data.displayName).toBe("Ravi Kumar");
    expect(r.data.answer1).toBe("zp high school");
    expect(r.data.mobile).toBeUndefined();
    expect(r.data.email).toBeUndefined();
  });

  it.each([
    ["abc", "at least 4"],
    ["1ravi", "starting with a letter"],
    ["ravi kumar", "starting with a letter"],
    ["a".repeat(31), "at most 30"],
  ])("rejects username %j", (username, message) => {
    const errors = errorsOf(registerSchema.safeParse({ ...validRegistration, username }));
    expect(errors.username?.join(" ")).toContain(message);
  });

  it("checks password strength, confirmation and username reuse", () => {
    expect(errorsOf(registerSchema.safeParse({ ...validRegistration, newPassword: "short1", confirmPassword: "short1" })).newPassword).toBeDefined();
    expect(errorsOf(registerSchema.safeParse({ ...validRegistration, newPassword: "onlyletters", confirmPassword: "onlyletters" })).newPassword).toEqual(["Password needs at least one digit."]);
    expect(errorsOf(registerSchema.safeParse({ ...validRegistration, confirmPassword: "different1" })).confirmPassword).toEqual(["Passwords don't match."]);
    expect(
      errorsOf(registerSchema.safeParse({ ...validRegistration, username: "ravi1234", newPassword: "RAVI1234", confirmPassword: "RAVI1234" })).newPassword,
    ).toEqual(["Password can't be the same as the username."]);
  });

  it("reports every problem at once, not just the first field", () => {
    const errors = errorsOf(
      registerSchema.safeParse({ ...validRegistration, username: "ab", confirmPassword: "different1", question2: "first_school" }),
    );
    expect(errors.username).toBeDefined();
    expect(errors.confirmPassword).toEqual(["Passwords don't match."]);
    expect(errors.question2).toEqual(["Choose two different questions."]);
  });

  it("requires two different questions", () => {
    const errors = errorsOf(registerSchema.safeParse({ ...validRegistration, question2: "first_school" }));
    expect(errors.question2).toEqual(["Choose two different questions."]);
    expect(errorsOf(registerSchema.safeParse({ ...validRegistration, question1: "made_up" })).question1).toEqual(["Choose a question."]);
  });

  it("validates optional mobile and email only when given", () => {
    const r = registerSchema.safeParse({ ...validRegistration, mobile: "+91 98480 12345", email: " Ravi@Example.com " });
    expect(r.success && r.data.mobile).toBe("9848012345");
    expect(r.success && r.data.email).toBe("ravi@example.com");
    expect(errorsOf(registerSchema.safeParse({ ...validRegistration, mobile: "12345" })).mobile).toBeDefined();
    expect(errorsOf(registerSchema.safeParse({ ...validRegistration, email: "not-an-email" })).email).toBeDefined();
  });
});

describe("normalizeMobile", () => {
  it.each([
    ["9848012345", "9848012345"],
    ["+91 98480-12345", "9848012345"],
    ["919848012345", "9848012345"],
    ["09848012345", "9848012345"],
    ["5848012345", null],
    ["98480", null],
  ])("%s → %s", (input, expected) => {
    expect(normalizeMobile(input)).toBe(expected);
  });
});

describe("other schemas", () => {
  it("answers ignore case and extra spaces", () => {
    expect(normalizeAnswer("  Tommy   Dog ")).toBe(normalizeAnswer("tommy dog"));
  });

  it("change password can't reuse the username", () => {
    const r = changePasswordSchema("ravi1234").safeParse({ currentPassword: "x", newPassword: "ravi1234", confirmPassword: "ravi1234" });
    expect(errorsOf(r).newPassword).toEqual(["Password can't be the same as the username."]);
  });
});
