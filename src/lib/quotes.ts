// Money-wisdom quotes for the home page and the "thought for today" on the Add page (DESIGN §3.8 P10).
// Only well-known, checkable attributions; our own lines carry no name.

import { daysBetween, type IsoDate } from "@/lib/rules/dates";

export type Quote = { text: string; by?: string };

export const QUOTES: readonly Quote[] = [
  { text: "Beware of little expenses; a small leak will sink a great ship.", by: "Benjamin Franklin" },
  {
    text: "Even if what comes in is small, there is no harm — as long as what goes out is not larger.",
    by: "Thiruvalluvar, Thirukkural 478",
  },
  { text: "Write it down today, and thank yourself at the end of the month." },
  {
    text: "Annual income twenty pounds, annual expenditure nineteen nineteen and six, result happiness.",
    by: "Charles Dickens, David Copperfield",
  },
  { text: "Money you can see is money you can control." },
  { text: "Waste not, want not.", by: "Proverb" },
  { text: "Small savings every day become big plans one day." },
  { text: "Many a little makes a mickle.", by: "Scottish proverb" },
  { text: "Spend on what matters to you; let the rest wait a day." },
  { text: "A penny saved is a penny earned.", by: "Proverb" },
  { text: "A family that plans together spends wisely together." },
];

/** The same quote all day, a different one tomorrow. */
export function quoteForDay(date: IsoDate): Quote {
  const n = daysBetween("2000-01-01", date);
  return QUOTES[((n % QUOTES.length) + QUOTES.length) % QUOTES.length];
}
