export class AiError extends Error {
  readonly statusCode: number | undefined;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'AiError';
    this.statusCode = statusCode;
  }
}

export interface OpenRouterMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

interface OpenRouterRequest {
  readonly model: string;
  readonly messages: readonly OpenRouterMessage[];
}

interface OpenRouterChoice {
  readonly message: {
    readonly role: string;
    readonly content: string | null;
  };
  readonly finish_reason: string;
}

interface OpenRouterResponse {
  readonly id: string;
  readonly choices: readonly OpenRouterChoice[];
  readonly usage?: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
  };
}

export interface ReviewResult {
  readonly review: string;
  readonly usage: OpenRouterResponse['usage'];
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 60_000;

export interface LinkedIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
}

export interface PrContext {
  readonly title: string;
  readonly body: string;
  readonly linkedIssues: readonly LinkedIssue[];
}

export function buildPrompt(
  guidelines: string,
  diff: string,
  pr?: PrContext,
): OpenRouterMessage[] {
  let prSection = '';

  if (pr !== undefined) {
    prSection += `PR title: ${pr.title}\n`;

    if (pr.body.trim().length > 0) {
      prSection += `PR description:\n${pr.body.trim()}\n`;
    }

    for (const issue of pr.linkedIssues) {
      prSection += `\nLinked issue #${issue.number}: ${issue.title}\n`;
      if (issue.body.trim().length > 0) {
        prSection += `${issue.body.trim()}\n`;
      }
    }

    prSection += '\n';
  }

  return [
    {
      role: 'system',
      content: guidelines.trim(),
    },
    {
      role: 'user',
      content: `${prSection}Review the following diff:\n\n\`\`\`diff\n${diff}\n\`\`\``,
    },
  ];
}

export async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: readonly OpenRouterMessage[],
): Promise<ReviewResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/deyna256/carl',
        'X-Title': 'carl',
      },
      body: JSON.stringify({ model, messages } satisfies OpenRouterRequest),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AiError(`OpenRouter request timed out after ${TIMEOUT_MS / 1000} seconds`);
    }
    throw new AiError(
      `Network error calling OpenRouter: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new AiError(
      `OpenRouter returned HTTP ${response.status}: ${response.statusText}`,
      response.status,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new AiError('Failed to parse OpenRouter response as JSON');
  }

  const parsed = data as OpenRouterResponse;

  if (!Array.isArray(parsed.choices) || parsed.choices.length === 0) {
    throw new AiError('OpenRouter response contained no choices');
  }

  const content = parsed.choices[0].message.content;
  if (content === null || content === undefined) {
    throw new AiError('OpenRouter response had null content');
  }

  return { review: content, usage: parsed.usage };
}
