import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f2e9", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 },
  heroCard: {
    backgroundColor: "#0f172a",
    borderRadius: 28,
    padding: 24,
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 },
  headerCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  headerActions: { alignItems: "flex-end", gap: 8 },
  headerActionButton: { minWidth: 148 },
  headerMetaRow: { marginTop: 10, gap: 8 },
  headerMenuButton: { alignSelf: "flex-start", minHeight: 42, paddingVertical: 10, paddingHorizontal: 14 },
  headerStatusText: { color: "#475569", lineHeight: 20 },
  voiceStatusText: { fontSize: 12, fontWeight: "700" },
  voiceStatusReady: { color: "#0f766e" },
  voiceStatusWarning: { color: "#92400e" },
  chatAppHeader: {
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 2
  },
  chatAppHeaderCopy: { flex: 1, minWidth: 0, gap: 2 },
  chatAppHeaderTitle: { fontSize: 23, lineHeight: 26, fontWeight: "800", color: "#0f172a" },
  chatAppHeaderSubtitle: { color: "#64748b", fontSize: 12, lineHeight: 16 },
  chatAppHeaderActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconButton: {
    minWidth: 42,
    height: 42,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.88)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)"
  },
  iconButtonLabel: { color: "#0f172a", fontWeight: "800", fontSize: 13 },
  warningIconButton: { backgroundColor: "#fef3c7" },
  topPanel: {
    backgroundColor: "rgba(255,255,255,0.74)",
    borderRadius: 24,
    padding: 12,
    gap: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)"
  },
  eyebrow: { color: "#99f6e4", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "800", fontSize: 12 },
  heroTitle: { fontSize: 31, lineHeight: 34, fontWeight: "800", color: "#f8fafc" },
  brand: { fontSize: 31, lineHeight: 34, fontWeight: "800", color: "#0f172a" },
  heroBody: { color: "#dbe4f0", lineHeight: 22, fontSize: 15 },
  subtitle: { color: "#475569", marginTop: 2, fontSize: 15 },
  nav: { flexDirection: "row", gap: 8 },
  topActions: { flexDirection: "row", gap: 8 },
  navButton: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "#e8ecf2",
    paddingVertical: 12,
    alignItems: "center"
  },
  navButtonActive: { backgroundColor: "#0f172a" },
  navLabel: { color: "#334155", fontWeight: "700" },
  navLabelActive: { color: "#ffffff" },
  content: { gap: 14, paddingBottom: 28, flexGrow: 1 },
  screenContent: { flex: 1, gap: 14, paddingBottom: 12, minHeight: 0 },
  chatScreen: { flex: 1, minHeight: 0, gap: 8 },
  chatScrollArea: { flex: 1, minHeight: 0 },
  chatScrollContent: { gap: 10, paddingBottom: 8, flexGrow: 1 },
  card: {
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: 24,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)"
  },
  sessionCard: { backgroundColor: "rgba(255,255,255,0.9)" },
  sectionTitle: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  supportingText: { color: "#475569", lineHeight: 21 },
  metric: { color: "#334155", lineHeight: 21 },
  rootPath: { color: "#0f172a", fontFamily: "monospace", backgroundColor: "#f8fafc", borderRadius: 14, padding: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  preferenceCopy: { flex: 1, paddingRight: 14, gap: 2 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  statusChipTeal: { backgroundColor: "#ccfbf1" },
  statusChipOrange: { backgroundColor: "#ffedd5" },
  statusChipLabel: { fontWeight: "800", fontSize: 12 },
  statusChipLabelTeal: { color: "#0f766e" },
  statusChipLabelOrange: { color: "#c2410c" },
  primaryButton: {
    backgroundColor: "#0f172a",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    minHeight: 50,
    justifyContent: "center"
  },
  primaryLabel: { color: "#ffffff", fontWeight: "800" },
  secondaryButton: {
    backgroundColor: "#dbeafe",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    minHeight: 50,
    justifyContent: "center"
  },
  topActionButton: { width: "100%" },
  secondaryLabel: { color: "#1d4ed8", fontWeight: "800" },
  warningButton: { backgroundColor: "#fef3c7" },
  warningButtonLabel: { color: "#92400e" },
  dangerButton: { backgroundColor: "#fee2e2" },
  dangerButtonLabel: { color: "#b91c1c" },
  disabledButton: { opacity: 0.45 },
  disconnectButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffedd5",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  disconnectLabel: { color: "#c2410c", fontWeight: "800" },
  error: { color: "#b91c1c", fontWeight: "600" },
  inputGroup: { gap: 6 },
  inputLabel: { color: "#334155", fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.1)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#0f172a",
    backgroundColor: "#fffdf8"
  },
  inputMultiline: {
    minHeight: 96,
    paddingTop: 14
  },
  chatSummaryCard: { paddingVertical: 14, gap: 8, flexShrink: 1 },
  chatSummaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  chatSummaryCopy: { flex: 1, gap: 8, minWidth: 0 },
  chatSummaryMeta: { alignItems: "flex-end", gap: 8 },
  chatSummaryBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chatSummaryTitle: { fontSize: 18, lineHeight: 22, fontWeight: "800", color: "#0f172a" },
  chatSummaryMetaLine: { color: "#64748b", lineHeight: 18, fontSize: 12 },
  chatChromeCard: { paddingVertical: 12, gap: 8 },
  chatResumeButton: { alignSelf: "flex-start", minHeight: 40, paddingVertical: 10, paddingHorizontal: 14 },
  messages: { gap: 8 },
  voiceSessionCard: { gap: 10, paddingVertical: 14 },
  voiceSessionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  voiceSessionCopy: { flex: 1, gap: 4 },
  voiceMeterTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#dbeafe",
    overflow: "hidden"
  },
  voiceMeterFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#0f766e"
  },
  voicePreviewLabel: { color: "#1d4ed8", fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.7 },
  voiceMetrics: { color: "#475569", fontSize: 12, lineHeight: 18 },
  chatComposerCard: { marginTop: 2, padding: 10, gap: 8 },
  insetCard: {
    backgroundColor: "#fffdf8",
    borderRadius: 18,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)"
  },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#e2e8f0"
  },
  optionChipActive: { backgroundColor: "#0f172a" },
  optionChipLabel: { color: "#334155", fontWeight: "700", fontSize: 12 },
  optionChipLabelActive: { color: "#ffffff" },
  helperText: { color: "#64748b", fontSize: 12, lineHeight: 18 },
  messageBubble: {
    borderRadius: 22,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)"
  },
  userBubble: { backgroundColor: "#ccfbf1" },
  assistantBubble: { backgroundColor: "rgba(255,255,255,0.9)" },
  messageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  messageRole: { fontWeight: "700", color: "#0f172a" },
  messageTime: { color: "#64748b", fontSize: 12 },
  messageBlock: { gap: 8 },
  messageText: { color: "#334155", lineHeight: 21 },
  messageCodeBlock: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    padding: 12
  },
  messageCodeText: { color: "#e2e8f0", fontFamily: "monospace", lineHeight: 20 },
  messageMeta: { color: "#64748b", fontSize: 12 },
  composer: {
    minHeight: 72,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.1)",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0f172a",
    backgroundColor: "#fffdf8"
  },
  composerCompact: { minHeight: 60, maxHeight: 104 },
  actions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  chatActions: { flexDirection: "column" },
  chatActionButton: { width: "100%" },
  chatComposerActions: { flexDirection: "row" },
  chatComposerActionButton: { flex: 1 },
  banner: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1
  },
  errorBanner: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca"
  },
  infoBanner: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe"
  },
  bannerLabel: {
    fontWeight: "700"
  },
  errorBannerLabel: {
    color: "#b91c1c"
  },
  infoBannerLabel: {
    color: "#1d4ed8"
  },
  operatorBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#ccfbf1",
    color: "#0f766e",
    fontWeight: "800",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12
  },
  kindBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#e5eef9",
    color: "#1d4a78",
    fontWeight: "800",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12
  },
  pinnedBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#ffedd5",
    color: "#c2410c",
    fontWeight: "800",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12
  },
  styleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
    fontWeight: "800",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12
  }
});
