export interface CommandResult {
  summary: string;
  model: string;
  usage: Record<string, string | number | boolean>;
}

export interface SummarizationRequest {
  filePath: string;
  content: string;
}

export interface SummarizationProvider {
  summarizeFile(input: SummarizationRequest): Promise<CommandResult>;
}

interface ResponsesApiSuccess {
  output_text?: string;
  usage?: Record<string, number>;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

export class OpenAIResponsesSummarizationProvider implements SummarizationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async summarizeFile(input: SummarizationRequest): Promise<CommandResult> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        instructions:
          "Summarize the provided file for a developer. Focus on purpose, important behaviors, data flow, and notable risks. Keep it concise but useful.",
        input: `File path: ${input.filePath}\n\nFile contents:\n${input.content}`
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}`);
    }

    const body = (await response.json()) as ResponsesApiSuccess;
    const summary =
      body.output_text?.trim() ??
      body.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === "output_text" && typeof item.text === "string")
        .map((item) => item.text?.trim() ?? "")
        .join("\n")
        .trim() ??
      "";

    if (!summary) {
      throw new Error("OpenAI response did not include summary text.");
    }

    return {
      summary,
      model: this.model,
      usage: body.usage ?? {}
    };
  }
}

export function createSummarizationProviderFromEnv(env: NodeJS.ProcessEnv): SummarizationProvider {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for summarize_file.");
  }
  return new OpenAIResponsesSummarizationProvider(apiKey, env.OPENAI_MODEL ?? "gpt-4.1-mini");
}
