import { esc } from "./dom.js";

let activeMenu = null;

function closeActiveMenu() {
  if (!activeMenu) return;
  const { menu, anchor, onDocumentClick, onKeydown, onViewportChange } = activeMenu;
  menu.remove();
  if (anchor) anchor.setAttribute("aria-expanded", "false");
  document.removeEventListener("click", onDocumentClick, true);
  document.removeEventListener("keydown", onKeydown, true);
  window.removeEventListener("resize", onViewportChange);
  window.removeEventListener("scroll", onViewportChange, true);
  activeMenu = null;
}

function positionMenu(menu, anchor) {
  const gap = 6;
  const margin = 8;
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();

  let top = rect.bottom + gap;
  if (top + menuRect.height > window.innerHeight - margin) {
    top = rect.top - menuRect.height - gap;
  }
  if (top < margin) top = margin;

  let left = rect.right - menuRect.width;
  if (left < margin) left = margin;
  if (left + menuRect.width > window.innerWidth - margin) {
    left = window.innerWidth - menuRect.width - margin;
  }

  menu.style.top = Math.round(top) + "px";
  menu.style.left = Math.round(left) + "px";
}

export function openActionMenu(anchor, items) {
  if (!anchor || !Array.isArray(items) || !items.length) return;

  const alreadyOpen = Boolean(activeMenu && activeMenu.anchor === anchor);
  closeActiveMenu();
  if (alreadyOpen) return;

  const menu = document.createElement("div");
  menu.className = "action-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = items
    .map((item, index) => {
      const tone = item.tone ? " is-" + item.tone : "";
      const disabled = item.disabled ? " disabled" : "";
      return `
        <button class="action-menu-item${tone}" type="button" role="menuitem" data-index="${index}"${disabled}>
          <i class="bi ${esc(item.icon || "bi-dot")}" aria-hidden="true"></i>
          <span>${esc(item.label)}</span>
        </button>
      `;
    })
    .join("");
  document.body.appendChild(menu);

  anchor.setAttribute("aria-expanded", "true");
  positionMenu(menu, anchor);

  const onDocumentClick = (event) => {
    if (menu.contains(event.target) || anchor.contains(event.target)) return;
    closeActiveMenu();
  };
  const onKeydown = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeActiveMenu();
    anchor.focus({ preventScroll: true });
  };
  const onViewportChange = () => closeActiveMenu();

  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onKeydown, true);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);

  menu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-index]");
    if (!button) return;
    const item = items[Number(button.dataset.index)];
    closeActiveMenu();
    if (item && typeof item.onSelect === "function") item.onSelect();
  });

  activeMenu = { menu, anchor, onDocumentClick, onKeydown, onViewportChange };

  const first = menu.querySelector(".action-menu-item:not([disabled])");
  if (first) first.focus({ preventScroll: true });
}
