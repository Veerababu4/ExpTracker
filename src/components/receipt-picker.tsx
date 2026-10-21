"use client";

import { useCallback, useId, useState, useSyncExternalStore } from "react";
import { buttonClass } from "@/components/button-class";
import {
  formatBytes,
  isPhoto,
  MAX_RECEIPT_BYTES,
  PHOTO_QUALITY,
  pickProblem,
  RECEIPT_ACCEPT,
  scaledSize,
} from "@/lib/rules/receipts";

// Receipt field (DESIGN §3.7 R1). Photos are shrunk here in the browser (longest side 1600 px, JPEG), so a
// 4 MB phone photo uploads as ~300 KB. The parent keeps the prepared file and adds it to the form data on
// submit — React clears file inputs after every submit, but the picked receipt should survive an error.

export type PickedReceipt = { file: File; originalName: string };

export function ReceiptPicker({
  value,
  onChange,
  errors,
  label = "Receipt",
  optional = true,
}: {
  value: PickedReceipt | null;
  onChange: (picked: PickedReceipt | null) => void;
  errors?: string[];
  label?: string;
  optional?: boolean;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ready = useHydrated();
  const error = problem ?? errors?.[0];

  async function pick(input: HTMLInputElement) {
    const original = input.files?.[0];
    input.value = ""; // picking the same file again should still work
    if (!original) return;
    const tooBig = pickProblem(original);
    if (tooBig) {
      setProblem(tooBig);
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      const file = isPhoto(original.type) ? await shrinkPhoto(original) : original;
      onChange({ file, originalName: original.name });
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : "This photo couldn't be read. Try another one.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-800">
        {label}
        {optional && <span className="ml-1 font-normal text-zinc-500">(optional)</span>}
      </span>
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2" data-testid="picked-receipt">
          {isPhoto(value.file.type) ? (
            <PhotoPreview file={value.file} />
          ) : (
            <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded bg-white text-xs font-semibold text-zinc-600">
              PDF
            </span>
          )}
          <p className="min-w-0 flex-1 text-sm">
            <span className="block truncate font-medium">{value.originalName}</span>
            <span className="text-zinc-500">
              {formatBytes(value.file.size)}
              {isPhoto(value.file.type) && " · made smaller for upload"}
            </span>
          </p>
          <button type="button" className={buttonClass("plain")} onClick={() => onChange(null)}>
            Remove<span className="sr-only"> picked receipt</span>
          </button>
        </div>
      ) : (
        <label
          className={`${buttonClass("plain", "md")} w-fit cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600`}
        >
          {busy ? "Preparing photo…" : "Attach photo or PDF"}
          <input
            id={id}
            type="file"
            accept={RECEIPT_ACCEPT}
            className="sr-only"
            disabled={busy || !ready}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-${error ? "error" : "hint"}`}
            onChange={(e) => void pick(e.currentTarget)}
          />
        </label>
      )}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-zinc-500">
          Photo (JPG, PNG, WebP) up to 5 MB — made smaller before upload — or a PDF up to 2 MB.
        </p>
      )}
    </div>
  );
}

const noSubscription = () => () => {};

/**
 * False in the server HTML, true once React runs in the browser. A file picked before that would be lost
 * (nothing listens to the input yet), so the picker stays disabled until then.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

/** Thumbnail of the picked photo. Its blob: URL lives exactly as long as the <img> shows this file. */
function PhotoPreview({ file }: { file: File }) {
  const attach = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return;
      const url = URL.createObjectURL(file);
      img.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [file],
  );
  // eslint-disable-next-line @next/next/no-img-element -- a local preview (blob: URL), nothing to optimise
  return <img ref={attach} alt="" className="size-12 shrink-0 rounded object-cover" />;
}

/** Longest side 1600 px, JPEG. Transparent parts (PNG) become white. Phone photos keep their rotation. */
async function shrinkPhoto(original: File): Promise<File> {
  const bitmap = await createImageBitmap(original).catch(() => {
    throw new Error("This photo couldn't be read. Try a JPG or PNG.");
  });
  const { width, height } = scaledSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare photos. Try another browser.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [PHOTO_QUALITY, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_RECEIPT_BYTES) {
      return new File([blob], `${original.name.replace(/\.[^.]*$/, "") || "receipt"}.jpg`, { type: "image/jpeg" });
    }
  }
  throw new Error("This photo is still too big after shrinking. Try another one.");
}
