import { describe, expect, it } from "vitest";
import { detectReceiptType, formatBytes, MAX_PICK_BYTES, MAX_RECEIPT_BYTES, pickProblem, scaledSize } from "./receipts";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

describe("detectReceiptType", () => {
  it("recognises JPG, PNG, WebP and PDF by their first bytes", () => {
    expect(detectReceiptType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectReceiptType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectReceiptType(new TextEncoder().encode("RIFF\x10\x00\x00\x00WEBPVP8 "))).toBe("image/webp");
    expect(detectReceiptType(new TextEncoder().encode("%PDF-1.7\n"))).toBe("application/pdf");
  });

  it("refuses anything else, whatever its name says", () => {
    expect(detectReceiptType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(detectReceiptType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(detectReceiptType(new TextEncoder().encode("RIFF\x10\x00\x00\x00WAVEfmt "))).toBeNull();
    expect(detectReceiptType(new Uint8Array())).toBeNull();
  });
});

describe("pickProblem", () => {
  it("accepts photos up to 5 MB and PDFs up to 2 MB", () => {
    expect(pickProblem({ type: "image/jpeg", size: MAX_PICK_BYTES })).toBeNull();
    expect(pickProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(pickProblem({ type: "application/pdf", size: MAX_RECEIPT_BYTES })).toBeNull();
  });

  it("explains what's wrong", () => {
    expect(pickProblem({ type: "image/jpeg", size: MAX_PICK_BYTES + 1 })).toBe("A photo can be at most 5 MB.");
    expect(pickProblem({ type: "application/pdf", size: MAX_RECEIPT_BYTES + 1 })).toBe("A PDF can be at most 2 MB.");
    expect(pickProblem({ type: "image/heic", size: 1000 })).toBe("Choose a JPG, PNG or WebP photo, or a PDF.");
    expect(pickProblem({ type: "image/jpeg", size: 0 })).toBe("That file is empty.");
  });
});

describe("scaledSize", () => {
  it("shrinks the longest side to 1600 px and keeps the shape", () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(scaledSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it("never enlarges a small photo", () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("formatBytes", () => {
  it("shows B, KB and MB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(240 * 1024)).toBe("240 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2 MB");
    expect(formatBytes(500 * 1024 * 1024)).toBe("500 MB");
  });
});
