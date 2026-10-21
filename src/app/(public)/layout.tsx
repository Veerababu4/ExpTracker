import { Brand } from "@/components/brand";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8 sm:py-14">
      <div className="mb-6">
        <Brand />
      </div>
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-8">{children}</main>
    </div>
  );
}
