/** White panel with a heading, used for page sections. */
export function Card({
  title,
  note,
  children,
  id,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>
      {note && <p className="mt-0.5 text-sm text-zinc-500">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
