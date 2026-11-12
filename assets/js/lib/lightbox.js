let modalElement = null;
let modalInstance = null;
let triggers = [];
let currentIndex = 0;
let opener = null;
let bound = false;

function filenameFromUrl(url) {
  try {
    const name = decodeURIComponent(String(url).split("?")[0].split("/").pop() || "");
    return name || "foto-absensi.jpg";
  } catch (error) {
    return "foto-absensi.jpg";
  }
}

function ensureModal() {
  if (modalElement) return;
  const host = document.createElement("div");
  host.innerHTML = `
    <div class="modal fade photo-lightbox" id="photo-lightbox" tabindex="-1" aria-hidden="true" aria-label="Pratinjau foto absensi">
      <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content border-0 rounded-4 overflow-hidden">
          <div class="modal-header border-0 align-items-start gap-2">
            <div class="min-w-0">
              <h2 class="h6 fw-bold mb-0" data-photo-title>Foto absensi</h2>
              <div class="small text-white-50 text-truncate" data-photo-meta></div>
            </div>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Tutup pratinjau"></button>
          </div>
          <div class="modal-body p-0">
            <div class="photo-lightbox-stage" data-photo-stage>
              <img data-photo-image alt="Foto absensi" />
              <div class="photo-lightbox-error">
                <i class="bi bi-image-alt" aria-hidden="true"></i>
                <strong>Foto tidak dapat dimuat</strong>
                <span>Periksa koneksi internet lalu coba lagi.</span>
              </div>
              <button class="photo-lightbox-nav is-prev" type="button" data-photo-prev aria-label="Foto sebelumnya">
                <i class="bi bi-chevron-left" aria-hidden="true"></i>
              </button>
              <button class="photo-lightbox-nav is-next" type="button" data-photo-next aria-label="Foto berikutnya">
                <i class="bi bi-chevron-right" aria-hidden="true"></i>
              </button>
              <span class="photo-lightbox-counter" data-photo-counter></span>
            </div>
          </div>
          <div class="modal-footer border-0 justify-content-between flex-wrap gap-2">
            <span class="small text-white-50">Gunakan tombol panah kiri/kanan untuk berpindah foto.</span>
            <div class="d-flex gap-2">
              <a class="btn btn-sm btn-outline-light rounded-pill" data-photo-download href="#" download="foto-absensi.jpg"><i class="bi bi-download me-1"></i>Unduh</a>
              <a class="btn btn-sm btn-light rounded-pill" data-photo-original href="#" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-1"></i>Buka asli</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  modalElement = host.firstElementChild;
  document.body.appendChild(modalElement);
  modalInstance = new window.bootstrap.Modal(modalElement);

  const image = modalElement.querySelector("[data-photo-image]");
  const stage = modalElement.querySelector("[data-photo-stage]");

  image.addEventListener("load", () => stage.classList.remove("has-error"));
  image.addEventListener("error", () => stage.classList.add("has-error"));

  modalElement.querySelector("[data-photo-prev]").addEventListener("click", () => move(-1));
  modalElement.querySelector("[data-photo-next]").addEventListener("click", () => move(1));

  modalElement.addEventListener("hidden.bs.modal", () => {
    image.removeAttribute("src");
    stage.classList.remove("has-error");
    if (opener && typeof opener.focus === "function") opener.focus();
  });
}

function visibleTriggers() {
  return Array.from(document.querySelectorAll("[data-photo-view]")).filter((element) => {
    const url = element.getAttribute("data-photo-view") || "";
    return Boolean(url) && element.isConnected;
  });
}

function renderCurrent() {
  if (!modalElement || !triggers.length) return;
  const trigger = triggers[currentIndex] || triggers[0];
  const url = trigger.getAttribute("data-photo-view") || "";
  const title = trigger.getAttribute("data-photo-title") || "Foto absensi";
  const meta = trigger.getAttribute("data-photo-meta") || "Klik untuk memperbesar";
  const image = modalElement.querySelector("[data-photo-image]");
  const stage = modalElement.querySelector("[data-photo-stage]");
  const titleElement = modalElement.querySelector("[data-photo-title]");
  const metaElement = modalElement.querySelector("[data-photo-meta]");
  const counter = modalElement.querySelector("[data-photo-counter]");
  const prev = modalElement.querySelector("[data-photo-prev]");
  const next = modalElement.querySelector("[data-photo-next]");
  const original = modalElement.querySelector("[data-photo-original]");
  const download = modalElement.querySelector("[data-photo-download]");

  stage.classList.remove("has-error");
  image.src = url;
  image.alt = title;
  titleElement.textContent = title;
  metaElement.textContent = meta;
  original.href = url;
  download.href = url;
  download.setAttribute("download", filenameFromUrl(url));

  const multiple = triggers.length > 1;
  counter.textContent = multiple ? currentIndex + 1 + " / " + triggers.length : "";
  prev.classList.toggle("d-none", !multiple);
  next.classList.toggle("d-none", !multiple);
  prev.disabled = currentIndex <= 0;
  next.disabled = currentIndex >= triggers.length - 1;
}

function move(delta) {
  if (!triggers.length) return;
  const nextIndex = Math.min(Math.max(currentIndex + delta, 0), triggers.length - 1);
  if (nextIndex === currentIndex) return;
  currentIndex = nextIndex;
  renderCurrent();
}

function openFrom(trigger) {
  ensureModal();
  triggers = visibleTriggers();
  currentIndex = triggers.indexOf(trigger);
  if (currentIndex < 0) {
    triggers = [trigger];
    currentIndex = 0;
  }
  opener = trigger;
  renderCurrent();
  modalInstance.show();
}

export function bindPhotoLightbox() {
  if (bound) return;
  bound = true;

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-photo-view]");
    if (!trigger) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!window.bootstrap || !window.bootstrap.Modal) return;
    event.preventDefault();
    openFrom(trigger);
  });

  document.addEventListener("keydown", (event) => {
    if (!modalElement || !modalElement.classList.contains("show")) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    }
  });
}
