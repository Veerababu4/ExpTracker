"use client";

// Shown when an action or page fails unexpectedly — including permission checks on a tampered or stale
// form (for example, a member clicking a head-only button left open in an old tab).
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-red-200 bg-white p-6 text-center">
      <h1 className="text-lg font-semibold text-zinc-900">That didn&apos;t work</h1>
      <p className="text-sm text-zinc-600">
        You may not have permission for this, or the page was out of date. Please reload and try again.
      </p>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Try again
        </button>
      </div>
    </section>
  );
}
