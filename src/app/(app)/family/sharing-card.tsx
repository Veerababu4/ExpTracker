import { setSharingAction } from "@/actions/family";
import { ConfirmButton } from "@/components/actions";
import { Card } from "@/components/card";
import { formatMonth } from "@/lib/format";
import { formatRupees } from "@/lib/money";
import { monthOf, todayInIndia } from "@/lib/rules/dates";
import { personalBookId, sharingFor, wouldMove } from "@/server/services/books";
import type { Membership } from "@/server/services/families";

/**
 * "Your expenses" (DESIGN §3.8 P2): where my expenses go this month, and the switch. On a family page it offers
 * that family only; on My expenses every family. A switch takes effect from this month and moves this month's
 * expenses, so the confirmation says how many move.
 */
export async function SharingCard({ userId, families, only }: { userId: string; families: Membership[]; only?: string }) {
  const today = todayInIndia();
  const month = formatMonth(monthOf(today));
  const sharing = await sharingFor(userId, monthOf(today));
  const current = families.find((f) => f.familyId === sharing.familyId) ?? null;
  const shown = only ? families.filter((f) => f.familyId === only) : families;
  const personal = await personalBookId(userId);

  const moveText = async (targetId: string) => {
    const m = await wouldMove(userId, targetId, today);
    return m.moved === 0
      ? "Nothing to move yet this month."
      : `${m.moved === 1 ? "1 expense" : `${m.moved} expenses`} (${formatRupees(m.paise)}) from ${month} ${m.moved === 1 ? "moves" : "move"} too.`;
  };

  const buttons = await Promise.all(
    shown.map(async (f) => {
      const on = f.familyId === current?.familyId;
      return on ? (
        <ConfirmButton
          key={f.familyId}
          action={setSharingAction}
          fields={{ familyId: "personal" }}
          label={`Stop including my expenses in ${f.familyName}`}
          question={`From ${month} only you see your expenses. ${await moveText(personal)}`}
          confirmLabel="Yes, personal only"
          tone="primary"
        />
      ) : (
        <ConfirmButton
          key={f.familyId}
          action={setSharingAction}
          fields={{ familyId: f.familyId }}
          label={`Include my expenses in ${f.familyName}`}
          question={`From ${month} ${f.familyName} sees your expenses${current ? ` (instead of ${current.familyName})` : ""}. ${await moveText(f.familyId)}`}
          confirmLabel="Yes, include them"
          tone="primary"
        />
      );
    }),
  );

  return (
    <Card
      title="Your expenses"
      id="sharing"
      note="Each month your expenses are either personal only or in one family. A change starts this month; earlier months stay as they were."
    >
      <p data-testid="sharing-status" className="text-sm">
        {current ? (
          <>
            In {month} your expenses go to <strong>{current.familyName}</strong>
            {sharing.since && ` (since ${formatMonth(sharing.since)})`}.
          </>
        ) : (
          <>
            In {month} your expenses are <strong>personal only</strong> — no family sees them.
          </>
        )}
      </p>
      {buttons.length > 0 && <div className="mt-3 flex flex-col items-start gap-2">{buttons}</div>}
    </Card>
  );
}
