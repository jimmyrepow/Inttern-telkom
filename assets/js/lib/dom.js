let toastTimer = null;
let modalCounter = 0;

export function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

export function toast(message, type) {
  let element = document.getElementById("toast");
  if (!element) {
    element = document.createElement("div");
    element.id = "toast";
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    document.body.appendChild(element);
  }
  element.className = "toast show" + (type ? " toast-" + type : "");
  element.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 3600);
}

export function withBusy(button, label) {
  if (!button) return () => {};
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>' +
    esc(label || "Memproses...");
  return () => {
    button.disabled = false;
    button.innerHTML = original;
  };
}

function createModal(markup) {
  modalCounter += 1;
  const host = document.createElement("div");
  host.innerHTML = markup.trim();
  const element = host.firstElementChild;
  document.body.appendChild(element);
  const modal = new window.bootstrap.Modal(element, { backdrop: "static", keyboard: true });
  return { element, modal };
}

function modalToneClass(tone) {
  return tone === "primary" ? "btn-primary" : tone === "warning" ? "btn-warning" : "btn-danger";
}

export function confirmDialog(options) {
  const opts = options || {};
  const message = opts.message || "";
  if (!window.bootstrap || !window.bootstrap.Modal) {
    return Promise.resolve(window.confirm(message || opts.title || "Lanjutkan?"));
  }

  const id = "confirm-modal-" + modalCounter;
  const { element, modal } = createModal(`
    <div class="modal fade" id="${id}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4 border-0">
          <div class="modal-header border-0 pb-0">
            <h2 class="h5 fw-bold mb-0">${esc(opts.title || "Konfirmasi")}</h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button>
          </div>
          <div class="modal-body text-secondary">${esc(message)}</div>
          <div class="modal-footer border-0 pt-0">
            <button class="btn btn-outline-secondary rounded-pill px-4" type="button" data-cancel>${esc(opts.cancelLabel || "Batal")}</button>
            <button class="btn ${modalToneClass(opts.tone)} rounded-pill px-4" type="button" data-confirm>${esc(opts.confirmLabel || "Ya, lanjutkan")}</button>
          </div>
        </div>
      </div>
    </div>
  `);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      modal.hide();
    };
    element.querySelector("[data-confirm]").addEventListener("click", () => finish(true));
    element.querySelector("[data-cancel]").addEventListener("click", () => finish(false));
    element.addEventListener("hidden.bs.modal", () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
      element.remove();
    });
    modal.show();
  });
}

export function passwordDialog(options) {
  const opts = options || {};
  const title = opts.title || "Reset password";
  const description = opts.description || "Masukkan password baru minimal 6 karakter.";

  if (!window.bootstrap || !window.bootstrap.Modal) {
    const password = window.prompt(title + "\n" + description);
    if (password === null) return Promise.resolve(null);
    if (password !== window.prompt("Ulangi password baru:")) {
      window.alert("Konfirmasi password tidak sama.");
      return Promise.resolve(null);
    }
    return Promise.resolve(password);
  }

  const id = "password-modal-" + modalCounter;
  const initialValue = String(opts.initialValue || "");
  const { element, modal } = createModal(`
    <div class="modal fade" id="${id}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4 border-0">
          <form novalidate>
            <div class="modal-header border-0 pb-0">
              <h2 class="h5 fw-bold mb-0">${esc(title)}</h2>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Tutup"></button>
            </div>
            <div class="modal-body">
              <p class="small text-secondary">${esc(description)}</p>
              <div class="mb-3">
                <label class="form-label small fw-semibold" for="${id}-new">Password baru</label>
                <input id="${id}-new" class="form-control rounded-3" type="password" autocomplete="new-password" minlength="6" value="${esc(initialValue)}" required />
              </div>
              <div class="mb-1">
                <label class="form-label small fw-semibold" for="${id}-confirm">Ulangi password baru</label>
                <input id="${id}-confirm" class="form-control rounded-3" type="password" autocomplete="new-password" minlength="6" value="${esc(initialValue)}" required />
              </div>
              <div class="form-check mt-2">
                <input id="${id}-show" class="form-check-input" type="checkbox" />
                <label class="form-check-label small" for="${id}-show">Tampilkan password</label>
              </div>
              <div class="small text-danger mt-2" data-error role="alert" aria-live="polite"></div>
            </div>
            <div class="modal-footer border-0 pt-0">
              <button class="btn btn-outline-secondary rounded-pill px-4" type="button" data-cancel>Batal</button>
              <button class="btn btn-primary rounded-pill px-4" type="submit">Simpan password</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `);

  const form = element.querySelector("form");
  const newInput = element.querySelector("#" + id + "-new");
  const confirmInput = element.querySelector("#" + id + "-confirm");
  const showInput = element.querySelector("#" + id + "-show");
  const errorBox = element.querySelector("[data-error]");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      modal.hide();
    };

    showInput.addEventListener("change", () => {
      const type = showInput.checked ? "text" : "password";
      newInput.type = type;
      confirmInput.type = type;
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const password = newInput.value;
      if (password.length < 6) {
        errorBox.textContent = "Password minimal 6 karakter.";
        newInput.focus();
        return;
      }
      if (password !== confirmInput.value) {
        errorBox.textContent = "Konfirmasi password tidak sama.";
        confirmInput.focus();
        return;
      }
      finish(password);
    });

    element.querySelector("[data-cancel]").addEventListener("click", () => finish(null));
    element.addEventListener("hidden.bs.modal", () => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
      element.remove();
    });
    modal.show();
  });
}
