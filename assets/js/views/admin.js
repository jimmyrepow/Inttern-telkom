import { state } from "../core/store.js";
import { renderGuide } from "./guide.js";
import { renderAdminDashboard, attachAdminDashboard } from "./admin/dashboard.js";
import { renderAdminUsersTab, attachAdminUsers } from "./admin/users.js";
import { renderAdminSettingsTab, attachAdminSettings } from "./admin/settings.js";
import { renderApprovals, attachApprovalsEvents } from "./admin/approvals.js";
import { renderLogs, attachLogsEvents } from "./admin/logs.js";
import { renderAnalytics, attachAnalyticsEvents } from "./analytics.js";

export function renderAdmin() {
  if (state.ui.tab === "guide") return renderGuide("admin");
  if (state.ui.tab === "users") return renderAdminUsersTab();
  if (state.ui.tab === "settings") return renderAdminSettingsTab();
  if (state.ui.tab === "approvals") return renderApprovals();
  if (state.ui.tab === "logs") return renderLogs();
  if (state.ui.tab === "analytics") return renderAnalytics();
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
    return;
  }
  if (state.ui.tab === "approvals") {
    attachApprovalsEvents(context);
    return;
  }
  if (state.ui.tab === "logs") {
    attachLogsEvents(context);
    return;
  }
  if (state.ui.tab === "analytics") {
    attachAnalyticsEvents(context);
  }
}
