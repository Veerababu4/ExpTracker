/**
 * "Include my expenses in this family from <month>" (DESIGN §3.8 P6). Unticked by default: expenses stay personal
 * until the person chooses to share them. Sent as includeExpenses=on.
 */
export function IncludeExpensesCheckbox({ month, whose = "my" }: { month: string; whose?: "my" | "their" }) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-zinc-800">
      <input type="checkbox" name="includeExpenses" className="mt-0.5 size-4 shrink-0 accent-teal-700" />
      <span>
        Include {whose} expenses in this family from {month}
        <span className="block text-xs text-zinc-500">
          {whose === "my" ? "Leave it unticked to keep them" : "Unticked, they stay"} in My expenses (personal only). This can be
          changed later on the family page.
        </span>
      </span>
    </label>
  );
}
