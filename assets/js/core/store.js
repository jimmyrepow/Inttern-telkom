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
  leaves: [],
  corrections: [],
  announcements: [],
  adminAnnouncements: [],
  announcementsLoadedFor: "",
  announcementsLoading: false,
  announcementsError: "",
  adminAchievements: null,
  adminAchievementsLoading: false,
  adminAchievementsError: "",
  adminAchievementsLoadedFor: "",
  logs: [],
  logsTotal: 0,
  logsLoading: false,
  logsError: "",
  logsLoadedKey: "",
  offlineQueueCount: 0,
  online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  suggestions: [],
  suggestionSummary: null,
  suggestionLoading: false,
  suggestionError: "",
  suggestionLoadedFor: "",
  suggestionDraft: "",
  suggestionCategory: "umum",
  leaderboardRows: [],
  leaderboardLoading: false,
  leaderboardLoadingKey: "",
  leaderboardError: "",
  leaderboardLoadedMonth: "",
  leaderboardGeneratedAt: "",
  farmProfile: null,
  farmSeeds: [],
  farmPlots: [],
  farmRecentSteals: [],
  farmServerNow: "",
  farmServerOffset: 0,
  farmLoading: false,
  farmError: "",
  farmLoadedFor: "",
  farmTick: null,
  farmSelectedPlot: 0,
  farmAction: "",
  farmTargets: [],
  farmTargetsInfo: null,
  farmTargetsLoading: false,
  farmTargetsError: "",
  farmTargetsLoadedFor: "",
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
    leaderboardMonth: "",
    approvalKind: "leave",
    approvalStatus: "pending",
    approvalSearch: "",
    approvalPage: 1,
    announcementSearch: "",
    announcementStatus: "",
    announcementPage: 1,
    logAction: "",
    logSearch: "",
    logPage: 1,
    analyticsMonth: "",
    leavesTab: "izin",
    sidebarOpen: false
  }
};

export function invalidateAdminAchievements() {
  state.adminAchievements = null;
  state.adminAchievementsLoading = false;
  state.adminAchievementsError = "";
  state.adminAchievementsLoadedFor = "";
}

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
  state.leaves = [];
  state.corrections = [];
  state.announcements = [];
  state.adminAnnouncements = [];
  state.announcementsLoadedFor = "";
  state.announcementsLoading = false;
  state.announcementsError = "";
  state.adminAchievements = null;
  state.adminAchievementsLoading = false;
  state.adminAchievementsError = "";
  state.adminAchievementsLoadedFor = "";
  state.logs = [];
  state.logsTotal = 0;
  state.logsLoading = false;
  state.logsError = "";
  state.logsLoadedKey = "";
  state.offlineQueueCount = 0;
  state.suggestions = [];
  state.suggestionSummary = null;
  state.suggestionLoading = false;
  state.suggestionError = "";
  state.suggestionLoadedFor = "";
  state.suggestionDraft = "";
  state.suggestionCategory = "umum";
  state.leaderboardRows = [];
  state.leaderboardLoading = false;
  state.leaderboardLoadingKey = "";
  state.leaderboardError = "";
  state.leaderboardLoadedMonth = "";
  state.leaderboardGeneratedAt = "";
  if (state.farmTick) clearInterval(state.farmTick);
  state.farmTick = null;
  state.farmProfile = null;
  state.farmSeeds = [];
  state.farmPlots = [];
  state.farmRecentSteals = [];
  state.farmServerNow = "";
  state.farmServerOffset = 0;
  state.farmLoading = false;
  state.farmError = "";
  state.farmLoadedFor = "";
  state.farmSelectedPlot = 0;
  state.farmAction = "";
  state.farmTargets = [];
  state.farmTargetsInfo = null;
  state.farmTargetsLoading = false;
  state.farmTargetsError = "";
  state.farmTargetsLoadedFor = "";
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
  state.ui.leaderboardMonth = "";
  state.ui.approvalKind = "leave";
  state.ui.approvalStatus = "pending";
  state.ui.approvalSearch = "";
  state.ui.approvalPage = 1;
  state.ui.announcementSearch = "";
  state.ui.announcementStatus = "";
  state.ui.announcementPage = 1;
  state.ui.logAction = "";
  state.ui.logSearch = "";
  state.ui.logPage = 1;
  state.ui.analyticsMonth = "";
  state.ui.leavesTab = "izin";
  state.ui.sidebarOpen = false;
}
