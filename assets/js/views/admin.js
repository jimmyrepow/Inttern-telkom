import { state } from "../core/store.js";
import { renderGuide } from "./guide.js";
import { renderAdminDashboard, attachAdminDashboard } from "./admin/dashboard.js";
import { renderAdminUsersTab, attachAdminUsers } from "./admin/users.js";
import { renderAdminSettingsTab, attachAdminSettings } from "./admin/settings.js";

export function renderAdmin() {
  if (state.ui.tab === "guide") return renderGuide("admin");
  if (state.ui.tab === "users") return renderAdminUsersTab();
  if (state.ui.tab === "settings") return renderAdminSettingsTab();
  return renderAdminDashboard();
}

export function attachAdminEvents(context) {
  if (state.ui.tab === "attendance") {
    attachAdminDashboard(context);
    return;
  }
  if (state.ui.tab === "users") {
    attachAdminUsers(context);
    return;
  }
  if (state.ui.tab === "settings") {
    attachAdminSettings(context);
  }
}
