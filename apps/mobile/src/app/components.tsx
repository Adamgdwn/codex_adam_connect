import React from "react";
import { Animated, Easing, Pressable, Text, TextInput, View } from "react-native";
import { FREEDOM_PRODUCT_NAME, FREEDOM_RUNTIME_NAME } from "@adam-connect/shared";
import type { ChatMessage } from "@adam-connect/shared";
import { formatMessageTimestamp, humanizeMessageRole, humanizeMessageStatus, splitMessageContent } from "../utils/operatorConsole";
import { styles } from "./mobileStyles";
import { humanizeVoiceSessionPhase, type VoiceSessionPhase } from "../services/voice/voiceSessionMachine";

export function StatusChip(props: { label: string; tone: "teal" | "orange" }): React.JSX.Element {
  return (
    <View style={[styles.statusChip, props.tone === "teal" ? styles.statusChipTeal : styles.statusChipOrange]}>
      <Text style={[styles.statusChipLabel, props.tone === "teal" ? styles.statusChipLabelTeal : styles.statusChipLabelOrange]}>
        {props.label}
      </Text>
    </View>
  );
}

export function LabeledInput(props: {
  label: string;
  value: string;
  onChange(value: string): void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  placeholder?: string;
}): React.JSX.Element {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline ? styles.inputMultiline : null]}
        value={props.value}
        onChangeText={props.onChange}
        autoCapitalize={props.autoCapitalize ?? "none"}
        placeholder={props.placeholder}
        placeholderTextColor="#64748b"
        multiline={props.multiline}
        textAlignVertical={props.multiline ? "top" : "center"}
      />
    </View>
  );
}

export function Banner(props: { text: string; tone: "error" | "info" }): React.JSX.Element {
  return (
    <View style={[styles.banner, props.tone === "error" ? styles.errorBanner : styles.infoBanner]}>
      <Text style={[styles.bannerLabel, props.tone === "error" ? styles.errorBannerLabel : styles.infoBannerLabel]}>
        {props.text}
      </Text>
    </View>
  );
}

export function RoboticOwlBadge(props: { compact?: boolean }): React.JSX.Element {
  return (
    <View style={[styles.owlBadgeShell, props.compact ? styles.owlBadgeShellCompact : null]}>
      <View style={styles.owlEarRow}>
        <View style={styles.owlEar} />
        <View style={styles.owlEar} />
      </View>
      <View style={styles.owlHead}>
        <View style={styles.owlEyeCluster}>
          <View style={styles.owlEye}>
            <View style={styles.owlPupil} />
          </View>
          <View style={styles.owlEye}>
            <View style={styles.owlPupil} />
          </View>
        </View>
        <View style={styles.owlBeak} />
      </View>
      <View style={styles.owlBody}>
        <View style={styles.owlChest} />
      </View>
      <View style={styles.owlWingRow}>
        <View style={styles.owlWing} />
        <View style={styles.owlWing} />
      </View>
    </View>
  );
}

export function VoiceSessionPanel(props: {
  active: boolean;
  phase: VoiceSessionPhase;
  liveTranscript: string;
  assistantDraft: string | null;
  audioLevel: number;
  telemetry: {
    turnsStarted: number;
    turnsCompleted: number;
    interruptions: number;
    reconnects: number;
    lastRoundTripMs: number | null;
  };
}): React.JSX.Element {
  const tone = props.phase === "error" || props.phase === "interrupted" || props.phase === "reconnecting" ? "orange" : "teal";
  const meterWidth = `${Math.max(4, Math.min(100, ((props.audioLevel + 2) / 12) * 100))}%` as `${number}%`;
  const preview =
    props.liveTranscript ||
    props.assistantDraft ||
    (props.phase === "muted"
      ? `Your microphone is muted. ${FREEDOM_RUNTIME_NAME} can keep speaking, but it will ignore your side until you unmute.`
      : props.active
        ? "Waiting for speech..."
        : "Start voice to keep the conversation loop open.");
  const label = props.liveTranscript ? "Live transcript" : props.assistantDraft ? "Assistant preview" : "Voice loop";

  return (
    <View style={[styles.card, styles.voiceSessionCard]}>
      <View style={styles.voiceSessionHeader}>
        <View style={styles.voiceSessionCopy}>
          <Text style={styles.sectionTitle}>Voice Loop</Text>
          <Text style={styles.helperText}>Natural turn-taking with live transcript and spoken reply.</Text>
        </View>
        <StatusChip label={humanizeVoiceSessionPhase(props.phase)} tone={tone} />
      </View>
      <View style={styles.voiceMeterTrack}>
        <View style={[styles.voiceMeterFill, { width: meterWidth }]} />
      </View>
      <Text style={styles.voicePreviewLabel}>{label}</Text>
      <Text style={styles.supportingText}>{preview}</Text>
      <Text style={styles.voiceMetrics}>
        Turns {props.telemetry.turnsStarted}/{props.telemetry.turnsCompleted} · Interruptions {props.telemetry.interruptions} · Reconnects {props.telemetry.reconnects}
        {props.telemetry.lastRoundTripMs !== null ? ` · Last RTT ${(props.telemetry.lastRoundTripMs / 1000).toFixed(1)}s` : ""}
      </Text>
    </View>
  );
}

export function MessageBubble(props: {
  message: ChatMessage;
  actionLabel?: string;
  onActionPress?(): void;
}): React.JSX.Element {
  const { message } = props;
  const blocks = splitMessageContent(message.content || message.errorMessage || "...");

  return (
    <View style={[styles.messageBubble, message.role === "user" ? styles.userBubble : styles.assistantBubble]}>
      <View style={styles.messageHeader}>
        <Text style={styles.messageRole}>{humanizeMessageRole(message)}</Text>
        <Text style={styles.messageTime}>{formatMessageTimestamp(message.createdAt)}</Text>
      </View>
      {blocks.map((block, index) =>
        block.type === "code" ? (
          <View key={`${message.id}-code-${index}`} style={styles.messageCodeBlock}>
            <Text style={styles.messageCodeText}>{block.content}</Text>
          </View>
        ) : (
          <View key={`${message.id}-text-${index}`} style={styles.messageBlock}>
            {block.content
              .split(/\n{2,}/)
              .map((paragraph, paragraphIndex) => (
                <Text key={`${message.id}-paragraph-${index}-${paragraphIndex}`} style={styles.messageText}>
                  {paragraph.trim()}
                </Text>
              ))}
          </View>
        )
      )}
      <Text style={styles.messageMeta}>
        {humanizeMessageStatus(message.status)}
        {message.errorMessage ? ` · ${message.errorMessage}` : ""}
      </Text>
      {props.actionLabel && props.onActionPress ? (
        <Pressable style={styles.messageActionButton} onPress={props.onActionPress}>
          <Text style={styles.messageActionLabel}>{props.actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function WorkingBubble(props: { label: string }): React.JSX.Element {
  const spin = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    animation.start();
    return () => animation.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"]
  });

  return (
    <View style={[styles.messageBubble, styles.assistantBubble, styles.workingBubble]}>
      <View style={styles.workingBubbleRow}>
        <Animated.View style={[styles.workingGlyphWrap, { transform: [{ rotate }] }]}>
          <Text style={styles.workingGlyph}>☢</Text>
        </Animated.View>
        <View style={styles.workingCopy}>
          <Text style={styles.messageRole}>{FREEDOM_PRODUCT_NAME} Working</Text>
          <Text style={styles.helperText}>{props.label}</Text>
        </View>
      </View>
    </View>
  );
}
