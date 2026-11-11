import { state } from "../core/store.js";
import { sb } from "../core/api.js";
import { PHOTO_MAX_SIZE, PHOTO_QUALITY, PHOTO_BUCKET } from "../core/config.js";
import { esc, toast } from "../lib/dom.js";
import { getTodayDate } from "../lib/format.js";

export function renderSelfiePreview() {
  if (state.selfieData) {
    return '<img src="' + esc(state.selfieData) + '" alt="Preview selfie" />';
  }
  return (
    '<div class="text-center small">Preview selfie akan muncul di sini<br />' +
    '<span class="text-secondary">Ambil dari kamera atau upload foto</span></div>'
  );
}

export function updateSelfieUi() {
  const box = document.getElementById("selfie-preview-box");
  if (box) {
    box.classList.remove("d-none");
    box.innerHTML = renderSelfiePreview();
  }
  const stat = document.getElementById("selfie-stat");
  if (stat) stat.textContent = state.selfieData ? "Siap" : "Kosong";
  const clear = document.getElementById("clear-photo-btn");
  if (clear) clear.classList.toggle("d-none", !state.selfieData);
}

function cameraErrorMessage(error) {
  const name = (error && error.name) || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Browser menolak akses kamera. Izinkan kamera lalu coba lagi.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Tidak ada kamera yang terdeteksi di perangkat ini.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.";
  }
  return (error && error.message) || "Kamera tidak dapat dibuka.";
}

export async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast("Browser ini tidak mendukung kamera langsung. Gunakan Kamera Perangkat.", "warning");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false
    });
    state.cameraStream = stream;
    const video = document.getElementById("selfie-video");
    const box = document.getElementById("selfie-preview-box");
    if (!video) {
      stream.getTracks().forEach((track) => track.stop());
      state.cameraStream = null;
      return;
    }
    video.srcObject = stream;
    video.classList.remove("d-none");
    if (box) box.classList.add("d-none");
    try {
      await video.play();
    } catch (error) {}
    const cameraBtn = document.getElementById("camera-btn");
    if (cameraBtn) cameraBtn.textContent = "Tutup Kamera";
    const captureBtn = document.getElementById("capture-btn");
    if (captureBtn) captureBtn.classList.remove("d-none");
    toast("Kamera aktif. Tekan Ambil Foto.", "info");
  } catch (error) {
    toast(cameraErrorMessage(error), "danger");
  }
}

export function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
  }
  const video = document.getElementById("selfie-video");
  if (video) {
    video.srcObject = null;
    video.classList.add("d-none");
  }
  const box = document.getElementById("selfie-preview-box");
  if (box) {
    box.classList.remove("d-none");
    box.innerHTML = renderSelfiePreview();
  }
  const cameraBtn = document.getElementById("camera-btn");
  if (cameraBtn) cameraBtn.textContent = "Kamera Browser";
  const captureBtn = document.getElementById("capture-btn");
  if (captureBtn) captureBtn.classList.add("d-none");
}

export function capturePhoto() {
  const video = document.getElementById("selfie-video");
  if (!video || !video.videoWidth) {
    toast("Kamera belum siap. Tunggu sebentar lalu coba lagi.", "danger");
    return;
  }
  const canvas = document.createElement("canvas");
  let width = video.videoWidth;
  let height = video.videoHeight;
  if (width > height && width > PHOTO_MAX_SIZE) {
    height = Math.round((height * PHOTO_MAX_SIZE) / width);
    width = PHOTO_MAX_SIZE;
  } else if (height >= width && height > PHOTO_MAX_SIZE) {
    width = Math.round((width * PHOTO_MAX_SIZE) / height);
    height = PHOTO_MAX_SIZE;
  }
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(video, 0, 0, width, height);
  canvas.toBlob(
    (blob) => {
      state.selfieData = canvas.toDataURL("image/jpeg", PHOTO_QUALITY);
      state.selfieBlob = blob;
      stopCamera();
      updateSelfieUi();
      toast("Foto berhasil diambil.", "success");
    },
    "image/jpeg",
    PHOTO_QUALITY
  );
}

export function handlePhotoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!/^image\//.test(file.type)) {
    toast("File harus berupa gambar.", "danger");
    event.target.value = "";
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    toast("Ukuran foto maksimal 8 MB.", "danger");
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      let width = image.width;
      let height = image.height;
      if (width > height && width > PHOTO_MAX_SIZE) {
        height = Math.round((height * PHOTO_MAX_SIZE) / width);
        width = PHOTO_MAX_SIZE;
      } else if (height >= width && height > PHOTO_MAX_SIZE) {
        width = Math.round((width * PHOTO_MAX_SIZE) / height);
        height = PHOTO_MAX_SIZE;
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(image, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          state.selfieData = canvas.toDataURL("image/jpeg", PHOTO_QUALITY);
          state.selfieBlob = blob;
          stopCamera();
          updateSelfieUi();
          toast("Foto berhasil dipilih.", "success");
        },
        "image/jpeg",
        PHOTO_QUALITY
      );
    };
    image.onerror = () => toast("Gagal membaca gambar.", "danger");
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
  event.target.value = "";
}

export async function uploadPhoto(blob, kind) {
  const today = getTodayDate();
  const path = state.user.id + "/" + today + "_" + kind + "_" + Date.now() + ".jpg";
  const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false
  });
  if (error) throw new Error("Gagal mengunggah foto: " + error.message);
  const { data } = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

function storagePathFromUrl(url) {
  if (!url) return null;
  const marker = "/storage/v1/object/public/" + PHOTO_BUCKET + "/";
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

export async function removePhotos(urls) {
  const paths = (urls || []).map(storagePathFromUrl).filter(Boolean);
  if (!paths.length) return;
  try {
    await sb.storage.from(PHOTO_BUCKET).remove(paths);
  } catch (error) {}
}
