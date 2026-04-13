import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import WebSocket from "ws";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export class CodexAppServerClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private socket: WebSocket | null = null;
  private requestId = 0;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

  constructor(
    private readonly codexBin: string,
    private readonly listenUrl: string
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      await this.attachSocket(await this.connect());
      return;
    } catch {
      // Fall through and launch a managed app-server for this host process.
    }

    if (!this.process) {
      const child = spawn(this.codexBin, ["app-server", "--listen", this.listenUrl], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      this.process = child;

      child.stdout?.on("data", (chunk) => {
        this.emit("log", chunk.toString("utf8"));
      });

      child.stderr?.on("data", (chunk) => {
        this.emit("log", chunk.toString("utf8"));
      });

      child.on("exit", (code) => {
        this.emit("exit", code ?? 0);
        this.rejectPending(new Error("Codex app-server exited."));
        this.socket = null;
        this.process = null;
      });
    }

    await this.attachSocket(await this.connect());
  }

  async stop(): Promise<void> {
    this.socket?.close();
    this.socket = null;

    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  async request<T>(method: string, params?: unknown, timeoutMs = 15_000): Promise<T> {
    const socket = this.requireSocket();
    const id = ++this.requestId;
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject });
      socket.send(JSON.stringify(payload), (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pending.delete(id);
          reject(error);
        }
      });

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  notify(method: string, params?: unknown): void {
    const socket = this.requireSocket();
    const payload: JsonRpcNotification = {
      jsonrpc: "2.0",
      method,
      params
    };
    socket.send(JSON.stringify(payload));
  }

  private requireSocket(): WebSocket {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Codex app-server is not connected.");
    }
    return this.socket;
  }

  private async attachSocket(socket: WebSocket): Promise<void> {
    this.socket = socket;
    this.socket.on("message", (chunk) => {
      this.handleMessage(chunk.toString());
    });
    this.socket.on("close", () => {
      this.rejectPending(new Error("Codex app-server connection closed."));
      this.socket = null;
    });

    await this.request("initialize", {
      clientInfo: {
        name: "adam-connect-host",
        version: "0.3.0"
      },
      capabilities: null
    });
    this.notify("initialized");
  }

  private async connect(): Promise<WebSocket> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < 10_000) {
      try {
        const socket = await new Promise<WebSocket>((resolve, reject) => {
          const next = new WebSocket(this.listenUrl);
          next.once("open", () => resolve(next));
          next.once("error", reject);
        });
        return socket;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    throw new Error("Timed out connecting to the local Codex app-server.");
  }

  private handleMessage(raw: string): void {
    const message = JSON.parse(raw) as JsonRpcResponse | JsonRpcNotification;

    if ("id" in message && typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
        return;
      }
      pending.resolve(message.result);
      return;
    }

    if ("method" in message) {
      this.emit("notification", message);
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
