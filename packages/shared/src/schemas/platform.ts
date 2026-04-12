import { z } from "zod";

export const hostAuthStatusSchema = z.enum(["logged_in", "logged_out", "error"]);
export const chatSessionStatusSchema = z.enum(["idle", "queued", "running", "stopping", "error"]);
export const chatMessageRoleSchema = z.enum(["user", "assistant", "system"]);
export const chatMessageStatusSchema = z.enum(["pending", "streaming", "completed", "failed", "interrupted"]);
export const streamEventTypeSchema = z.enum(["host_status", "session_upsert", "message_upsert"]);

export const hostAuthStateSchema = z.object({
  status: hostAuthStatusSchema,
  detail: z.string().nullable()
});

export const tailscaleStatusSchema = z.object({
  installed: z.boolean(),
  connected: z.boolean(),
  detail: z.string().nullable(),
  dnsName: z.string().nullable(),
  ipv4: z.string().nullable(),
  suggestedUrl: z.string().nullable(),
  installUrl: z.string().url(),
  loginUrl: z.string().url()
});

export const registeredHostSchema = z.object({
  id: z.string().min(1),
  hostName: z.string().min(1),
  approvedRoots: z.array(z.string().min(1)).min(1),
  pairingCode: z.string().min(6).max(6),
  pairingCodeIssuedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  isOnline: z.boolean()
});

export const pairedDeviceSchema = z.object({
  id: z.string().min(1),
  hostId: z.string().min(1),
  deviceName: z.string().min(1),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime()
});

export const chatSessionSchema = z.object({
  id: z.string().min(1),
  hostId: z.string().min(1),
  deviceId: z.string().min(1),
  title: z.string().min(1),
  rootPath: z.string().min(1),
  threadId: z.string().nullable(),
  status: chatSessionStatusSchema,
  activeTurnId: z.string().nullable(),
  stopRequested: z.boolean(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: chatMessageRoleSchema,
  content: z.string(),
  status: chatMessageStatusSchema,
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const hostStatusSchema = z.object({
  host: registeredHostSchema,
  auth: hostAuthStateSchema,
  tailscale: tailscaleStatusSchema,
  activeSessionCount: z.number().int().nonnegative(),
  pairedDeviceCount: z.number().int().nonnegative()
});

export const gatewayOverviewSchema = z.object({
  hostStatus: hostStatusSchema.nullable(),
  lastSeenDevice: pairedDeviceSchema.nullable(),
  recentDevices: z.array(pairedDeviceSchema),
  recentSessions: z.array(chatSessionSchema)
});

export const desktopOverviewResponseSchema = z.object({
  overview: gatewayOverviewSchema,
  publicBaseUrl: z.string().url(),
  dashboardUrl: z.string().url(),
  installUrl: z.string().url(),
  qrUrl: z.string().url(),
  apkDownloadUrl: z.string().url().nullable(),
  androidArtifact: z
    .object({
      fileName: z.string().min(1),
      sizeBytes: z.number().int().nonnegative()
    })
    .nullable()
});

export const registerHostRequestSchema = z.object({
  hostName: z.string().min(1),
  approvedRoots: z.array(z.string().min(1)).min(1)
});

export const registerHostResponseSchema = z.object({
  host: registeredHostSchema,
  hostToken: z.string().min(10),
  pairingCode: z.string().min(6).max(6)
});

export const pairingCompleteRequestSchema = z.object({
  pairingCode: z.string().min(6).max(6),
  deviceName: z.string().min(1)
});

export const pairingCompleteResponseSchema = z.object({
  deviceToken: z.string().min(10),
  device: pairedDeviceSchema,
  host: registeredHostSchema
});

export const createSessionRequestSchema = z.object({
  rootPath: z.string().min(1).optional(),
  title: z.string().min(1).optional()
});

export const postMessageRequestSchema = z.object({
  text: z.string().min(1).max(20000)
});

export const hostHeartbeatRequestSchema = z.object({
  auth: hostAuthStateSchema,
  tailscale: tailscaleStatusSchema
});

export const hostWorkMessageSchema = z.object({
  type: z.literal("message"),
  session: chatSessionSchema,
  message: chatMessageSchema
});

export const hostWorkInterruptSchema = z.object({
  type: z.literal("interrupt"),
  session: chatSessionSchema,
  turnId: z.string().min(1)
});

export const hostWorkItemSchema = z.union([hostWorkMessageSchema, hostWorkInterruptSchema]);

export const hostStartTurnRequestSchema = z.object({
  sessionId: z.string().min(1),
  userMessageId: z.string().min(1),
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  assistantMessageId: z.string().min(1)
});

export const hostAssistantDeltaRequestSchema = z.object({
  sessionId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  delta: z.string()
});

export const hostCompleteTurnRequestSchema = z.object({
  sessionId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  threadId: z.string().min(1),
  turnId: z.string().min(1)
});

export const hostFailTurnRequestSchema = z.object({
  sessionId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1).nullable().optional(),
  threadId: z.string().min(1).nullable().optional(),
  turnId: z.string().min(1).nullable().optional(),
  errorMessage: z.string().min(1)
});

export const hostInterruptTurnRequestSchema = z.object({
  sessionId: z.string().min(1),
  assistantMessageId: z.string().min(1).nullable().optional(),
  turnId: z.string().min(1)
});

export const streamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("host_status"),
    hostStatus: hostStatusSchema
  }),
  z.object({
    type: z.literal("session_upsert"),
    session: chatSessionSchema
  }),
  z.object({
    type: z.literal("message_upsert"),
    sessionId: z.string().min(1),
    message: chatMessageSchema
  })
]);

