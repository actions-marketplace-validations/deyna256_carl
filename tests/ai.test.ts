import { describe, it, expect, vi, afterEach } from 'vitest';
import { callOpenRouter, buildPrompt, AiError } from '../src/ai';
import type { OpenRouterMessage } from '../src/ai';

const MESSAGES: OpenRouterMessage[] = [{ role: 'user', content: 'test' }];

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeSuccessBody(content = 'Looks good!') {
  return {
    id: 'test-id',
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildPrompt', () => {
  it('creates a system message from guidelines and a user message with the diff', () => {
    const messages = buildPrompt('Review carefully.', 'diff content');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'system', content: 'Review carefully.' });
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('diff content');
    expect(messages[1].content).toContain('```diff');
  });

  it('trims whitespace from guidelines', () => {
    const messages = buildPrompt('  guidelines  ', 'diff');
    expect(messages[0].content).toBe('guidelines');
  });
});

describe('callOpenRouter', () => {
  it('returns review and usage on a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(makeSuccessBody())));

    const result = await callOpenRouter('key', 'model', MESSAGES);

    expect(result.review).toBe('Looks good!');
    expect(result.usage?.total_tokens).toBe(30);
  });

  it('throws AiError with statusCode on HTTP 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ error: 'unavailable' }, 503)));

    const err = await callOpenRouter('key', 'model', MESSAGES).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.statusCode).toBe(503);
  });

  it('throws AiError with statusCode on HTTP 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ error: 'unauthorized' }, 401)));

    const err = await callOpenRouter('key', 'model', MESSAGES).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.statusCode).toBe(401);
  });

  it('throws AiError when choices array is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ id: 'x', choices: [] })),
    );

    await expect(callOpenRouter('key', 'model', MESSAGES)).rejects.toThrow(AiError);
  });

  it('throws AiError when content is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({
          id: 'x',
          choices: [{ message: { role: 'assistant', content: null }, finish_reason: 'stop' }],
        }),
      ),
    );

    await expect(callOpenRouter('key', 'model', MESSAGES)).rejects.toThrow(AiError);
  });

  it('throws AiError on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    const err = await callOpenRouter('key', 'model', MESSAGES).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.message).toContain('Network failure');
  });

  it('throws AiError with timeout message on AbortError', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const err = await callOpenRouter('key', 'model', MESSAGES).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.message).toContain('timed out');
  });

  it('sends the correct Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(makeSuccessBody()));
    vi.stubGlobal('fetch', fetchMock);

    await callOpenRouter('my-secret-key', 'model', MESSAGES);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer my-secret-key',
    );
  });
});
