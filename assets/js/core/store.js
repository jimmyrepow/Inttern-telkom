export const state = {
  page: "loading",
  token: "",
  user: null,
  users: [],
  attendance: [],
  settings: {},
  stats: null,
  lastSyncAt: "",
  syncError: "",
  refreshing: null,
  timer: null,
  selfieData: "",
  selfieBlob: null,
  cameraStream: null,
  note: "",
  currentLocation: "",
  locationAccuracy: null,
  ui: {
    tab: "attendance",
    search: "",
    date: "",
    status: "",
    userFormId: "",
    sidebarOpen: false
  }
};

export function resetSessionState() {
  state.token = "";
  state.user = null;
  state.users = [];
  state.attendance = [];
  state.settings = {};
  state.stats = null;
  state.lastSyncAt = "";
  state.syncError = "";
  state.selfieData = "";
  state.selfieBlob = null;
  state.note = "";
  state.currentLocation = "";
  state.locationAccuracy = null;
  state.ui.tab = "attendance";
  state.ui.search = "";
  state.ui.date = "";
  state.ui.status = "";
  state.ui.userFormId = "";
  state.ui.sidebarOpen = false;
}
