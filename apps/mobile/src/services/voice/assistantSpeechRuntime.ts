import type { ChatMessageStatus } from "@adam-connect/shared";
import { TtsService } from "./ttsService";
import { createSpeechChunk } from "./voiceSessionMachine";

export class AssistantSpeechRuntime {
  private activeMessageId: string | null = null;
  private spokenCursor = 0;
  private queue: string[] = [];
  private speaking = false;
  private pendingStart = false;
  private speechSpanActive = false;
  private speakStartTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: {
    onBeforeSpeak?(): void;
    onSpeakingChange(speaking: boolean): void;
    onSpeechError?(message: string): void;
  } | null = null;

  constructor(private readonly tts: TtsService) {}

  configure(handlers: {
    onBeforeSpeak?(): void;
    onSpeakingChange(speaking: boolean): void;
    onSpeechError?(message: string): void;
  }): void {
    this.handlers = handlers;
    this.tts.configureHandlers({
      onStart: () => {
        this.clearStartTimer();
        this.pendingStart = false;
        this.speaking = true;
        if (!this.speechSpanActive) {
          this.speechSpanActive = true;
          handlers.onSpeakingChange(true);
        }
        this.flushQueue();
      },
      onFinish: () => {
        this.clearStartTimer();
        this.pendingStart = false;
        this.speaking = false;
        if (this.queue.length > 0) {
          this.flushQueue();
          return;
        }

        this.speechSpanActive = false;
        handlers.onSpeakingChange(false);
      },
      onCancel: () => {
        this.clearStartTimer();
        this.pendingStart = false;
        this.speaking = false;
        this.speechSpanActive = false;
        handlers.onSpeakingChange(false);
      },
      onError: (message) => {
        this.clearStartTimer();
        this.pendingStart = false;
        this.speaking = false;
        this.speechSpanActive = false;
        handlers.onSpeakingChange(false);
        handlers.onSpeechError?.(message);
      }
    });
  }

  reset(): void {
    this.activeMessageId = null;
    this.spokenCursor = 0;
    this.queue = [];
    this.speaking = false;
    this.pendingStart = false;
    this.speechSpanActive = false;
    this.clearStartTimer();
    this.tts.stop();
  }

  stop(): void {
    this.queue = [];
    this.speaking = false;
    this.pendingStart = false;
    this.speechSpanActive = false;
    this.clearStartTimer();
    this.tts.stop();
  }

  ingest(messageId: string, content: string, status: ChatMessageStatus, minimumChars: number): boolean {
    if (!this.tts.isAvailable()) {
      return false;
    }

    if (this.activeMessageId !== messageId) {
      this.activeMessageId = messageId;
      this.spokenCursor = 0;
      this.queue = [];
      this.speaking = false;
    }

    let nextChunk = createSpeechChunk(content, this.spokenCursor, minimumChars, status !== "streaming");
    while (nextChunk && nextChunk.chunk) {
      this.spokenCursor = nextChunk.nextCursor;
      this.queue.push(nextChunk.chunk);
      nextChunk = createSpeechChunk(content, this.spokenCursor, minimumChars, status !== "streaming");
    }

    this.flushQueue();
    return this.speaking || this.pendingStart || this.queue.length > 0;
  }

  private flushQueue(): void {
    if (this.speaking || this.pendingStart || this.queue.length === 0) {
      return;
    }

    const next = this.queue.shift();
    if (!next) {
      return;
    }

    this.handlers?.onBeforeSpeak?.();
    this.pendingStart = true;
    const spoken = this.tts.speak(next);
    if (!spoken) {
      this.pendingStart = false;
      this.flushQueue();
      return;
    }

    this.armStartTimeout();
  }

  private armStartTimeout(): void {
    this.clearStartTimer();
    this.speakStartTimer = setTimeout(() => {
      this.speakStartTimer = null;
      if (!this.pendingStart) {
        return;
      }

      this.pendingStart = false;
      this.speaking = false;
      this.speechSpanActive = false;
      this.handlers?.onSpeakingChange(false);
      this.handlers?.onSpeechError?.("Spoken replies could not start on this phone. Check Android text-to-speech output and media volume.");
      this.flushQueue();
    }, 2500);
  }

  private clearStartTimer(): void {
    if (!this.speakStartTimer) {
      return;
    }

    clearTimeout(this.speakStartTimer);
    this.speakStartTimer = null;
  }
}
