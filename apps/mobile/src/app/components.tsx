import React from "react";
import { Text, TextInput, View } from "react-native";
import type { ChatMessage } from "@adam-connect/shared";
import { formatMessageTimestamp, humanizeMessageRole, humanizeMessageStatus, splitMessageContent } from "../utils/operatorConsole";
import { styles } from "./mobileStyles";

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
}): React.JSX.Element {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChange}
        autoCapitalize={props.autoCapitalize ?? "none"}
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

export function MessageBubble(props: { message: ChatMessage }): React.JSX.Element {
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
    </View>
  );
}
