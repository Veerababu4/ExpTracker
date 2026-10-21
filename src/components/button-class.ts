// Button styles, usable from both server and client components (so no "use client" here).
const tones = {
  primary: "bg-teal-700 text-white hover:bg-teal-800",
  danger: "bg-red-600 text-white hover:bg-red-700",
  plain: "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50",
};

export type Tone = keyof typeof tones;

export function buttonClass(tone: Tone = "plain", size: "sm" | "md" = "sm") {
  const pad = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-base";
  return `inline-flex items-center justify-center rounded-lg font-medium shadow-sm disabled:opacity-60 ${pad} ${tones[tone]}`;
}
