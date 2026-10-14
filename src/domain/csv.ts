/** Characters that make spreadsheet apps treat a cell as a formula (CSV injection). */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

function escapeCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  let text = String(value);
  // A leading quote makes Excel/Sheets show formula-like text as plain text.
  if (typeof value === 'string' && FORMULA_TRIGGERS.some((trigger) => text.startsWith(trigger))) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * FR-6.3: CSV text (RFC 4180, CRLF line endings) from a header row and data rows. Cells that
 * could run as formulas in a spreadsheet are neutralised.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | boolean | null)[])[],
): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}
