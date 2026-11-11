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
  checkoutTimer: null,
  selfieData: "",
  selfieBlob: null,
  cameraStream: null,
  note: "",
  currentLocation: "",
  currentLat: null,
  currentLng: null,
  locationAccuracy: null,
  locationStatus: "idle",
  locationError: "",
  locationAt: 0,
  attendanceSubmitting: false,
  suggestions: [],
  suggestionSummary: null,
  suggestionLoading: false,
  suggestionError: "",
  suggestionLoadedFor: "",
  suggestionDraft: "",
  suggestionCategory: "umum",
  ui: {
    tab: "attendance",
    search: "",
    date: "",
    status: "",
    attendancePage: 1,
    userPage: 1,
    userSearch: "",
    userRole: "",
    historyMonth: "",
    suggestionStatus: "",
    suggestionSearch: "",
    suggestionPage: 1,
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
  if (state.checkoutTimer) clearInterval(state.checkoutTimer);
  state.checkoutTimer = null;
  state.selfieData = "";
  state.selfieBlob = null;
  state.note = "";
  state.currentLocation = "";
  state.currentLat = null;
  state.currentLng = null;
  state.locationAccuracy = null;
  state.locationStatus = "idle";
  state.locationError = "";
  state.locationAt = 0;
  state.attendanceSubmitting = false;
  state.suggestions = [];
  state.suggestionSummary = null;
  state.suggestionLoading = false;
  state.suggestionError = "";
  state.suggestionLoadedFor = "";
  state.suggestionDraft = "";
  state.suggestionCategory = "umum";
  state.ui.tab = "attendance";
  state.ui.search = "";
  state.ui.date = "";
  state.ui.status = "";
  state.ui.attendancePage = 1;
  state.ui.userPage = 1;
  state.ui.userSearch = "";
  state.ui.userRole = "";
  state.ui.historyMonth = "";
  state.ui.suggestionStatus = "";
  state.ui.suggestionSearch = "";
  state.ui.suggestionPage = 1;
  state.ui.sidebarOpen = false;
}
