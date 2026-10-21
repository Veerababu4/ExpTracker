// Placeholder home page for M0. From M1 this redirects to login or to the add-expense page.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Family Expenses</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Record your family&apos;s daily spending, see every month at a glance and keep to a budget.
      </p>
      <p className="text-sm text-zinc-500">Setup complete (M0). Sign-up and login arrive in M1.</p>
    </main>
  );
}
