import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/card";
import { ExpenseForm } from "@/components/expense-form";
import { PAYMENT_MODES, UNCATEGORISED, type PaymentMode } from "@/lib/expense-options";
import { formatDateTime, formatIsoDate } from "@/lib/format";
import { formatRupees, paiseToInput } from "@/lib/money";
import { alertLevel } from "@/lib/rules/alerts";
import { formatBytes, isPhoto } from "@/lib/rules/receipts";
import { uuidSchema } from "@/lib/validation/family";
import { requireFamily } from "@/server/auth/family";
import { listCategories } from "@/server/services/categories";
import { categoryNames, expenseHistory, getExpense, type ExpenseView, type HistoryEntry } from "@/server/services/expenses";
import { uploadState } from "@/server/services/receipts";
import { DeleteExpense } from "./delete-expense";
import { ReceiptForms } from "./receipt-forms";

export const metadata: Metadata = { title: "Expense · Family Expenses" };

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { user, family } = await requireFamily();
  const found = await getExpense(user.id, family.familyId, id);
  if (!found) notFound();
  const { expense, canChange, whyNot, window } = found;
  const isHead = family.role === "HEAD";

  const [categories, history, uploads] = await Promise.all([
    listCategories(user.id, family.familyId),
    isHead ? expenseHistory(user.id, family.familyId, id) : Promise.resolve([]),
    canChange ? uploadState() : Promise.resolve("off" as const),
  ]);
  // A hidden category stays selectable on the expense that already uses it.
  if (expense.categoryId && expense.categoryName && !categories.some((c) => c.id === expense.categoryId)) {
    categories.push({ id: expense.categoryId, name: `${expense.categoryName} (hidden)`, hidden: true });
  }
  const names = await categoryNames(family.familyId, historyCategoryIds(history));
  const isOwn = expense.ownerId === user.id;

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/?date=${expense.expenseDate}`} className="text-sm font-medium text-teal-700 hover:underline">
        ← Add expense
      </Link>

      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tabular-nums">
          {formatRupees(expense.amountPaise)}
          {alertLevel(expense.amountPaise, expense.ownerLimits) === "very_high" && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">High</span>
          )}
        </h1>
        <p className="text-sm text-zinc-600">
          {expense.categoryName ?? UNCATEGORISED} · {formatIsoDate(expense.expenseDate)} · added by{" "}
          {isOwn ? "you" : expense.ownerName}
        </p>
      </div>

      {canChange ? (
        <>
          <Card
            title="Edit"
            id="edit"
            note={!isOwn ? `You're changing ${expense.ownerName}'s expense as family head. Alerts use their limits.` : undefined}
          >
            <div className="max-w-md">
              <ExpenseForm
                familyId={family.familyId}
                expenseId={expense.id}
                initial={{
                  expenseDate: expense.expenseDate,
                  amount: paiseToInput(expense.amountPaise),
                  categoryId: expense.categoryId ?? "",
                  paymentMode: expense.paymentMode ?? "",
                  note: expense.note ?? "",
                }}
                categories={categories}
                limits={expense.ownerLimits}
                window={window}
              />
            </div>
          </Card>
        </>
      ) : (
        <Card title="Details" id="details">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Date</dt>
            <dd>{formatIsoDate(expense.expenseDate)}</dd>
            <dt className="text-zinc-500">Amount</dt>
            <dd className="tabular-nums">{formatRupees(expense.amountPaise)} (INR)</dd>
            <dt className="text-zinc-500">Category</dt>
            <dd>{expense.categoryName ?? UNCATEGORISED}</dd>
            <dt className="text-zinc-500">Payment mode</dt>
            <dd>{expense.paymentMode ? PAYMENT_MODES[expense.paymentMode] : "Not specified"}</dd>
            <dt className="text-zinc-500">Note</dt>
            <dd className="break-words">{expense.note ?? "—"}</dd>
            <dt className="text-zinc-500">Added by</dt>
            <dd>{expense.ownerName}</dd>
          </dl>
          <p className="mt-4 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
            {whyNot === "outside_window"
              ? `It can't be changed any more: you can only change expenses dated from ${formatIsoDate(window.from)} to ${formatIsoDate(window.to)}.${isHead ? "" : " Ask your family head if it needs fixing."}`
              : whyNot}
          </p>
        </Card>
      )}

      {(expense.receipt || canChange) && (
        <Card title="Receipt" id="receipt">
          {expense.receipt ? <ReceiptView receipt={expense.receipt} /> : <p className="text-sm text-zinc-500">No receipt attached.</p>}
          {canChange && (
            <div className="mt-4 border-t border-zinc-100 pt-4">
              <ReceiptForms familyId={family.familyId} expenseId={expense.id} hasReceipt={!!expense.receipt} uploads={uploads} />
            </div>
          )}
        </Card>
      )}

      {canChange && (
        <Card
          title="Delete"
          id="delete"
          note="The expense disappears from lists and totals. The change log keeps a record. Its receipt is removed."
        >
          <DeleteExpense familyId={family.familyId} expenseId={expense.id} />
        </Card>
      )}

      {isHead && (
        <Card title="Change log" id="log" note="Visible to the family head.">
          <ol className="flex flex-col gap-3">
            {history.map((h, i) => (
              <li key={i} className="text-sm">
                <p>
                  <strong>
                    {ACTION_TEXT[h.action] ?? h.action}
                    {h.action === "EXPENSE_ADDED" && h.receipt && " with receipt"}
                  </strong>
                  {h.receipt && h.action.startsWith("RECEIPT_") && (
                    <span className="text-zinc-600">
                      {" "}
                      ({isPhoto(h.receipt.contentType) ? "photo" : "PDF"}, {formatBytes(h.receipt.sizeBytes)})
                    </span>
                  )}{" "}
                  by {h.actorName ?? "a former user"} · <span className="text-zinc-500">{formatDateTime(h.at)}</span>
                </p>
                {h.action === "EXPENSE_UPDATED" && h.before && h.after && (
                  <ul className="mt-1 list-disc pl-5 text-zinc-700">
                    {Object.keys(h.after).map((field) => (
                      <li key={field}>
                        {FIELD_TEXT[field] ?? field}: {show(field, h.before?.[field as keyof typeof h.before], names)} →{" "}
                        {show(field, h.after?.[field as keyof typeof h.after], names)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

const ACTION_TEXT: Record<string, string> = {
  EXPENSE_ADDED: "Added",
  EXPENSE_UPDATED: "Changed",
  EXPENSE_DELETED: "Deleted",
  RECEIPT_ADDED: "Receipt added",
  RECEIPT_REPLACED: "Receipt replaced",
  RECEIPT_REMOVED: "Receipt removed",
};
const FIELD_TEXT: Record<string, string> = {
  expenseDate: "Date",
  amountPaise: "Amount",
  categoryId: "Category",
  paymentMode: "Payment mode",
  note: "Note",
};

function show(field: string, value: unknown, names: Map<string, string>): string {
  if (value === null || value === undefined || value === "") {
    return field === "categoryId" ? UNCATEGORISED : field === "paymentMode" ? "Not specified" : "—";
  }
  switch (field) {
    case "amountPaise":
      return formatRupees(Number(value));
    case "expenseDate":
      return formatIsoDate(String(value));
    case "categoryId":
      return names.get(String(value)) ?? "(unknown)";
    case "paymentMode":
      return PAYMENT_MODES[value as PaymentMode] ?? String(value);
    default:
      return `“${String(value)}”`;
  }
}

/** The saved receipt: a photo shows inline, a PDF as a link. Both open full size in a new tab. */
function ReceiptView({ receipt }: { receipt: NonNullable<ExpenseView["receipt"]> }) {
  const url = `/receipts/${receipt.id}`;
  if (!isPhoto(receipt.contentType)) {
    return (
      <a href={url} target="_blank" rel="noopener" className="font-medium text-teal-700 hover:underline">
        Open receipt (PDF, {formatBytes(receipt.sizeBytes)})
      </a>
    );
  }
  return (
    <figure className="flex flex-col gap-2">
      <a href={url} target="_blank" rel="noopener" className="w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element -- private file behind a login check; the image optimiser would bypass it */}
        <img src={url} alt="Receipt photo" className="max-h-80 w-auto max-w-full rounded-lg border border-zinc-200" />
      </a>
      <figcaption className="text-xs text-zinc-500">
        Photo · {formatBytes(receipt.sizeBytes)} ·{" "}
        <a href={url} target="_blank" rel="noopener" className="font-medium text-teal-700 hover:underline">
          Open full size
        </a>
      </figcaption>
    </figure>
  );
}

function historyCategoryIds(history: HistoryEntry[]): string[] {
  const ids = new Set<string>();
  for (const h of history) {
    for (const snap of [h.before, h.after]) if (snap?.categoryId) ids.add(snap.categoryId);
  }
  return [...ids];
}
