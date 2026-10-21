"use client";

import { useActionState, useState } from "react";
import { leaveFamilyAction, removeMemberAction, resetMemberPasswordAction, transferHeadAction } from "@/actions/family";
import { ConfirmButton } from "@/components/actions";
import { buttonClass } from "@/components/button-class";
import { FormMessage, SubmitButton, TextField } from "@/components/form";
import { suggestTempPassword } from "@/lib/temp-password";

/** Head's buttons on another member's row: reset password, make head, remove. */
export function MemberActions({ familyId, memberId, memberName }: { familyId: string; memberId: string; memberName: string }) {
  const [resetting, setResetting] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass("plain")} onClick={() => setResetting((v) => !v)} aria-expanded={resetting}>
          Reset password
        </button>
        <ConfirmButton
          action={transferHeadAction}
          fields={{ familyId, memberId }}
          label="Make head"
          question={`Make ${memberName} the family head? You'll become a member.`}
          confirmLabel="Yes, make head"
          tone="primary"
        />
        <ConfirmButton
          action={removeMemberAction}
          fields={{ familyId, memberId }}
          label="Remove"
          question={`Remove ${memberName}? Their past expenses stay.`}
          confirmLabel="Yes, remove"
        />
      </div>
      {resetting && <ResetPasswordForm familyId={familyId} memberId={memberId} memberName={memberName} />}
    </div>
  );
}

function ResetPasswordForm({ familyId, memberId, memberName }: { familyId: string; memberId: string; memberName: string }) {
  const [state, action] = useActionState(resetMemberPasswordAction, {});
  const [password, setPassword] = useState("");
  return (
    <form action={action} className="flex max-w-md flex-col gap-3 rounded-xl border border-zinc-200 p-4" noValidate>
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="memberId" value={memberId} />
      <FormMessage state={state} />
      <TextField
        label={`Temporary password for ${memberName}`}
        name="tempPassword"
        autoComplete="off"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        errors={state.fieldErrors?.tempPassword}
        hint="At least 8 characters with a letter and a digit. They'll choose their own at next login."
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass("plain")} onClick={() => setPassword(suggestTempPassword())}>
          Suggest one
        </button>
        <div className="flex-1">
          <SubmitButton pendingText="Resetting…">Reset password</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function LeaveFamily({ familyId, familyName }: { familyId: string; familyName: string }) {
  const [state, action] = useActionState(leaveFamilyAction, {});
  const [asking, setAsking] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-600">
        You&apos;ll lose access to {familyName}&apos;s expenses. The expenses you added stay in the family. You can ask
        to join again later.
      </p>
      <FormMessage state={state} />
      {asking ? (
        <form action={action} className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-100 p-2">
          <input type="hidden" name="familyId" value={familyId} />
          <span className="text-sm">Leave {familyName}?</span>
          <button type="submit" className={buttonClass("danger")}>
            Yes, leave
          </button>
          <button type="button" className={buttonClass("plain")} onClick={() => setAsking(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div>
          <button type="button" className={buttonClass("plain")} onClick={() => setAsking(true)}>
            Leave family
          </button>
        </div>
      )}
    </div>
  );
}
