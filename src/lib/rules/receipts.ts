// Receipt rules (DESIGN §3.7). Shared by the browser (checks before upload) and the server (checks again).

export type ReceiptType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const MB = 1024 * 1024;

/** Largest file a person may pick; photos are shrunk before upload, so they can start bigger. */
export const MAX_PICK_BYTES = 5 * MB;
/** Largest file the server stores (a shrunk photo is usually 150–400 KB; PDFs are stored as picked). */
export const MAX_RECEIPT_BYTES = 2 * MB;
/** All receipts of all families together may use at most this much of the database. */
export const RECEIPTS_CAP_BYTES = 500 * MB;
/** Photos are scaled so the longest side is at most this many pixels. */
export const MAX_PHOTO_SIDE = 1600;
export const PHOTO_QUALITY = 0.8;

export const RECEIPT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** The real type of a file, read from its first bytes (the name and the browser's label can lie). */
export function detectReceiptType(bytes: Uint8Array): ReceiptType | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  // RIFF....WEBP
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  return null;
}

/** What's wrong with a picked file before shrinking (browser side), or null. */
export function pickProblem(file: { type: string; size: number }): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.type === "application/pdf") {
    return file.size > MAX_RECEIPT_BYTES ? "A PDF can be at most 2 MB." : null;
  }
  if (!PHOTO_TYPES.has(file.type)) return "Choose a JPG, PNG or WebP photo, or a PDF.";
  return file.size > MAX_PICK_BYTES ? "A photo can be at most 5 MB." : null;
}

export function isPhoto(type: string): boolean {
  return PHOTO_TYPES.has(type);
}

/** Width and height after shrinking so the longest side fits `maxSide` (never enlarged). */
export function scaledSize(width: number, height: number, maxSide = MAX_PHOTO_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** 245760 → "240 KB", 1572864 → "1.5 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / MB;
  return `${mb < 10 ? mb.toFixed(1).replace(/\.0$/, "") : Math.round(mb)} MB`;
}

/** File extension for downloads. */
export function receiptExtension(type: ReceiptType): string {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[type];
}