export type HostAuthStatus = z.infer<typeof hostAuthStatusSchema>;
export type ChatSessionStatus = z.infer<typeof chatSessionStatusSchema>;
export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>;
export type ChatMessageStatus = z.infer<typeof chatMessageStatusSchema>;
export type StreamEventType = z.infer<typeof streamEventTypeSchema>;
export type HostAuthState = z.infer<typeof hostAuthStateSchema>;
export type TailscaleStatus = z.infer<typeof tailscaleStatusSchema>;
export type RegisteredHost = z.infer<typeof registeredHostSchema>;
export type PairedDevice = z.infer<typeof pairedDeviceSchema>;
export type ChatSession = z.infer<typeof chatSessionSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type HostStatus = z.infer<typeof hostStatusSchema>;
export type GatewayOverview = z.infer<typeof gatewayOverviewSchema>;
export type DesktopOverviewResponse = z.infer<typeof desktopOverviewResponseSchema>;
export type RegisterHostRequest = z.infer<typeof registerHostRequestSchema>;
export type RegisterHostResponse = z.infer<typeof registerHostResponseSchema>;
export type PairingCompleteRequest = z.infer<typeof pairingCompleteRequestSchema>;
export type PairingCompleteResponse = z.infer<typeof pairingCompleteResponseSchema>;
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;
export type PostMessageRequest = z.infer<typeof postMessageRequestSchema>;
export type HostHeartbeatRequest = z.infer<typeof hostHeartbeatRequestSchema>;
export type HostWorkMessage = z.infer<typeof hostWorkMessageSchema>;
export type HostWorkInterrupt = z.infer<typeof hostWorkInterruptSchema>;
export type HostWorkItem = z.infer<typeof hostWorkItemSchema>;
export type HostStartTurnRequest = z.infer<typeof hostStartTurnRequestSchema>;
export type HostAssistantDeltaRequest = z.infer<typeof hostAssistantDeltaRequestSchema>;
export type HostCompleteTurnRequest = z.infer<typeof hostCompleteTurnRequestSchema>;
export type HostFailTurnRequest = z.infer<typeof hostFailTurnRequestSchema>;
export type HostInterruptTurnRequest = z.infer<typeof hostInterruptTurnRequestSchema>;
export type StreamEvent = z.infer<typeof streamEventSchema>;
