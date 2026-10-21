import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setReceiptsEnabledAction } from "@/actions/admin";
import { buttonClass } from "@/components/button-class";
import { Card } from "@/components/card";
import { formatBytes } from "@/lib/rules/receipts";
import { requireUser } from "@/server/auth/session";
import { isSiteAdmin } from "@/server/auth/site-admin";
import { receiptUsage } from "@/server/services/receipts";

export const metadata: Metadata = { title: "Site admin · Family Expenses" };

// Site admin (DESIGN §3.7 R4): receipt space for the whole site and the receipts on/off switch.
// Everyone else gets "not found", so the page doesn't advertise itself.
export default async function AdminPage() {
  const user = await requireUser();
  if (!isSiteAdmin(user.username)) notFound();
  const usage = await receiptUsage(user);
  const percent = Math.round((usage.usedBytes / usage.capBytes) * 100);
  const full = usage.usedBytes >= usage.capBytes;
  const barColour = percent >= 100 ? "bg-red-600" : percent >= 80 ? "bg-amber-500" : "bg-teal-600";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Site admin</h1>
        <p className="text-sm text-zinc-600">Settings for the whole site — every family.</p>
      </div>

      <Card title="Receipts" id="receipts" note={`All families share ${formatBytes(usage.capBytes)} for receipt photos and PDFs.`}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p data-testid="receipts-state">
              New receipts are <strong>{usage.enabled ? "on" : "off"}</strong>.
            </p>
            <form action={setReceiptsEnabledAction}>
              <input type="hidden" name="enabled" value={usage.enabled ? "0" : "1"} />
              <button type="submit" className={buttonClass(usage.enabled ? "plain" : "primary", "md")}>
                {usage.enabled ? "Turn receipts off" : "Turn receipts on"}
              </button>
            </form>
          </div>
          <p className="text-sm text-zinc-600">
            While off, nobody can add or replace a receipt. Saved receipts can still be opened and removed.
          </p>

          <div className="flex flex-col gap-1.5">
            <p className="flex justify-between text-sm">
              <span>
                Used: <strong data-testid="receipts-used">{formatBytes(usage.usedBytes)}</strong> of {formatBytes(usage.capBytes)} (
                {percent}%)
              </span>
              <span className="text-zinc-500">
                {usage.count} {usage.count === 1 ? "receipt" : "receipts"}
              </span>
            </p>
            <div aria-hidden className="h-2.5 overflow-hidden rounded-full bg-zinc-200">
              <div className={`h-full ${barColour}`} style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
            {full && (
              <p className="text-sm font-medium text-red-700">
                Full — new receipts are refused until some are removed (deleting an expense removes its receipt too).
              </p>
            )}
          </div>

          <p className="text-sm text-zinc-600">
            Whole database: <strong>{formatBytes(usage.databaseBytes)}</strong> (expenses, accounts and receipts together —
            compare with the hosting plan&apos;s storage limit).
          </p>
        </div>
      </Card>

      <Card title="Receipt space by family" id="families" note="Sizes only; receipts themselves are visible only to their family.">
        {usage.byFamily.length === 0 ? (
          <p className="text-sm text-zinc-500">No receipts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="py-2 font-medium">Family</th>
                <th className="py-2 text-right font-medium">Receipts</th>
                <th className="py-2 text-right font-medium">Space</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {usage.byFamily.map((f) => (
                <tr key={f.familyId}>
                  <td className="max-w-0 truncate py-2 pr-3">{f.familyName}</td>
                  <td className="py-2 text-right tabular-nums">{f.count}</td>
                  <td className="py-2 text-right tabular-nums">{formatBytes(f.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
