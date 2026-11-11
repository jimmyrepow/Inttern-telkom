import { state } from "../core/store.js";
import { rpc, handleError } from "../core/api.js";
import { toast, withBusy, confirmDialog } from "../lib/dom.js";
import { getTodayDate, shortTime, formatDateTime } from "../lib/format.js";

const EXCELJS_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
const HEADER_FILL = "FF0F172A";
const BORDER_COLOR = "FFE2E8F0";
let excelJsPromise = null;

function loadExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (excelJsPromise) return excelJsPromise;

  excelJsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-exceljs-loader]");
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.src = EXCELJS_URL;
    script.async = true;
    script.dataset.exceljsLoader = "true";
    script.onload = () => {
      if (window.ExcelJS) resolve(window.ExcelJS);
      else reject(new Error("Library ExcelJS tidak tersedia setelah dimuat."));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Gagal memuat library ExcelJS. Periksa koneksi internet."));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    excelJsPromise = null;
    throw error;
  });

  return excelJsPromise;
}

function setStatus(element, message) {
  if (element) element.textContent = message || "";
}

function styleHeaderRow(row) {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: HEADER_FILL } }
    };
  });
}

function styleBodySheet(sheet, columnCount) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnCount }
  };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        bottom: { style: "hair", color: { argb: BORDER_COLOR } }
      };
    });
  });
}

function addSimpleSheet(workbook, name, rows) {
  const sheet = workbook.addWorksheet(name);
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    sheet.addRow(["Tidak ada data"]);
    styleHeaderRow(sheet.getRow(1));
    sheet.getColumn(1).width = 30;
    return sheet;
  }

  const keys = Array.from(
    list.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );
  sheet.columns = keys.map((key) => ({
    header: key,
    key,
    width: Math.min(42, Math.max(12, String(key).length + 6))
  }));
  sheet.addRows(list);
  styleHeaderRow(sheet.getRow(1));
  styleBodySheet(sheet, keys.length);
  return sheet;
}

function statusLabel(status) {
  if (status === "late") return "Telat";
  if (status === "on-time") return "Tepat waktu";
  return status || "-";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Gagal membaca foto."));
    reader.readAsDataURL(blob);
  });
}

async function fetchPhotoBase64(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type || blob.type.indexOf("image/") !== 0) return null;
    const dataUrl = await blobToDataUrl(blob);
    return {
      base64: dataUrl,
      extension: dataUrl.indexOf("data:image/png") === 0 ? "png" : "jpeg"
    };
  } catch (error) {
    console.warn("Foto tidak dapat ditanamkan ke Excel:", url, error);
    return null;
  }
}

async function addAttendanceSheet(workbook, data, statusElement) {
  const users = new Map(
    (data.users || []).map((user) => [String(user.id), String(user.username || "")])
  );
  const rows = data.attendance || [];
  const sheet = workbook.addWorksheet("Absensi");
  sheet.columns = [
    { header: "Tanggal", key: "date", width: 12 },
    { header: "Nama", key: "name", width: 24 },
    { header: "Username", key: "username", width: 16 },
    { header: "Masuk", key: "checkIn", width: 10 },
    { header: "Pulang", key: "checkOut", width: 10 },
    { header: "Status", key: "status", width: 14 },
    { header: "Lokasi", key: "location", width: 32 },
    { header: "Catatan", key: "note", width: 28 },
    { header: "Foto Masuk", key: "photoIn", width: 15 },
    { header: "Foto Pulang", key: "photoOut", width: 15 }
  ];
  styleHeaderRow(sheet.getRow(1));

  for (let index = 0; index < rows.length; index += 1) {
    const record = rows[index];
    const row = sheet.addRow({
      date: record.date || "",
      name: record.name || "",
      username: users.get(String(record.user_id)) || "",
      checkIn: shortTime(record.check_in),
      checkOut: shortTime(record.check_out),
      status: statusLabel(record.status),
      location: record.location || "",
      note: record.note || "",
      photoIn: record.photo_url ? "" : "-",
      photoOut: record.photo_out_url ? "" : "-"
    });
    row.height = 44;
    row.getCell("status").alignment = { vertical: "middle", horizontal: "center" };
    row.getCell("date").alignment = { vertical: "middle", horizontal: "center" };
    row.getCell("checkIn").alignment = { vertical: "middle", horizontal: "center" };
    row.getCell("checkOut").alignment = { vertical: "middle", horizontal: "center" };
    row.getCell("photoIn").alignment = { vertical: "middle", horizontal: "center" };
    row.getCell("photoOut").alignment = { vertical: "middle", horizontal: "center" };

    if (record.photo_url || record.photo_out_url) {
      setStatus(
        statusElement,
        "Menanamkan foto " + (index + 1) + "/" + rows.length + "..."
      );
    }

    if (record.photo_url) {
      const photo = await fetchPhotoBase64(record.photo_url);
      if (photo) {
        const imageId = workbook.addImage(photo);
        sheet.addImage(imageId, {
          tl: {
            col: sheet.getColumn("photoIn").number - 1 + 0.08,
            row: row.number - 1 + 0.08
          },
          ext: { width: 52, height: 52 },
          editAs: "oneCell"
        });
      } else {
        row.getCell("photoIn").value = "Gagal dimuat";
      }
    }

    if (record.photo_out_url) {
      const photo = await fetchPhotoBase64(record.photo_out_url);
      if (photo) {
        const imageId = workbook.addImage(photo);
        sheet.addImage(imageId, {
          tl: {
            col: sheet.getColumn("photoOut").number - 1 + 0.08,
            row: row.number - 1 + 0.08
          },
          ext: { width: 52, height: 52 },
          editAs: "oneCell"
        });
      } else {
        row.getCell("photoOut").value = "Gagal dimuat";
      }
    }
  }

  styleBodySheet(sheet, 10);
  return sheet;
}

