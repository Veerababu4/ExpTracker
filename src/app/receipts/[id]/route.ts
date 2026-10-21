import type { NextRequest } from "next/server";
import { isPhoto, receiptExtension } from "@/lib/rules/receipts";
import { uuidSchema } from "@/lib/validation/family";
import { getCurrentUser } from "@/server/auth/session";
import { receiptFile } from "@/server/services/receipts";

// GET /receipts/[id] — the receipt file, only for logged-in members of that family (DESIGN §3.7 R2).
// Anyone else gets the same "not found", so the address doesn't reveal whether a receipt exists.
export async function GET(_request: NextRequest, ctx: RouteContext<"/receipts/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Please log in to see this receipt.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const file = uuidSchema.safeParse(id).success && !user.mustChangePassword ? await receiptFile(user.id, id) : null;
  if (!file) return new Response("Receipt not found.", { status: 404, headers: { "Cache-Control": "no-store" } });

  const headers: Record<string, string> = {
    "Content-Type": file.contentType,
    "Content-Length": String(file.data.length),
    "Content-Disposition": `inline; filename="receipt-${file.expenseDate}.${receiptExtension(file.contentType)}"`,
    // Private to this browser and never stored: a removed member must not keep seeing it from a cache.
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  // Opened on its own, a photo can't run anything. (PDFs are left alone: the sandbox would block the browser's
  // PDF viewer, and the file type was checked from its bytes on upload.)
  if (isPhoto(file.contentType)) headers["Content-Security-Policy"] = "sandbox";
  return new Response(new Uint8Array(file.data), { headers });
}
