import type { Metadata } from "next";
import Link from "next/link";
import { cancelJoinRequestAction, switchFamilyAction } from "@/actions/family";
import { ActionButton } from "@/components/actions";
import { Card } from "@/components/card";
import { buttonClass } from "@/components/button-class";
import { formatDate, formatMonth } from "@/lib/format";
import { monthOf, todayInIndia } from "@/lib/rules/dates";
import { getFamilyContext } from "@/server/auth/family";
import { myJoinRequests } from "@/server/services/families";
import { CreateFamilyForm, JoinFamilyForm } from "./welcome-forms";

export const metadata: Metadata = { title: "Families · Family Expenses" };

const statusStyle = {
  PENDING: "bg-amber-100 text-amber-900",
  APPROVED: "bg-teal-100 text-teal-900",
  REJECTED: "bg-red-100 text-red-900",
  CANCELLED: "bg-zinc-100 text-zinc-700",
} as const;

const statusText = { PENDING: "Waiting for approval", APPROVED: "Approved", REJECTED: "Not approved", CANCELLED: "Cancelled" };

export default async function WelcomePage() {
  const { user, families, family } = await getFamilyContext();
  const requests = await myJoinRequests(user.id);
  const month = formatMonth(monthOf(todayInIndia()));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {families.length ? "Your families" : `Welcome, ${user.displayName}`}
        </h1>
        <p className="text-sm text-zinc-600">
          {families.length
            ? "Switch family, start another one, or join one with a family code."
            : "Your own book, My expenses, is ready — only you can see it. To share expenses with your household, create a family or join one."}
        </p>
      </div>

      {families.length === 0 && (
        <p>
          <Link href="/" className={buttonClass("primary", "md")}>
            Start adding my expenses →
          </Link>
        </p>
      )}

      {families.length > 0 && (
        <Card title="Families you belong to" id="mine">
          <ul className="divide-y divide-zinc-100">
            {families.map((f) => (
              <li key={f.familyId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="font-medium">{f.familyName}</p>
                  <p className="text-xs text-zinc-500">
                    {f.role === "HEAD" ? "Family head" : "Member"} · joined {formatDate(f.joinedAt)}
                  </p>
                </div>
                {f.familyId === family?.familyId ? (
                  <span className="text-sm font-medium text-teal-800">Current</span>
                ) : (
                  <ActionButton action={switchFamilyAction} fields={{ familyId: f.familyId }}>
                    Open
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Start a new family" note="You'll be the family head. You can hand that role to someone else later." id="create">
          <CreateFamilyForm month={month} />
        </Card>
        <Card title="Join a family" note="Ask your family head for the 8-character family code." id="join">
          <JoinFamilyForm month={month} />
        </Card>
      </div>

      {requests.length > 0 && (
        <Card title="Your join requests" id="requests">
          <ul className="divide-y divide-zinc-100">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="font-medium">{r.familyName}</p>
                  <p className="text-xs text-zinc-500">Asked on {formatDate(r.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[r.status]}`}>
                    {statusText[r.status]}
                  </span>
                  {r.status === "PENDING" && (
                    <ActionButton action={cancelJoinRequestAction} fields={{ requestId: r.id }}>
                      Cancel
                    </ActionButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