function buildUserRows(users) {
  return (users || []).map((user) => ({
    Username: user.username || "",
    Nama: user.name || "",
    Role: user.role || "",
    Status: user.active === false ? "Nonaktif" : "Aktif",
    "Avatar emoji": user.avatar_emoji || "",
    "Warna avatar": user.avatar_color || "",
    "Login terakhir": formatDateTime(user.last_login_at),
    "Password diubah": formatDateTime(user.password_updated_at),
    "Dibuat": formatDateTime(user.created_at)
  }));
}

function buildSettingsRows(settings) {
  return Object.keys(settings || {}).map((key) => ({
    Key: key,
    Value:
      settings[key] === null || settings[key] === undefined
        ? ""
        : String(settings[key])
  }));
}

function downloadBlob(buffer, filename) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function exportWithExcelJs(data, statusElement) {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TELKOM AKSES INTERNSHIP";
  workbook.created = new Date();

  setStatus(statusElement, "Menyiapkan worksheet absensi...");
  await addAttendanceSheet(workbook, data, statusElement);

  setStatus(statusElement, "Menyiapkan akun, pengaturan, dan log...");
  addSimpleSheet(workbook, "Akun", buildUserRows(data.users));
  addSimpleSheet(workbook, "Pengaturan", buildSettingsRows(data.settings));
  addSimpleSheet(workbook, "Log", data.logs);

  setStatus(statusElement, "Menyusun file Excel...");
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, "TELKOM_AKSES_" + getTodayDate() + ".xlsx");
}

function exportWithXlsxFallback(data) {
  if (typeof XLSX === "undefined") {
    throw new Error("Library Excel belum termuat. Muat ulang halaman.");
  }
  const workbook = XLSX.utils.book_new();
  const settingsRows = Object.keys(data.settings || {}).map((key) => ({
    key,
    value: data.settings[key]
  }));
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildUserRows(data.users)),
    "Akun"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.attendance || []),
    "Absensi"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(settingsRows),
    "Pengaturan"
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.logs || []), "Log");
  XLSX.writeFile(workbook, "TELKOM_AKSES_" + getTodayDate() + ".xlsx");
}

export async function exportData(button, statusElement) {
  if (!state.token) {
    handleError(new Error("Sesi tidak ditemukan. Silakan login ulang."));
    return;
  }

  const confirmed = await confirmDialog({
    title: "Export data Excel?",
    message:
      "File berisi akun, absensi, pengaturan, log, dan foto absensi akan dibuat dan diunduh.",
    confirmLabel: "Buat file Excel",
    tone: "primary",
    secondMessage:
      "Data bersifat internal. Jangan membagikan file ini ke pihak yang tidak berwenang."
  });
  if (!confirmed) return;

  const restore = withBusy(button, "Membuat Excel...");
  setStatus(statusElement, "Mengambil data dari server...");
  try {
    const data = await rpc("app_export_data");
    try {
      await exportWithExcelJs(data, statusElement);
      toast("File Excel dengan foto berhasil dibuat.", "success");
    } catch (error) {
      console.warn("Export ExcelJS gagal, memakai fallback XLSX:", error);
      exportWithXlsxFallback(data);
      toast(
        "Excel dengan foto gagal dibuat, file tanpa gambar tetap diunduh. " +
          String((error && error.message) || ""),
        "warning"
      );
    }
    setStatus(statusElement, "File Excel berhasil dibuat.");
  } catch (error) {
    setStatus(statusElement, "Export gagal.");
    handleError(error);
  } finally {
    restore();
  }
}
