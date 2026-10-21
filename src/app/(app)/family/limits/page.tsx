import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { formatRupees } from "@/lib/money";
import { DEFAULT_LIMITS } from "@/lib/rules/alerts";
import { requireFamily } from "@/server/auth/family";
import { allMemberLimits, limitsFor } from "@/server/services/alert-limits";
import { LimitsForm } from "./limits-form";

export const metadata: Metadata = { title: "Alert limits · Family Expenses" };

const defaults = `${formatRupees(DEFAULT_LIMITS.highPaise)} and ${formatRupees(DEFAULT_LIMITS.veryHighPaise)}`;

export default async function LimitsPage() {
  const { user, family } = await requireFamily();
  const back = (
    <Link href="/family" className="text-sm font-medium text-teal-700 hover:underline">
      ← Back to family
    </Link>
  );
  const intro = (
    <p className="text-sm text-zinc-600">
      When an amount is above the <strong>high-value limit</strong>, red text appears under the amount. Above the{" "}
      <strong>very-high limit</strong> it&apos;s bold and blinks. They only warn — saving is never blocked. Defaults:{" "}
      {defaults}.
    </p>
  );

  if (family.role !== "HEAD") {
    const mine = await limitsFor(user.id, family.familyId);
    return (
      <section className="flex flex-col gap-4">
        {back}
        <h1 className="text-2xl font-semibold">Your alert limits</h1>
        {intro}
        <Card title={`In ${family.familyName}`} id="mine">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">High-value</dt>
            <dd className="font-medium tabular-nums">above {formatRupees(mine.highPaise)}</dd>
            <dt className="text-zinc-500">Very high</dt>
            <dd className="font-medium tabular-nums">above {formatRupees(mine.veryHighPaise)}</dd>
          </dl>
          <p className="mt-3 text-xs text-zinc-500">Only the family head can change these.</p>
        </Card>
      </section>
    );
  }

  const members = await allMemberLimits(user.id, family.familyId);
  return (
    <div className="flex flex-col gap-6">
      {back}
      <div>
        <h1 className="text-2xl font-semibold">Alert limits</h1>
        {intro}
      </div>
      {members.map((m) => (
        <Card
          key={m.userId}
          id={`limits-${m.userId}`}
          title={`${m.displayName}${m.userId === user.id ? " (you)" : ""}`}
          note={m.custom ? "Custom limits" : "Default limits"}
        >
          <LimitsForm
            familyId={family.familyId}
            memberId={m.userId}
            memberName={m.displayName}
            highPaise={m.limits.highPaise}
            veryHighPaise={m.limits.veryHighPaise}
            custom={m.custom}
          />
        </Card>
      ))}
    </div>
  );
}
