import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HostAuthState } from "@adam-connect/shared";
import { CodexAppServerClient } from "./codexAppServerClient.js";

const execFileAsync = promisify(execFile);

interface ThreadStartResponse {
  thread: {
    id: string;
  };
}

interface TurnStartResponse {
  turn: {
    id: string;
  };
}

interface RunTurnInput {
  cwd: string;
  threadId: string | null;
  text: string;
  onTurnStarted(input: { threadId: string; turnId: string }): Promise<void>;
  onDelta(delta: string): Promise<void>;
}

interface RunTurnResult {
  threadId: string;
  turnId: string;
}

export class CodexBridge {
  private readonly client: CodexAppServerClient;

  constructor(
    codexBin = process.env.CODEX_BIN ?? "codex",
    listenUrl = process.env.CODEX_APP_SERVER_URL ?? "ws://127.0.0.1:43213"
  ) {
    this.client = new CodexAppServerClient(codexBin, listenUrl);
  }

  async start(): Promise<void> {
    await this.client.start();
  }

  async stop(): Promise<void> {
    await this.client.stop();
  }

  async getAuthState(): Promise<HostAuthState> {
    try {
      const { stdout, stderr } = await execFileAsync(process.env.CODEX_BIN ?? "codex", ["login", "status"]);
      const normalized = `${stdout ?? ""}${stderr ?? ""}`.trim();
      if (/logged in/i.test(normalized)) {
        return {
          status: "logged_in",
          detail: normalized
        };
      }
      return {
        status: "logged_out",
        detail: normalized || "Codex is not logged in. Run `codex login --device-auth` on the desktop."
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to read Codex login status.";
      return {
        status: "error",
        detail: message
      };
    }
  }

  async interrupt(threadId: string, turnId: string): Promise<void> {
    await this.client.request("turn/interrupt", {
      threadId,
      turnId
    });
  }

  async runTurn(input: RunTurnInput): Promise<RunTurnResult> {
    const threadId = input.threadId ?? (await this.startThread(input.cwd));
    let turnId = "";
    let readyForDeltas = false;
    const queuedDeltas: string[] = [];
    const itemBuffers = new Map<string, string>();
    let deltaChain = Promise.resolve();

    const flushDelta = (delta: string) => {
      deltaChain = deltaChain.then(() => input.onDelta(delta));
      return deltaChain;
    };

    const listener = async (message: unknown) => {
      if (!isNotification(message)) {
        return;
      }

      if (message.method === "item/agentMessage/delta" && matchesTurn(message.params, turnId)) {
        const delta = readString(message.params, "delta");
        const itemId = readString(message.params, "itemId");
        if (!delta) {
          return;
        }
        if (itemId) {
          itemBuffers.set(itemId, `${itemBuffers.get(itemId) ?? ""}${delta}`);
        }
        if (!readyForDeltas) {
          queuedDeltas.push(delta);
          return;
        }
        await flushDelta(delta);
        return;
      }

      if (message.method === "item/completed" && matchesTurn(message.params, turnId)) {
        const item = readObject(message.params, "item");
        if (!item || item.type !== "agentMessage" || typeof item.id !== "string" || typeof item.text !== "string") {
          return;
        }
        const previous = itemBuffers.get(item.id) ?? "";
        itemBuffers.set(item.id, item.text);
        const unseen = item.text.startsWith(previous) ? item.text.slice(previous.length) : item.text;
        if (!unseen) {
          return;
        }
        if (!readyForDeltas) {
          queuedDeltas.push(unseen);
          return;
        }
        await flushDelta(unseen);
      }
    };

    this.client.on("notification", listener);

    try {
      const turn = await this.client.request<TurnStartResponse>("turn/start", {
        threadId,
        input: [
          {
            type: "text",
            text: input.text,
            text_elements: []
          }
        ]
      });

      turnId = turn.turn.id;
      await input.onTurnStarted({ threadId, turnId });
      readyForDeltas = true;

      for (const queued of queuedDeltas.splice(0, queuedDeltas.length)) {
        await flushDelta(queued);
      }

      await this.waitForTurnCompletion(turnId);
      await deltaChain;
      return { threadId, turnId };
    } catch (error) {
      await deltaChain;
      throw error;
    } finally {
      this.client.off("notification", listener);
    }
  }

  private async startThread(cwd: string): Promise<string> {
    const response = await this.client.request<ThreadStartResponse>("thread/start", {
      cwd,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      baseInstructions:
        "You are being used through Adam Connect from a trusted paired phone. Stay inside the current working directory unless the user explicitly asks otherwise and the workspace permits it.",
      experimentalRawEvents: false,
      persistExtendedHistory: false,
      ephemeral: false
    });

    return response.thread.id;
  }

  private async waitForTurnCompletion(turnId: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const listener = (message: unknown) => {
        if (!isNotification(message)) {
          return;
        }

        if (message.method === "turn/completed" && readObject(message.params, "turn")?.id === turnId) {
          cleanup();
          resolve();
          return;
        }

        if (message.method === "error" && readString(message.params, "turnId") === turnId) {
          cleanup();
          reject(new Error(readErrorMessage(message.params) ?? "Codex turn failed."));
        }
      };

      const cleanup = () => {
        this.client.off("notification", listener);
      };

      this.client.on("notification", listener);
    });
  }
}

function isNotification(value: unknown): value is { method: string; params?: unknown } {
  return typeof value === "object" && value !== null && "method" in value;
}

function matchesTurn(params: unknown, turnId: string): boolean {
  return !!turnId && readString(params, "turnId") === turnId;
}

function readObject(value: unknown, key: string): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return null;
  }
  const selected = (value as Record<string, unknown>)[key];
  return typeof selected === "object" && selected !== null ? (selected as Record<string, unknown>) : null;
}

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return null;
  }
  const selected = (value as Record<string, unknown>)[key];
  return typeof selected === "string" ? selected : null;
}

function readErrorMessage(value: unknown): string | null {
  const error = readObject(value, "error");
  if (!error) {
    return null;
  }
  const message = error.message;
  return typeof message === "string" ? message : null;
}
