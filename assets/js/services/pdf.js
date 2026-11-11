import { esc, toast } from "../lib/dom.js";

function cellValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return esc(String(value));
}

export function exportPdfReport(options) {
  const opts = options || {};
  const win = opts.target && !opts.target.closed ? opts.target : window.open("", "_blank");
  if (!win) {
    toast("Popup diblokir. Izinkan popup untuk mencetak laporan PDF.", "warning");
    return false;
  }

  const metaRows = (opts.meta || [])
    .map(
      (item) =>
        '<div class="meta-row"><span>' +
        esc(item.label) +
        "</span><strong>" +
        esc(item.value || "-") +
        "</strong></div>"
    )
    .join("");

  const sections = (opts.sections || [])
    .map((section) => {
      const columns = section.columns || [];
      const rows = section.rows || [];
      const head = columns.map((column) => "<th>" + esc(column.label) + "</th>").join("");
      const body = rows.length
        ? rows
            .map(
              (row) =>
                "<tr>" +
                columns
                  .map((column) => "<td>" + cellValue(row[column.key]) + "</td>")
                  .join("") +
                "</tr>"
            )
            .join("")
        : '<tr><td colspan="' + columns.length + '" class="empty">Tidak ada data.</td></tr>';
      return (
        "<section><h2>" +
        esc(section.heading) +
        "</h2>" +
        (section.note ? '<p class="note">' + esc(section.note) + "</p>" : "") +
        '<table><thead><tr>' +
        head +
        "</tr></thead><tbody>" +
        body +
        "</tbody></table></section>"
      );
    })
    .join("");

  const generated = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(new Date());

  win.document.write(`<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${esc(opts.title || "Laporan")}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; background: #fff; font-size: 12px; }
    header { border-bottom: 3px solid #ec4899; padding-bottom: 14px; margin-bottom: 18px; }
    .brand { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #ec4899; font-weight: 700; }
    h1 { font-size: 20px; margin: 6px 0 2px; }
    .subtitle { color: #475569; font-size: 12px; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 24px; margin: 16px 0 20px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
    .meta-row { display: flex; justify-content: space-between; gap: 12px; }
    .meta-row span { color: #64748b; }
    section { margin-bottom: 20px; page-break-inside: avoid; }
    h2 { font-size: 13px; margin: 0 0 8px; padding-bottom: 5px; border-bottom: 1px solid #e2e8f0; }
    .note { margin: 0 0 8px; color: #64748b; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; background: #f1f5f9; padding: 6px 8px; border: 1px solid #e2e8f0; }
    td { padding: 6px 8px; border: 1px solid #e2e8f0; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    td.empty { text-align: center; color: #94a3b8; padding: 14px; }
    footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 10px; display: flex; justify-content: space-between; gap: 12px; }
    @media print { body { padding: 0; } @page { margin: 14mm; size: A4 portrait; } }
  </style>
</head>
<body>
  <header>
    <div class="brand">TELKOM AKSES INTERNSHIP</div>
    <h1>${esc(opts.title || "Laporan")}</h1>
    <div class="subtitle">${esc(opts.subtitle || "")}</div>
  </header>
  ${metaRows ? '<div class="meta">' + metaRows + "</div>" : ""}
  ${sections}
  <footer>
    <span>Dibuat ${esc(generated)}${opts.generatedBy ? " oleh " + esc(opts.generatedBy) : ""}</span>
    <span>${esc(opts.footer || "Laporan otomatis aplikasi absensi")}</span>
  </footer>
</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch (error) {}
  }, 350);
  return true;
}
