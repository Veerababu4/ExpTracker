// CSV files that open correctly in Excel (DESIGN §3.6 B4).

/** Without this byte-order mark Excel reads the file as ANSI and garbles ₹ and non-English names. */
const BOM = "﻿";

/**
 * A cell that a spreadsheet would run as a formula ("CSV injection": = + - @, and tab / carriage return,
 * which some programs skip before checking) gets a leading apostrophe, so it shows as plain text.
 */
export function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Wraps a cell in quotes when it holds a comma, quote or line break, doubling quotes inside (RFC 4180). */
function quoted(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Rows → the text of a .csv file: BOM, Windows line endings, every cell made safe and quoted as needed.
 * Amounts are passed as plain numbers ("2500.50", never "₹2,500.50"), so Excel can add them up.
 */
export function toCsv(rows: string[][]): string {
  return BOM + rows.map((row) => row.map((cell) => quoted(safeCell(cell))).join(",")).join("\r\n") + "\r\n";
}
