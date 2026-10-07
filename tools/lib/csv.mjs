/* Rows -> CSV text, for the synthetic data files. Dates are written as 2027-01-05 and blanks as empty
   fields, TRUE / FALSE as Excel writes them; text with a comma, quote or line break is quoted. */
const day = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const field = (v) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? day(v) : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export const toCsv = (rows) => rows.map((r) => Array.from(r, field).join(",")).join("\r\n") + "\r\n";
