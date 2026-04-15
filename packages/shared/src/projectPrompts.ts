import type { InputMode, ResponseStyle, SessionKind } from "./schemas/platform.js";
import { FREEDOM_PRODUCT_NAME, FREEDOM_RUNTIME_NAME } from "./freedom.js";

export type ProjectTemplateId = "greenfield" | "bugfix" | "research" | "handoff";

export interface ProjectTemplate {
  id: ProjectTemplateId;
  label: string;
  description: string;
  guidance: string;
}

export interface ProjectWizardDraft {
  projectName?: string | null;
  rootPath?: string | null;
  intent: string;
  starterInstructions?: string | null;
  desiredOutputType?: string | null;
  templateId?: ProjectTemplateId | null;
  responseStyle?: ResponseStyle | null;
}

export interface TurnPromptInput {
  sessionTitle?: string | null;
  sessionKind?: SessionKind | null;
  userText: string;
  responseStyle?: ResponseStyle | null;
  inputMode?: InputMode | null;
  transcriptPolished?: boolean | null;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "greenfield",
    label: "Greenfield",
    description: "Shape a new project from a blank or early workspace.",
    guidance: "Propose a practical first slice, key architecture choices, and the safest next implementation step."
  },
  {
    id: "bugfix",
    label: "Bugfix",
    description: "Triage an issue and drive toward a safe fix.",
    guidance: "Prioritize reproduction, likely root causes, the smallest safe fix, and the tests or checks needed to verify it."
  },
  {
    id: "research",
    label: "Research",
    description: "Explore options and recommend a direction.",
    guidance: "Compare tradeoffs, surface assumptions and risks, and end with a concrete recommendation plus next actions."
  },
  {
    id: "handoff",
    label: "Handoff",
    description: "Create a resume-friendly project brief for later.",
    guidance: "Capture current context, open decisions, implementation plan, and the highest-value next step for a future session."
  }
];

export function buildProjectStarterPrompt(input: ProjectWizardDraft): string {
  const lines = [
    `You are helping me kick off a new ${FREEDOM_PRODUCT_NAME} project session.`,
    input.projectName?.trim() ? `Project name: ${input.projectName.trim()}` : null,
    input.rootPath?.trim() ? `Workspace root: ${input.rootPath.trim()}` : null,
    `Project goal: ${input.intent.trim()}`,
    input.desiredOutputType?.trim() ? `Desired output: ${input.desiredOutputType.trim()}` : null,
    input.templateId ? `Project mode: ${projectTemplateLabel(input.templateId)}` : null,
    input.responseStyle ? `Preferred response style: ${humanizeResponseStyle(input.responseStyle)}.` : null,
    input.starterInstructions?.trim() ? `Extra instructions: ${input.starterInstructions.trim()}` : null,
    input.templateId ? templateGuidance(input.templateId) : null,
    "Please confirm the objective briefly, call out any assumptions that matter, and then propose the best first working slice."
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildThreadInstructions(input: { sessionTitle?: string | null; sessionKind?: SessionKind | null }): string {
  const lines = [
    `You are ${FREEDOM_PRODUCT_NAME}, reached through ${FREEDOM_RUNTIME_NAME} from a trusted paired phone.`,
    "Stay inside the current working directory unless the user explicitly asks otherwise and the workspace permits it.",
    input.sessionTitle?.trim() ? `Current session title: ${input.sessionTitle.trim()}.` : null,
    input.sessionKind ? `Current session kind: ${input.sessionKind}.` : null,
    "Be collaborative, concrete, and keep progress moving."
  ].filter(Boolean);

  return lines.join(" ");
}

export function buildTurnPrompt(input: TurnPromptInput): string {
  const instructions = [
    `${FREEDOM_RUNTIME_NAME} turn context:`,
    input.sessionTitle?.trim() ? `- Session title: ${input.sessionTitle.trim()}` : null,
    input.sessionKind ? `- Session kind: ${input.sessionKind}` : null,
    input.responseStyle ? `- Preferred response style: ${humanizeResponseStyle(input.responseStyle)}` : null,
    input.inputMode === "voice"
      ? "- The user sent this from voice input. Focus on intent and do not nitpick transcription quirks."
      : null,
    input.inputMode === "voice_polished"
      ? "- The user sent this from a reviewed voice transcript. Keep the reply natural and grammatically clean."
      : null,
    input.transcriptPolished ? "- The user already polished the transcript before sending." : null
  ].filter(Boolean);

  if (instructions.length <= 1) {
    return input.userText.trim();
  }

  return `${instructions.join("\n")}\n\nUser request:\n${input.userText.trim()}`;
}

export function humanizeResponseStyle(style: ResponseStyle): string {
  switch (style) {
    case "concise":
      return "concise";
    case "executive":
      return "executive";
    case "technical":
      return "technical";
    default:
      return "natural";
  }
}

export function projectTemplateLabel(templateId: ProjectTemplateId): string {
  return PROJECT_TEMPLATES.find((template) => template.id === templateId)?.label ?? "Project";
}

function templateGuidance(templateId: ProjectTemplateId): string | null {
  return PROJECT_TEMPLATES.find((template) => template.id === templateId)?.guidance ?? null;
}
