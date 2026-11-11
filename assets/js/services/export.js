import { state } from "../core/store.js";
import { rpc, handleError } from "../core/api.js";
import { toast, withBusy } from "../lib/dom.js";
import { getTodayDate } from "../lib/format.js";

export async function exportData(button) {
  if (!state.token) {
    handleError(new Error("Sesi tidak ditemukan. Silakan login ulang."));
    return;
  }
  const restore = withBusy(button, "Membuat Excel...");
  try {
    const data = await rpc("app_export_data");
    if (typeof XLSX === "undefined") {
      throw new Error("Library Excel belum termuat. Muat ulang halaman.");
    }
    const workbook = XLSX.utils.book_new();
    const settingsRows = Object.keys(data.settings || {}).map((key) => ({
      key,
      value: data.settings[key]
    }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.users || []), "Users");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(data.attendance || []),
      "Attendance"
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(settingsRows),
      "Settings"
    );
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.logs || []), "Logs");
    XLSX.writeFile(workbook, "TELKOM_AKSES_" + getTodayDate() + ".xlsx");
    toast("File Excel berhasil dibuat.", "success");
  } catch (error) {
    handleError(error);
  } finally {
    restore();
  }
}
