import type { OutboundEmailStatus, OutboundProvider } from "@adam-connect/shared";

export interface EmailSendInput {
  from: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSendResult {
  provider: Exclude<OutboundProvider, "none">;
  deliveryId: string;
}

interface EmailProvider {
  readonly provider: Exclude<OutboundProvider, "none">;
  send(input: EmailSendInput): Promise<EmailSendResult>;
}

class ResendEmailProvider implements EmailProvider {
  readonly provider = "resend" as const;

  constructor(private readonly apiKey: string) {}

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        subject: input.subject,
        text: input.text,
        html: input.html
      })
    });

    const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!response.ok || !body?.id) {
      throw new Error(body?.message ?? `Resend responded with ${response.status}.`);
    }

    return {
      provider: this.provider,
      deliveryId: body.id
    };
  }
}

export function resolveOutboundEmailStatus(
  env: NodeJS.ProcessEnv,
  recipientCount: number
): OutboundEmailStatus {
  const provider = normalizeProvider(env.OUTBOUND_EMAIL_PROVIDER);
  const fromAddress = normalizeOptional(env.OUTBOUND_EMAIL_FROM);
  const replyToAddress = normalizeOptional(env.OUTBOUND_EMAIL_REPLY_TO);
  const apiKey = normalizeOptional(env.RESEND_API_KEY);
  const enabled = provider === "resend" && Boolean(fromAddress && apiKey);

  return {
    enabled,
    provider: enabled ? provider : "none",
    fromAddress,
    replyToAddress,
    recipientCount
  };
}

export function createEmailProvider(env: NodeJS.ProcessEnv): EmailProvider | null {
  const provider = normalizeProvider(env.OUTBOUND_EMAIL_PROVIDER);
  if (provider !== "resend") {
    return null;
  }

  const apiKey = normalizeOptional(env.RESEND_API_KEY);
  if (!apiKey) {
    return null;
  }

  return new ResendEmailProvider(apiKey);
}

export function renderOutboundEmail(params: {
  subject: string;
  intro: string;
  messageContent: string;
  sessionTitle: string;
  hostName: string;
}): { text: string; html: string } {
  const intro = params.intro.trim();
  const content = params.messageContent.trim();
  const introSection = intro ? `${intro}\n\n` : "";
  const text = `${introSection}${content}\n\nSent from ${params.hostName} via Adam Connect.\nChat: ${params.sessionTitle}\nSubject: ${params.subject}`.trim();

  return {
    text,
    html: [
      "<!doctype html>",
      "<html><body style=\"margin:0;padding:24px;background:#f8fafc;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;\">",
      "<div style=\"max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:24px;\">",
      `<h1 style="font-size:20px;line-height:1.3;margin:0 0 16px;">${escapeHtml(params.subject)}</h1>`,
      intro ? `<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 18px;">${escapeHtml(intro)}</p>` : "",
      renderMessageHtml(content),
      `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 16px;" />`,
      `<p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">Sent from ${escapeHtml(params.hostName)} via Adam Connect.<br />Chat: ${escapeHtml(params.sessionTitle)}</p>`,
      "</div></body></html>"
    ].join("")
  };
}

function renderMessageHtml(content: string): string {
  const paragraphs = content
    .replace(/```[\s\S]*?```/g, (match) => {
      const code = match.replace(/^```[\w-]*\n?/, "").replace(/```$/, "").trim();
      return `\n\n<pre>${escapeHtml(code)}</pre>\n\n`;
    })
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs
    .map((paragraph) =>
      paragraph.startsWith("<pre>")
        ? paragraph.replace("<pre>", "<pre style=\"background:#0f172a;color:#e2e8f0;padding:14px;border-radius:14px;overflow:auto;font-size:13px;line-height:1.5;\">")
        : `<p style="font-size:15px;line-height:1.7;color:#1e293b;margin:0 0 16px;">${escapeHtml(paragraph)}</p>`
    )
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeProvider(value: string | undefined): OutboundProvider {
  return value?.trim().toLowerCase() === "resend" ? "resend" : "none";
}

function normalizeOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
