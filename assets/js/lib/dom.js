let toastTimer = null;
let modalCounter = 0;

export function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
  });
}

export function toast(message, type) {
  if (window.Swal) {
    const icon = type === "danger" ? "error" : type === "warning" ? "warning" : type === "success" ? "success" : "info";
    window.Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 3200,
      timerProgressBar: true,
      showClass: { popup: "swal2-show swal-soft-show" }
    }).fire({ icon, title: String(message || "") });
    return;
  }

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
  if (window.Swal) {
    return window.Swal.fire({
      title: opts.title || "Konfirmasi",
      text: message,
      icon:
        opts.tone === "warning"
          ? "warning"
          : opts.tone === "primary"
            ? "question"
            : "error",
      showCancelButton: true,
      confirmButtonText: opts.confirmLabel || "Ya, lanjutkan",
      cancelButtonText: opts.cancelLabel || "Batal",
      reverseButtons: true,
      focusCancel: true,
      customClass: {
        popup: "rounded-4",
        confirmButton: "btn " + (opts.tone === "primary" ? "btn-primary" : opts.tone === "warning" ? "btn-warning" : "btn-danger") + " rounded-pill px-4",
        cancelButton: "btn btn-outline-secondary rounded-pill px-4"
      },
      buttonsStyling: false,
      showClass: { popup: "swal2-show swal-soft-show" }
    }).then((result) => result.isConfirmed);
  }
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

export function attendanceEditDialog(record) {
  const checkIn = String(record.check_in || "").slice(0, 5);
  const checkOut = String(record.check_out || "").slice(0, 5);

  if (!window.Swal) {
    const nextStatus = window.prompt("Status (on-time / late):", record.status || "on-time");
    if (nextStatus === null) return Promise.resolve(null);
    const nextCheckIn = window.prompt("Jam masuk (HH:MM, kosongkan untuk menghapus):", checkIn);
    if (nextCheckIn === null) return Promise.resolve(null);
    const nextCheckOut = window.prompt(
      "Jam pulang (HH:MM, kosongkan jika belum pulang atau jam masuk dihapus):",
      nextCheckIn ? checkOut : ""
    );
    if (nextCheckOut === null) return Promise.resolve(null);
    if (!/^(on-time|late)$/.test(nextStatus)) {
      toast("Status atau jam masuk tidak valid.", "danger");
      return Promise.resolve(null);
    }
    if (nextCheckIn && !/^([01]\d|2[0-3]):[0-5]\d$/.test(nextCheckIn)) {
      toast("Jam masuk harus berformat HH:MM atau dikosongkan.", "danger");
      return Promise.resolve(null);
    }
    if (nextCheckOut && !/^([01]\d|2[0-3]):[0-5]\d$/.test(nextCheckOut)) {
      toast("Jam pulang harus berformat HH:MM.", "danger");
      return Promise.resolve(null);
    }
    if (!nextCheckIn && nextCheckOut) {
      toast("Jam pulang harus dikosongkan jika jam masuk dihapus.", "danger");
      return Promise.resolve(null);
    }
    if (nextCheckOut && nextCheckOut < nextCheckIn) {
      toast("Jam pulang tidak boleh lebih awal dari jam masuk.", "danger");
      return Promise.resolve(null);
    }
    return Promise.resolve({
      status: nextStatus,
      checkIn: nextCheckIn || null,
      checkOut: nextCheckOut
    });
  }

  return window.Swal.fire({
    title: "Edit absensi",
    html: `
      <div class="text-start">
        <p class="small text-secondary mb-3">${esc(record.name)} &middot; ${esc(record.date)}</p>
        <label class="form-label small fw-semibold" for="edit-attendance-status">Status kehadiran</label>
        <select id="edit-attendance-status" class="form-select mb-3">
          <option value="on-time"${record.status === "on-time" ? " selected" : ""}>Tepat waktu</option>
          <option value="late"${record.status === "late" ? " selected" : ""}>Telat</option>
        </select>
        <label class="form-label small fw-semibold" for="edit-attendance-check-in">Jam masuk</label>
        <input id="edit-attendance-check-in" class="form-control mb-1" type="time" value="${esc(checkIn)}" />
        <div class="form-text mb-3">Kosongkan jam masuk untuk menghapus waktu hadir. Jam pulang akan ikut dikosongkan.</div>
        <label class="form-label small fw-semibold" for="edit-attendance-check-out">Jam pulang</label>
        <input id="edit-attendance-check-out" class="form-control" type="time" value="${esc(checkOut)}" />
        <div class="form-text">Kosongkan jam pulang jika peserta belum melakukan absen pulang.</div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Simpan perubahan",
    cancelButtonText: "Batal",
    reverseButtons: true,
    focusConfirm: false,
    customClass: {
      popup: "rounded-4",
      confirmButton: "btn btn-primary rounded-pill px-4",
      cancelButton: "btn btn-outline-secondary rounded-pill px-4"
    },
    buttonsStyling: false,
    showClass: { popup: "swal2-show swal-soft-show" },
    didOpen: () => {
      const checkInInput = document.getElementById("edit-attendance-check-in");
      const checkOutInput = document.getElementById("edit-attendance-check-out");
      const updateCheckoutInput = () => {
        if (!checkInInput.value) checkOutInput.value = "";
        checkOutInput.disabled = !checkInInput.value;
      };
      checkInInput.addEventListener("input", updateCheckoutInput);
      updateCheckoutInput();
      document.getElementById("edit-attendance-status").focus();
    },
    preConfirm: () => {
      const nextStatus = document.getElementById("edit-attendance-status").value;
      const nextCheckIn = document.getElementById("edit-attendance-check-in").value;
      const nextCheckOut = document.getElementById("edit-attendance-check-out").value;
      if (!/^(on-time|late)$/.test(nextStatus)) {
        window.Swal.showValidationMessage("Pilih status kehadiran yang valid.");
        return false;
      }
      if (nextCheckIn && !/^([01]\d|2[0-3]):[0-5]\d$/.test(nextCheckIn)) {
        window.Swal.showValidationMessage("Jam masuk harus berformat HH:MM atau dikosongkan.");
        return false;
      }
      if (nextCheckOut && !/^([01]\d|2[0-3]):[0-5]\d$/.test(nextCheckOut)) {
        window.Swal.showValidationMessage("Jam pulang harus berformat HH:MM.");
        return false;
      }
      if (nextCheckOut && nextCheckOut < nextCheckIn) {
        window.Swal.showValidationMessage("Jam pulang tidak boleh lebih awal dari jam masuk.");
        return false;
      }
      if (!nextCheckIn && nextCheckOut) {
        window.Swal.showValidationMessage("Jam pulang harus dikosongkan jika jam masuk dihapus.");
        return false;
      }
      return {
        status: nextStatus,
        checkIn: nextCheckIn || null,
        checkOut: nextCheckOut
      };
    }
  }).then((result) => (result.isConfirmed ? result.value : null));
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
