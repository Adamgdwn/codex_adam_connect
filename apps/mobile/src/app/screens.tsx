import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { PROJECT_TEMPLATES, humanizeResponseStyle } from "@adam-connect/shared";
import type { AppState } from "../store/appStore";
import type { TtsVoiceOption } from "../services/voice/ttsService";
import { findManualStopTargetSession, findSendTargetSession, findStopTargetSession, formatMessageTimestamp, isOperatorSession, isSessionBusy } from "../utils/operatorConsole";
import { Banner, LabeledInput, MessageBubble, StatusChip, VoiceSessionPanel } from "./components";
import { styles } from "./mobileStyles";

const keyboardDismissMode: "interactive" | "on-drag" = Platform.OS === "ios" ? "interactive" : "on-drag";
export const refreshScrollInteractionProps = {
  alwaysBounceVertical: true,
  keyboardShouldPersistTaps: "always" as const,
  keyboardDismissMode,
  overScrollMode: "always" as const
};

export function PairingScreen(props: {
  store: AppState;
  keyboardHeight: number;
  insetBottom: number;
}): React.JSX.Element {
  const { store, keyboardHeight, insetBottom } = props;

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insetBottom, 16) + keyboardHeight + 12 }]}
      {...refreshScrollInteractionProps}
    >
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Pair Over Tailscale</Text>
        <Text style={styles.heroTitle}>Adam Connect</Text>
        <Text style={styles.heroBody}>
          Turn this phone into a private Codex console for your desktop. Pair once, keep API keys off the device,
          and use voice or text from anywhere on your tailnet.
        </Text>
      </View>

      {store.notice ? <Banner text={store.notice} tone="info" /> : null}
      {store.error ? <Banner text={store.error} tone="error" /> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Connect</Text>
        <LabeledInput label="Desktop URL" value={store.baseUrl} onChange={(value) => store.setField("baseUrl", value)} />
        {store.baseUrl ? <Text style={styles.supportingText}>Desktop URL is pre-filled for this host.</Text> : null}
        <LabeledInput label="Device Name" value={store.deviceName} onChange={(value) => store.setField("deviceName", value)} />
        <LabeledInput
          label="Pairing Code"
          value={store.pairingCode}
          onChange={(value) => store.setField("pairingCode", value)}
          autoCapitalize="characters"
        />
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            store.connectPairing().catch((error) => console.warn(error));
          }}
        >
          <Text style={styles.primaryLabel}>Pair Phone</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Need Tailscale?</Text>
        <Text style={styles.supportingText}>
          Adam Connect can help you get started, but it cannot silently enroll devices into your tailnet.
        </Text>
        <Text style={styles.metric}>1. Install Tailscale on this phone and on your desktop.</Text>
        <Text style={styles.metric}>2. Sign both devices into the same Tailscale account.</Text>
        <Text style={styles.metric}>3. Use the desktop Tailscale URL in the Desktop URL field.</Text>
        <View style={styles.actions}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              Linking.openURL("https://tailscale.com/download").catch((error) => console.warn(error));
            }}
          >
            <Text style={styles.secondaryLabel}>Get Tailscale</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              Linking.openURL("https://login.tailscale.com/start").catch((error) => console.warn(error));
            }}
          >
            <Text style={styles.secondaryLabel}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

