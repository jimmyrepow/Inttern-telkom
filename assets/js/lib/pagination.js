export function clampPage(page, totalItems, pageSize) {
  const size = Math.max(1, Number(pageSize) || 10);
  const pages = Math.max(1, Math.ceil((Number(totalItems) || 0) / size));
  return Math.min(Math.max(1, Number(page) || 1), pages);
}

export function paginate(items, page, pageSize) {
  const rows = Array.isArray(items) ? items : [];
  const size = Math.max(1, Number(pageSize) || 10);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = clampPage(page, rows.length, size);
  const start = (current - 1) * size;
  const end = Math.min(start + size, rows.length);
  return {
    page: current,
    pages,
    pageSize: size,
    total: rows.length,
    start,
    end,
    items: rows.slice(start, end)
  };
}

function pageNumbers(page, pages) {
  if (pages <= 7) {
    const all = [];
    for (let index = 1; index <= pages; index += 1) all.push(index);
    return all;
  }
  const list = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) list.push("…");
  for (let index = from; index <= to; index += 1) list.push(index);
  if (to < pages - 1) list.push("…");
  list.push(pages);
  return list;
}

export function renderPagination(page, pages, ariaLabel) {
  if (pages <= 1) return "";
  const items = pageNumbers(page, pages).map((item) => {
    if (item === "…") {
      return '<li class="page-item disabled"><span class="page-link">…</span></li>';
    }
    const active = item === page;
    return (
      '<li class="page-item' +
      (active ? " active" : "") +
      '"><button class="page-link" type="button" data-page="' +
      item +
      '"' +
      (active ? ' aria-current="page"' : "") +
      ">" +
      item +
      "</button></li>"
    );
  });

  return `
    <div class="table-pager">
      <span class="pager-info">Halaman ${page} dari ${pages}</span>
      <nav aria-label="${ariaLabel || "Navigasi halaman"}">
        <ul class="pagination pagination-sm mb-0">
          <li class="page-item${page <= 1 ? " disabled" : ""}">
            <button class="page-link" type="button" data-page="${page - 1}" aria-label="Halaman sebelumnya"><i class="bi bi-chevron-left"></i></button>
          </li>
          ${items.join("")}
          <li class="page-item${page >= pages ? " disabled" : ""}">
            <button class="page-link" type="button" data-page="${page + 1}" aria-label="Halaman berikutnya"><i class="bi bi-chevron-right"></i></button>
          </li>
        </ul>
      </nav>
    </div>
  `;
}
