"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { setReceiptsEnabled } from "@/server/services/receipts";

// Site admin actions (DESIGN §3.7 R4). The service checks that the user really is the site admin.

export async function setReceiptsEnabledAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await setReceiptsEnabled(user, formData.get("enabled") === "1");
  refresh();
}