export function HostScreen(props: {
  store: AppState;
  onRefresh(): void;
  insetBottom: number;
}): React.JSX.Element {
  const { store, onRefresh, insetBottom } = props;
  const currentDevice = store.devices.find((device) => device.id === store.currentDeviceId) ?? null;
  const selectedVoice = store.assistantVoices.find((voice) => voice.id === store.selectedAssistantVoiceId) ?? null;
  const outboundEmail = store.hostStatus?.outboundEmail ?? null;
  const wakeConfigured = Boolean(store.wakeControl?.enabled);
  const hostOnline = store.hostStatus?.availability === "ready";

  return (
    <ScrollView
      style={styles.screenContent}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insetBottom, 16) + 16 }]}
      refreshControl={<RefreshControl refreshing={store.refreshing} onRefresh={onRefresh} tintColor="#0f766e" progressViewOffset={12} />}
      {...refreshScrollInteractionProps}
    >
      {store.notice ? <Banner text={store.notice} tone="info" /> : null}
      {store.error ? <Banner text={store.error} tone="error" /> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Host Status</Text>
        <View style={styles.statusRow}>
          <StatusChip label={store.hostStatus?.host.isOnline ? "Desktop online" : "Desktop offline"} tone={store.hostStatus?.host.isOnline ? "teal" : "orange"} />
          <StatusChip
            label={humanizeCodexState(store.hostStatus?.auth.status ?? "logged_out")}
            tone={store.hostStatus?.auth.status === "logged_in" ? "teal" : "orange"}
          />
          <StatusChip label={humanizeAvailability(store.hostStatus?.availability ?? "needs_attention")} tone={store.hostStatus?.availability === "ready" ? "teal" : "orange"} />
        </View>
        <Text style={styles.supportingText}>{store.hostStatus?.auth.detail ?? "Waiting for desktop heartbeat."}</Text>
        <Text style={styles.metric}>Active chats: {store.hostStatus?.activeSessionCount ?? 0}</Text>
        <Text style={styles.metric}>Paired devices: {store.hostStatus?.pairedDeviceCount ?? 0}</Text>
        <Text style={styles.metric}>Run state: {store.hostStatus?.runState ?? "ready"} | Repair: {store.hostStatus?.repairState ?? "healthy"}</Text>
        <Text style={styles.metric}>Realtime link: {store.realtimeConnected ? "connected" : "reconnecting"}</Text>
        <View style={styles.actions}>
          <Pressable style={styles.secondaryButton} onPress={() => store.reconnectRealtime().catch((error) => console.warn(error))}>
            <Text style={styles.secondaryLabel}>Reconnect Realtime</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Tailscale</Text>
        <Text style={styles.metric}>
          Installed: {store.hostStatus?.tailscale.installed ? "yes" : "no"} | Connected: {store.hostStatus?.tailscale.connected ? "yes" : "no"}
        </Text>
        <Text style={styles.supportingText}>{store.hostStatus?.tailscale.detail ?? "No Tailscale status reported yet."}</Text>
        {store.hostStatus?.tailscale.suggestedUrl ? (
          <Text style={styles.rootPath}>Suggested mobile URL: {store.hostStatus.tailscale.suggestedUrl}</Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              Linking.openURL(store.hostStatus?.tailscale.installUrl ?? "https://tailscale.com/download").catch((error) =>
                console.warn(error)
              );
            }}
          >
            <Text style={styles.secondaryLabel}>Install</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              Linking.openURL(store.hostStatus?.tailscale.loginUrl ?? "https://login.tailscale.com/start").catch((error) =>
                console.warn(error)
              );
            }}
          >
            <Text style={styles.secondaryLabel}>Sign In</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Approved Roots</Text>
        {(store.hostStatus?.host.approvedRoots ?? []).map((rootPath) => (
          <Text key={rootPath} style={styles.rootPath}>
            {rootPath}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Voice</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.metric}>Voice available</Text>
          <Text style={styles.metric}>{store.voiceAvailable ? "yes" : "no"}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.metric}>Auto-read replies</Text>
          <Switch value={store.autoSpeak} onValueChange={() => store.toggleAutoSpeak().catch((error) => console.warn(error))} />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.metric}>Auto-send voice turns</Text>
          <Switch value={store.autoSendVoice} onValueChange={() => store.toggleAutoSendVoice().catch((error) => console.warn(error))} />
        </View>
        <View style={styles.insetCard}>
          <Text style={styles.inputLabel}>Spoken Reply Voice</Text>
          <View style={styles.optionGrid}>
            <Pressable
              style={[styles.optionChip, !store.selectedAssistantVoiceId ? styles.optionChipActive : null]}
              onPress={() => store.selectAssistantVoice(null).catch((error) => console.warn(error))}
            >
              <Text style={[styles.optionChipLabel, !store.selectedAssistantVoiceId ? styles.optionChipLabelActive : null]}>Automatic</Text>
            </Pressable>
            {store.assistantVoices.map((voice) => (
              <Pressable
                key={voice.id}
                style={[styles.optionChip, store.selectedAssistantVoiceId === voice.id ? styles.optionChipActive : null]}
                onPress={() => store.selectAssistantVoice(voice.id).catch((error) => console.warn(error))}
              >
                <Text style={[styles.optionChipLabel, store.selectedAssistantVoiceId === voice.id ? styles.optionChipLabelActive : null]}>
                  {voice.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.helperText}>
            {selectedVoice
              ? `Current spoken reply voice: ${describeVoiceOption(selectedVoice)}.`
              : "Automatic uses the phone's best available English voice."}
          </Text>
        </View>
        <View style={styles.insetCard}>
          <Text style={styles.inputLabel}>Reply Style</Text>
          <View style={styles.optionGrid}>
            {responseStyles.map((style) => (
              <Pressable
                key={style.id}
                style={[styles.optionChip, store.responseStyle === style.id ? styles.optionChipActive : null]}
                onPress={() => store.setResponseStyle(style.id).catch((error) => console.warn(error))}
              >
                <Text style={[styles.optionChipLabel, store.responseStyle === style.id ? styles.optionChipLabelActive : null]}>
                  {style.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.helperText}>
            Voice turns and typed sends will use a {humanizeResponseStyle(store.responseStyle)} reply style.
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.secondaryButton} onPress={() => store.testAssistantVoice().catch((error) => console.warn(error))}>
            <Text style={styles.secondaryLabel}>Test Spoken Reply</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Wake Homebase</Text>
        <Text style={styles.supportingText}>
          {wakeConfigured
            ? hostOnline
              ? `${store.wakeControl?.targetLabel ?? "Homebase"} is online. Use wake-on-request when the desktop is asleep and you want Adam Connect back without running the full workstation constantly.`
              : `Wake relay is configured for ${store.wakeControl?.targetLabel ?? "Homebase"}. Tap this when the desktop is asleep and you want the operator console back.`
            : "Wake-on-request is not configured on this desktop yet."}
        </Text>
        {wakeConfigured ? (
          <Pressable
            style={[styles.primaryButton, store.wakeRequesting ? styles.disabledButton : null]}
            disabled={store.wakeRequesting}
            onPress={() => store.triggerWakeHomebase().catch((error) => console.warn(error))}
          >
            <Text style={styles.primaryLabel}>{store.wakeRequesting ? "Waking..." : "Wake Homebase"}</Text>
          </Pressable>
        ) : (
          <Text style={styles.helperText}>
            Add `WAKE_RELAY_BASE_URL`, `WAKE_RELAY_TOKEN`, and `WAKE_RELAY_TARGET_ID` to the desktop `.env`, then refresh this screen.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>External Reports</Text>
        <Text style={styles.supportingText}>
          {outboundEmail?.enabled
            ? `Email delivery is ready from ${outboundEmail.fromAddress}. In chat, use Send externally on a completed Codex reply to email it outside Adam Connect.`
            : store.hostStatus
              ? "External email is not ready in the running desktop process yet. If you just added the Resend env vars, restart Adam Connect on the desktop and refresh this screen."
              : "External email is not configured yet. Add the Resend env vars on the desktop gateway before sending outside Adam Connect."}
        </Text>
        <Text style={styles.metric}>
          Provider: {outboundEmail?.provider ?? "none"} | Trusted recipients: {store.outboundRecipients.length}
        </Text>
        <LabeledInput
          label="Recipient Label"
          value={store.outboundRecipientLabelDraft}
          onChange={(value) => store.setField("outboundRecipientLabelDraft", value)}
          autoCapitalize="sentences"
          placeholder="Weekly report, Adam, client ops..."
        />
        <LabeledInput
          label="Recipient Email"
          value={store.outboundRecipientEmailDraft}
          onChange={(value) => store.setField("outboundRecipientEmailDraft", value)}
          autoCapitalize="none"
          placeholder="name@example.com"
        />
        <Pressable style={styles.secondaryButton} onPress={() => store.addOutboundRecipient().catch((error) => console.warn(error))}>
          <Text style={styles.secondaryLabel}>Add Trusted Recipient</Text>
        </Pressable>
        {store.outboundRecipients.length ? (
          store.outboundRecipients.map((recipient) => (
            <View key={recipient.id} style={styles.insetCard}>
              <Text style={styles.metric}>{recipient.label}</Text>
              <Text style={styles.supportingText}>{recipient.destination}</Text>
              <Pressable
                style={[styles.secondaryButton, styles.dangerButton]}
                onPress={() => store.deleteOutboundRecipient(recipient.id).catch((error) => console.warn(error))}
              >
                <Text style={[styles.secondaryLabel, styles.dangerButtonLabel]}>Remove Recipient</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={styles.helperText}>No trusted outbound recipients yet.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>This Phone</Text>
        <Text style={styles.supportingText}>
          Manage the current device name and Android background updates without leaving the operator console.
        </Text>
        <LabeledInput
          label="Device Name"
          value={store.deviceName}
          onChange={(value) => store.setField("deviceName", value)}
          autoCapitalize="sentences"
        />
        <View style={styles.actions}>
          <Pressable style={styles.secondaryButton} onPress={() => store.renameCurrentDevice().catch((error) => console.warn(error))}>
            <Text style={styles.secondaryLabel}>Rename This Phone</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, store.pushSyncing ? styles.disabledButton : null]}
            disabled={store.pushSyncing}
            onPress={() => store.enablePushNotifications().catch((error) => console.warn(error))}
          >
            <Text style={styles.primaryLabel}>{currentDevice?.pushToken ? "Refresh Android Updates" : "Enable Android Updates"}</Text>
          </Pressable>
        </View>
        <Text style={styles.metric}>
          Push status: {!store.pushAvailable ? "This build does not include Android FCM yet." : currentDevice?.pushToken ? "Enabled" : "Not enabled"}
        </Text>
        {currentDevice ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Android Update Preferences</Text>
            {notificationEvents.map((event) => (
              <View key={event.id} style={styles.rowBetween}>
                <View style={styles.preferenceCopy}>
                  <Text style={styles.metric}>{event.label}</Text>
                  <Text style={styles.supportingText}>{event.description}</Text>
                </View>
                <Switch
                  value={currentDevice.notificationPrefs[event.id]}
                  onValueChange={() => {
                    store.toggleNotificationPreference(event.id).catch((error) => console.warn(error));
                  }}
                />
              </View>
            ))}
            <View style={styles.actions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => store.sendDeviceTestNotification(currentDevice.id, "run_complete").catch((error) => console.warn(error))}
              >
                <Text style={styles.secondaryLabel}>Send Test Update</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Trusted Devices</Text>
        {store.devices.length ? (
          store.devices.map((device) => (
            <View key={device.id} style={[styles.card, styles.sessionCard]}>
              <View style={styles.statusRow}>
                <Text style={device.id === store.currentDeviceId ? styles.operatorBadge : styles.kindBadge}>
                  {device.id === store.currentDeviceId ? "This Phone" : "Trusted Device"}
                </Text>
                {device.pushToken ? <Text style={styles.pinnedBadge}>Push Ready</Text> : null}
              </View>
              <Text style={styles.sectionTitle}>{device.deviceName}</Text>
              <Text style={styles.metric}>Last seen: {formatMessageTimestamp(device.lastSeenAt)}</Text>
              <Text style={styles.metric}>Repairs: {device.repairCount}</Text>
              <View style={styles.actions}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => store.sendDeviceTestNotification(device.id, "run_complete").catch((error) => console.warn(error))}
                >
                  <Text style={styles.secondaryLabel}>Test Update</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryButton, styles.dangerButton]}
                  onPress={() => store.revokeDevice(device.id).catch((error) => console.warn(error))}
                >
                  <Text style={[styles.secondaryLabel, styles.dangerButtonLabel]}>
                    {device.id === store.currentDeviceId ? "Revoke This Phone" : "Revoke"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.metric}>No trusted devices have paired yet.</Text>
        )}
      </View>

      <Pressable style={styles.secondaryButton} onPress={onRefresh}>
        <Text style={styles.secondaryLabel}>Refresh Host</Text>
      </Pressable>
    </ScrollView>
  );
}

export function SessionsScreen(props: {
  store: AppState;
  onRefresh(): void;
  bottomPadding: number;
}): React.JSX.Element {
  const { store, onRefresh, bottomPadding } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const visibleSessions = store.sessions.filter((item) => {
    const haystack = [item.title, item.rootPath, item.lastPreview ?? "", item.kind].join(" ").toLowerCase();
    return haystack.includes(searchQuery.trim().toLowerCase());
  });

  return (
    <ScrollView
      style={styles.screenContent}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      refreshControl={<RefreshControl refreshing={store.refreshing} onRefresh={onRefresh} tintColor="#0f766e" progressViewOffset={12} />}
      {...refreshScrollInteractionProps}
    >
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Project Wizard</Text>
        <Text style={styles.supportingText}>Kick off a persistent project chat with the goal, output, and reply style already set.</Text>
        <Text style={styles.supportingText}>Adam Connect still keeps the default `Operator` chat ready for quick voice turns.</Text>
        <LabeledInput
          label="Find Existing Chats"
          value={searchQuery}
          onChange={setSearchQuery}
          autoCapitalize="none"
        />
        <LabeledInput
          label="Project Name"
          value={store.newSessionTitle}
          onChange={(value) => store.setField("newSessionTitle", value)}
          autoCapitalize="sentences"
          placeholder="Website refresh, Android build cleanup, docs sprint..."
        />
        <LabeledInput
          label="Workspace Root"
          value={store.newSessionRootPath}
          onChange={(value) => store.setField("newSessionRootPath", value)}
        />
        <LabeledInput
          label="Project Goal"
          value={store.projectIntent}
          onChange={(value) => store.setField("projectIntent", value)}
          autoCapitalize="sentences"
          multiline
          placeholder="What are we trying to build, fix, research, or ship from this workspace?"
        />
        <LabeledInput
          label="Desired Output"
          value={store.projectOutputType}
          onChange={(value) => store.setField("projectOutputType", value)}
          autoCapitalize="sentences"
          placeholder="implementation plan, bugfix patch, spec, refactor, release checklist..."
        />
        <LabeledInput
          label="Extra Instructions"
          value={store.projectInstructions}
          onChange={(value) => store.setField("projectInstructions", value)}
          autoCapitalize="sentences"
          multiline
          placeholder="Constraints, deadlines, risks, stack preferences, people context..."
        />
        <View style={styles.insetCard}>
          <Text style={styles.inputLabel}>Project Mode</Text>
          <View style={styles.optionGrid}>
            {PROJECT_TEMPLATES.map((template) => (
              <Pressable
                key={template.id}
                style={[styles.optionChip, store.projectTemplateId === template.id ? styles.optionChipActive : null]}
                onPress={() => store.setField("projectTemplateId", template.id)}
              >
                <Text style={[styles.optionChipLabel, store.projectTemplateId === template.id ? styles.optionChipLabelActive : null]}>
                  {template.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.helperText}>
            {PROJECT_TEMPLATES.find((template) => template.id === store.projectTemplateId)?.description}
          </Text>
        </View>
        <View style={styles.insetCard}>
          <Text style={styles.inputLabel}>Reply Style</Text>
          <View style={styles.optionGrid}>
            {responseStyles.map((style) => (
              <Pressable
                key={style.id}
                style={[styles.optionChip, store.responseStyle === style.id ? styles.optionChipActive : null]}
                onPress={() => store.setResponseStyle(style.id).catch((error) => console.warn(error))}
              >
                <Text style={[styles.optionChipLabel, store.responseStyle === style.id ? styles.optionChipLabelActive : null]}>
                  {style.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.helperText}>New project kickoff turns will use a {humanizeResponseStyle(store.responseStyle)} reply style.</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => store.createProjectSession().catch((error) => console.warn(error))}>
          <Text style={styles.primaryLabel}>Start Project Chat</Text>
        </Pressable>
      </View>

      {visibleSessions.length ? (
        visibleSessions.map((item) => (
          <View key={item.id} style={[styles.card, styles.sessionCard]}>
            <View style={styles.statusRow}>
              {isOperatorSession(item) ? <Text style={styles.operatorBadge}>Default Operator</Text> : null}
              {!isOperatorSession(item) ? <Text style={styles.kindBadge}>{humanizeSessionKind(item.kind)}</Text> : null}
              {item.pinned ? <Text style={styles.pinnedBadge}>Pinned</Text> : null}
            </View>
            <Text style={styles.sectionTitle}>{item.title}</Text>
            <Text style={styles.rootPath}>{item.rootPath}</Text>
            {item.lastPreview ? <Text style={styles.supportingText}>{item.lastPreview}</Text> : null}
            <Text style={styles.metric}>
              Status: {item.status}
              {item.lastError ? ` | ${item.lastError}` : ""}
            </Text>
            {item.lastActivityAt ? <Text style={styles.metric}>Last activity: {formatMessageTimestamp(item.lastActivityAt)}</Text> : null}
            <LabeledInput
              label="Rename Chat"
              value={store.renameDraftBySession[item.id] ?? item.title}
              onChange={(value) => store.setRenameDraft(item.id, value)}
              autoCapitalize="sentences"
            />
            <View style={[styles.actions, styles.chatActions]}>
              <Pressable style={[styles.secondaryButton, styles.chatActionButton]} onPress={() => store.renameSession(item.id).catch((error) => console.warn(error))}>
                <Text style={styles.secondaryLabel}>Rename</Text>
              </Pressable>
              <Pressable style={[styles.primaryButton, styles.chatActionButton]} onPress={() => store.selectSession(item.id).catch((error) => console.warn(error))}>
                <Text style={styles.primaryLabel}>Open Chat</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, styles.chatActionButton, styles.dangerButton]}
                onPress={() => store.deleteSession(item.id).catch((error) => console.warn(error))}
              >
                <Text style={[styles.secondaryLabel, styles.dangerButtonLabel]}>Delete Chat</Text>
              </Pressable>
            </View>
          </View>
        ))
      ) : searchQuery.trim() ? <Text style={styles.metric}>No chats match that search yet.</Text> : <Text style={styles.metric}>No chats yet. Start one from an approved root.</Text>}
    </ScrollView>
  );
}

export function ChatScreen(props: {
  store: AppState;
  onRefresh(): void;
  keyboardInset: number;
  composerBottomPadding: number;
}): React.JSX.Element {
  const { store, onRefresh, keyboardInset, composerBottomPadding } = props;
  const selectedSession = store.sessions.find((item) => item.id === store.selectedSessionId) ?? null;
  const sendTargetSession = findSendTargetSession(store.selectedSessionId, store.sessions);
  const stopTargetSession = findStopTargetSession(store.selectedSessionId, store.sessions);
  const manualStopTargetSession = findManualStopTargetSession(store.selectedSessionId, store.sessions);
  const hasSelectedSession = Boolean(store.selectedSessionId);
  const hasFallbackSession = store.sessions.length > 0;
  const canCreateFromApprovedRoot = Boolean(store.newSessionRootPath || store.hostStatus?.host.approvedRoots[0]);
  const canSend = Boolean(
    (hasSelectedSession || hasFallbackSession || canCreateFromApprovedRoot) &&
      store.composer.trim().length > 0 &&
      !isSessionBusy(sendTargetSession) &&
      !store.sendingMessage
  );
  const messages = store.selectedSessionId ? store.messagesBySession[store.selectedSessionId] ?? [] : [];
  const busy = isSessionBusy(stopTargetSession);
  const canRequestStop = Boolean(manualStopTargetSession || store.voiceSessionActive || store.voiceAssistantDraft);
  const lastMessage = messages[messages.length - 1] ?? null;
  const lastMessageSnapshot = lastMessage ? `${lastMessage.id}:${lastMessage.status}:${lastMessage.updatedAt}:${lastMessage.content.length}` : "empty";
  const selectedExternalMessage =
    store.externalDraft && store.externalDraft.sessionId === store.selectedSessionId
      ? messages.find((item) => item.id === store.externalDraft?.messageId) ?? null
      : null;
  const canSendExternal = Boolean(
    store.externalDraft?.recipientId && store.externalDraft?.subject.trim() && !store.sendingExternalMessage
  );
  const scrollRef = useRef<ScrollView | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const showChatChrome = !selectedSession || Boolean(selectedSession.lastError) || (!hasSelectedSession && hasFallbackSession);
  const chatHelperText = !hasFallbackSession
    ? "Start or resume a chat before sending your first prompt."
    : !store.voiceAvailable
      ? "Voice needs the phone's speech recognition service. Tap the top-right mic button if Android is missing it."
      : store.voiceSessionActive
        ? "Voice loop is active. Speak naturally, interrupt when needed, or type if you want to steer the session."
      : null;

  useEffect(() => {
    if (!stickToBottom) {
      return;
    }
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [lastMessageSnapshot, selectedSession?.id, stickToBottom]);

  return (
    <View style={styles.chatScreen}>
      <ScrollView
        ref={scrollRef}
        style={styles.chatScrollArea}
        contentContainerStyle={styles.chatScrollContent}
        refreshControl={<RefreshControl refreshing={store.refreshing} onRefresh={onRefresh} tintColor="#0f766e" progressViewOffset={12} />}
        {...refreshScrollInteractionProps}
        onScroll={(event) => {
          const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
          const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);
          setStickToBottom(distanceFromBottom < 140);
        }}
        onContentSizeChange={() => {
          if (stickToBottom) {
            scrollRef.current?.scrollToEnd({ animated: true });
          }
        }}
        scrollEventThrottle={16}
      >
        {showChatChrome ? (
          <View style={[styles.card, styles.chatChromeCard]}>
            <View style={styles.chatSummaryHeader}>
              <View style={styles.chatSummaryCopy}>
                <View style={styles.chatSummaryBadgeRow}>
                  {selectedSession && isOperatorSession(selectedSession) ? <Text style={styles.operatorBadge}>Operator</Text> : null}
                  {!selectedSession || isOperatorSession(selectedSession) ? null : <Text style={styles.kindBadge}>{humanizeSessionKind(selectedSession.kind)}</Text>}
                  <Text style={styles.styleBadge}>{responseStyles.find((style) => style.id === store.responseStyle)?.label ?? "Natural"}</Text>
                </View>
                <Text style={styles.chatSummaryTitle}>{selectedSession?.title ?? "No chat selected"}</Text>
                <Text style={styles.chatSummaryMetaLine} numberOfLines={2}>
                  {selectedSession?.rootPath ??
                    (hasFallbackSession
                      ? "Send will resume your latest chat."
                      : canCreateFromApprovedRoot
                        ? "Send will create the first chat from the default root."
                        : "Choose a chat from the Chats tab first.")}
                </Text>
                {selectedSession?.lastError ? <Text style={styles.helperText}>{selectedSession.lastError}</Text> : null}
              </View>
              <StatusChip label={selectedSession ? `Status: ${selectedSession.status}` : "Waiting for a chat"} tone={selectedSession?.status === "error" ? "orange" : "teal"} />
            </View>
            {!hasSelectedSession && hasFallbackSession ? (
              <Pressable style={[styles.secondaryButton, styles.chatResumeButton]} onPress={() => store.selectSession(store.sessions[0].id).catch((error) => console.warn(error))}>
                <Text style={styles.secondaryLabel}>Resume Latest Chat</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {store.voiceSessionActive || store.liveTranscript || store.voiceAssistantDraft ? (
          <VoiceSessionPanel
            active={store.voiceSessionActive}
            phase={store.voiceSessionPhase}
            liveTranscript={store.liveTranscript}
            assistantDraft={store.voiceAssistantDraft}
            audioLevel={store.voiceAudioLevel}
            telemetry={store.voiceTelemetry}
          />
        ) : null}

        <View style={styles.messages}>
          {messages.length > 0 ? (
            messages.map((item) => (
              <MessageBubble
                key={item.id}
                message={item}
                actionLabel={item.role === "assistant" && item.status === "completed" ? "Send externally" : undefined}
                onActionPress={
                  item.role === "assistant" && item.status === "completed"
                    ? () => store.beginExternalMessageDraft(item.id, item.sessionId)
                    : undefined
                }
              />
            ))
          ) : (
            <Text style={styles.metric}>Open a chat to see message history.</Text>
          )}
        </View>
      </ScrollView>

      <View style={[styles.card, styles.chatComposerCard, { marginBottom: composerBottomPadding + keyboardInset }]}>
        {store.externalDraft ? (
          <View style={styles.insetCard}>
            <Text style={styles.sectionTitle}>Send Externally</Text>
            <Text style={styles.supportingText}>
              {selectedExternalMessage
                ? `You are sending a completed Codex reply from this chat to a trusted email recipient.`
                : "Select a completed Codex reply before sending it externally."}
            </Text>
            {selectedExternalMessage ? (
              <Text style={styles.helperText} numberOfLines={3}>
                {selectedExternalMessage.content.trim().replace(/\s+/g, " ")}
              </Text>
            ) : null}
            <View style={styles.optionGrid}>
              {store.outboundRecipients.map((recipient) => (
                <Pressable
                  key={recipient.id}
                  style={[styles.optionChip, store.externalDraft?.recipientId === recipient.id ? styles.optionChipActive : null]}
                  onPress={() => store.updateExternalDraft("recipientId", recipient.id)}
                >
                  <Text
                    style={[styles.optionChipLabel, store.externalDraft?.recipientId === recipient.id ? styles.optionChipLabelActive : null]}
                  >
                    {recipient.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {!store.outboundRecipients.length ? (
              <Text style={styles.helperText}>Add at least one trusted recipient on the Host tab first.</Text>
            ) : null}
            <LabeledInput
              label="Email Subject"
              value={store.externalDraft.subject}
              onChange={(value) => store.updateExternalDraft("subject", value)}
              autoCapitalize="sentences"
            />
            <LabeledInput
              label="Intro"
              value={store.externalDraft.intro}
              onChange={(value) => store.updateExternalDraft("intro", value)}
              autoCapitalize="sentences"
              multiline
              placeholder="Optional note before the Codex output..."
            />
            <View style={styles.actions}>
              <Pressable style={styles.secondaryButton} onPress={() => store.cancelExternalMessageDraft()}>
                <Text style={styles.secondaryLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, !canSendExternal ? styles.disabledButton : null]}
                disabled={!canSendExternal}
                onPress={() => store.sendExternalMessage().catch((error) => console.warn(error))}
              >
                <Text style={styles.primaryLabel}>{store.sendingExternalMessage ? "Sending..." : "Send Email"}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <TextInput
          value={store.composer}
          onChangeText={(value) => store.setField("composer", value)}
          placeholder="Ask Codex something about this repo..."
          placeholderTextColor="#64748b"
          multiline
          style={[styles.composer, Platform.OS === "android" ? styles.composerCompact : null]}
        />
        <View style={[styles.actions, styles.chatComposerActions]}>
          <Pressable
            testID="chat-stop-button"
            style={[styles.secondaryButton, styles.chatComposerActionButton, !canRequestStop ? styles.disabledButton : null]}
            onPress={() => store.stopSession().catch((error) => console.warn(error))}
            disabled={!canRequestStop}
          >
            <Text style={styles.secondaryLabel}>Stop</Text>
          </Pressable>
          <Pressable
            testID="chat-send-button"
            style={[styles.primaryButton, styles.chatComposerActionButton, !canSend ? styles.disabledButton : null]}
            onPress={() => store.sendMessage().catch((error) => console.warn(error))}
            disabled={!canSend}
          >
            <Text style={styles.primaryLabel}>Send</Text>
          </Pressable>
        </View>
        {busy ? <Text style={styles.helperText}>Stop targets the currently busy chat, even if you are viewing a different thread.</Text> : null}
        {!busy && canRequestStop ? <Text style={styles.helperText}>Stop can also be used as a recovery action if this chat feels stuck.</Text> : null}
        {chatHelperText ? <Text style={styles.helperText}>{chatHelperText}</Text> : null}
      </View>
    </View>
  );
}

function humanizeCodexState(status: "logged_in" | "logged_out" | "error"): string {
  if (status === "logged_in") {
    return "Codex ready";
  }
  if (status === "error") {
    return "Codex needs attention";
  }
  return "Codex login required";
}

function humanizeAvailability(value: "ready" | "offline" | "reconnecting" | "repair_needed" | "codex_unavailable" | "tailscale_unavailable" | "needs_attention"): string {
  switch (value) {
    case "codex_unavailable":
      return "Codex unavailable";
    case "offline":
      return "Desktop offline";
    case "ready":
      return "Ready";
    case "reconnecting":
      return "Reconnecting";
    case "repair_needed":
      return "Repair needed";
    case "tailscale_unavailable":
      return "Tailscale unavailable";
    default:
      return "Needs attention";
  }
}

const notificationEvents: Array<{
  id: "run_complete" | "run_failed" | "repair_needed" | "approval_needed";
  label: string;
  description: string;
}> = [
  {
    id: "run_complete",
    label: "Run complete",
    description: "Send an Android update when Codex finishes a run."
  },
  {
    id: "run_failed",
    label: "Run failed",
    description: "Send an Android update when a run ends in an error."
  },
  {
    id: "repair_needed",
    label: "Repair needed",
    description: "Send an Android update when the desktop link needs repair."
  },
  {
    id: "approval_needed",
    label: "Approval needed",
    description: "Reserve Android updates for approval-required flows."
  }
];

const responseStyles: Array<{
  id: "natural" | "executive" | "technical" | "concise";
  label: string;
}> = [
  { id: "natural", label: "Natural" },
  { id: "executive", label: "Executive" },
  { id: "technical", label: "Technical" },
  { id: "concise", label: "Concise" }
];

function humanizeSessionKind(kind: "operator" | "project" | "admin" | "build" | "notes"): string {
  switch (kind) {
    case "admin":
      return "Admin";
    case "build":
      return "Build";
    case "notes":
      return "Notes";
    case "operator":
      return "Operator";
    default:
      return "Project";
  }
}

function describeVoiceOption(voice: TtsVoiceOption): string {
  const details = [voice.language];
  if (voice.qualityLabel) {
    details.push(voice.qualityLabel);
  }

  return `${voice.label} (${details.join(" • ")})`;
}
