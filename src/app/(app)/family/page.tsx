import type { Metadata } from "next";
import Link from "next/link";
import { decideJoinRequestAction, regenerateJoinCodeAction } from "@/actions/family";
import { ActionButton, ConfirmButton, CopyButton } from "@/components/actions";
import { buttonClass } from "@/components/button-class";
import { Card } from "@/components/card";
import { formatDate, formatMonth } from "@/lib/format";
import { formatJoinCode } from "@/lib/rules/join-code";
import { requireFamily } from "@/server/auth/family";
import { familySharing, type Sharing } from "@/server/services/books";
import { getFamily, listMembers, pendingRequests, type Membership } from "@/server/services/families";
import { LeaveFamily, MemberActions } from "./family-forms";
import { SharingCard } from "./sharing-card";

export const metadata: Metadata = { title: "Family · Family Expenses" };

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { user, family, families } = await requireFamily();
  // In My expenses this page holds the sharing switch for every family and the book's own settings (M8).
  if (family.kind === "PERSONAL") return <PersonalBookPage userId={user.id} families={families} />;
  const isHead = family.role === "HEAD";
  const familyId = family.familyId;
  const [details, members, requests, sharing, params] = await Promise.all([
    getFamily(familyId),
    listMembers(familyId),
    isHead ? pendingRequests(user.id, familyId) : Promise.resolve([]),
    familySharing(familyId),
    searchParams,
  ]);
  const code = details?.joinCode ? formatJoinCode(details.joinCode) : "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{family.familyName}</h1>
        <p className="text-sm text-zinc-600">
          You are {isHead ? "the family head" : "a member"} · {members.length}{" "}
          {members.length === 1 ? "member" : "members"}
        </p>
      </div>

      {params.created && isHead && (
        <p role="status" className="rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-900">
          Family created. Share the family code below with your family members so they can ask to join — or create
          logins for them yourself.
        </p>
      )}

      <SharingCard userId={user.id} families={families} only={familyId} />

      {isHead && (
        <Card
          title="Family code"
          id="code"
          note="Family members enter this after creating their own account. You approve each request."
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-zinc-100 px-4 py-2 font-mono text-2xl font-semibold tracking-widest" data-testid="join-code">
              {code}
            </span>
            <CopyButton text={code} />
            <ConfirmButton
              action={regenerateJoinCodeAction}
              fields={{ familyId }}
              label="New code"
              question="The current code will stop working."
              confirmLabel="Make new code"
              tone="primary"
            />
          </div>
        </Card>
      )}

      {isHead && (
        <Card title="Requests to join" id="requests">
          {requests.length === 0 ? (
            <p className="text-sm text-zinc-500">No pending requests.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.displayName} <span className="font-normal text-zinc-500">@{r.username}</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      Asked {formatDate(r.createdAt)}
                      {r.mobile && ` · ${r.mobile}`}
                      {r.email && ` · ${r.email}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <ActionButton
                      action={decideJoinRequestAction}
                      fields={{ familyId, requestId: r.id, decision: "approve" }}
                      tone="primary"
                    >
                      Approve
                    </ActionButton>
                    <ActionButton action={decideJoinRequestAction} fields={{ familyId, requestId: r.id, decision: "reject" }}>
                      Reject
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card title="Members" id="members">
        <ul className="divide-y divide-zinc-100">
          {members.map((m) => {
            const isMe = m.userId === user.id;
            return (
              <li key={m.userId} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-medium">{m.displayName}</p>
                  <span className="text-sm text-zinc-500">@{m.username}</span>
                  {m.role === "HEAD" && (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-900">Head</span>
                  )}
                  {isMe && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">You</span>}
                </div>
                <p className="-mt-1.5 text-xs text-zinc-500">
                  Joined {formatDate(m.joinedAt)} · <span data-testid="member-sharing">{sharingLabel(sharing.get(m.userId), familyId)}</span>
                </p>
                {isHead && !isMe && <MemberActions familyId={familyId} memberId={m.userId} memberName={m.displayName} />}
              </li>
            );
          })}
        </ul>
        {isHead && (
          <div className="mt-4">
            <Link href="/family/add-member" className={buttonClass("primary")}>
              + Create a login for a family member
            </Link>
          </div>
        )}
      </Card>

      <Card title="Settings" id="settings">
        <ul className="flex flex-col gap-2 text-sm">
          {isHead && (
            <li>
              <Link href="/family/categories" className="font-medium text-teal-700 hover:underline">
                Categories →
              </Link>{" "}
              <span className="text-zinc-500">add, rename or hide expense categories</span>
            </li>
          )}
          {isHead && (
            <li>
              <Link href="/family/budget" className="font-medium text-teal-700 hover:underline">
                Budget →
              </Link>{" "}
              <span className="text-zinc-500">monthly budget for the family and per category</span>
            </li>
          )}
          <li>
            <Link href="/family/limits" className="font-medium text-teal-700 hover:underline">
              {isHead ? "Alert limits →" : "Your alert limits →"}
            </Link>{" "}
            <span className="text-zinc-500">
              {isHead ? "when the high-value warnings appear, per member" : "when the high-value warnings appear for you"}
            </span>
          </li>
        </ul>
      </Card>

      <Card title={isHead ? "Leaving this family" : "Leave this family"} id="leave">
        {isHead ? (
          <p className="text-sm text-zinc-600">
            As the head you can&apos;t leave directly. First make another member the head (use “Make head” above).
          </p>
        ) : (
          <LeaveFamily familyId={familyId} familyName={family.familyName} />
        )}
      </Card>

      <p>
        <Link href="/welcome" className="text-sm font-medium text-teal-700 hover:underline">
          Create or join another family →
        </Link>
      </p>
    </div>
  );
}

/** Members list label (P3): whether this member's expenses are in this family this month. */
function sharingLabel(s: Sharing | undefined, familyId: string): string {
  if (s?.familyId === familyId) return s.since ? `Sharing since ${formatMonth(s.since)}` : "Sharing";
  return s?.since ? `Personal only since ${formatMonth(s.since)}` : "Personal only";
}

/** /family while My expenses is open: sharing with each family, and this book's settings. */
function PersonalBookPage({ userId, families }: { userId: string; families: Membership[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">My expenses</h1>
        <p className="text-sm text-zinc-600">Your own book — only you can see it.</p>
      </div>

      {families.length > 0 ? (
        <SharingCard userId={userId} families={families} />
      ) : (
        <Card title="Your expenses" id="sharing">
          <p className="text-sm text-zinc-600">
            You&apos;re not in a family, so your expenses are personal only. Create or join a family to share them.
          </p>
        </Card>
      )}

      <Card title="Settings" id="settings">
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <Link href="/family/categories" className="font-medium text-teal-700 hover:underline">
              Categories →
            </Link>{" "}
            <span className="text-zinc-500">add, rename or hide your categories</span>
          </li>
          <li>
            <Link href="/family/budget" className="font-medium text-teal-700 hover:underline">
              Budget →
            </Link>{" "}
            <span className="text-zinc-500">your monthly budget, in total and per category</span>
          </li>
          <li>
            <Link href="/family/limits" className="font-medium text-teal-700 hover:underline">
              Alert limits →
            </Link>{" "}
            <span className="text-zinc-500">when the high-value warnings appear for you</span>
          </li>
        </ul>
      </Card>

      <p>
        <Link href="/welcome" className="text-sm font-medium text-teal-700 hover:underline">
          {families.length > 0 ? "Your families · create or join another →" : "Create or join a family →"}
        </Link>
      </p>
    </div>
  );
}
