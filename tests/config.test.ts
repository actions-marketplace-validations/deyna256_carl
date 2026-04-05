import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseConfig, loadConfig, ConfigError } from '../src/config';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('parseConfig', () => {
  it('applies all defaults for an empty object', () => {
    expect(parseConfig({})).toEqual({
      model: 'anthropic/claude-sonnet-4-5',
      guidelines: '.github/carl.md',
      max_diff_chars: 20000,
      max_files: 10,
      ignore: [],
    });
  });

  it('accepts a fully specified config', () => {
    const result = parseConfig({
      model: 'openai/gpt-4o',
      guidelines: '.github/review.md',
      max_diff_chars: 5000,
      max_files: 5,
      ignore: ['*.lock', 'dist/**'],
    });
    expect(result.model).toBe('openai/gpt-4o');
    expect(result.guidelines).toBe('.github/review.md');
    expect(result.max_diff_chars).toBe(5000);
    expect(result.max_files).toBe(5);
    expect(result.ignore).toEqual(['*.lock', 'dist/**']);
  });

  it('throws ConfigError when raw is not an object', () => {
    expect(() => parseConfig('string')).toThrow(ConfigError);
    expect(() => parseConfig(42)).toThrow(ConfigError);
    expect(() => parseConfig(null)).toThrow(ConfigError);
  });

  it('throws ConfigError for non-string model', () => {
    expect(() => parseConfig({ model: 123 })).toThrow(ConfigError);
    expect(() => parseConfig({ model: '' })).toThrow(ConfigError);
  });

  it('throws ConfigError for non-positive max_diff_chars', () => {
    expect(() => parseConfig({ max_diff_chars: 0 })).toThrow(ConfigError);
    expect(() => parseConfig({ max_diff_chars: -100 })).toThrow(ConfigError);
    expect(() => parseConfig({ max_diff_chars: 1.5 })).toThrow(ConfigError);
  });

  it('throws ConfigError for non-positive max_files', () => {
    expect(() => parseConfig({ max_files: 0 })).toThrow(ConfigError);
    expect(() => parseConfig({ max_files: -1 })).toThrow(ConfigError);
  });

  it('throws ConfigError for non-array ignore', () => {
    expect(() => parseConfig({ ignore: '*.lock' })).toThrow(ConfigError);
  });

  it('throws ConfigError for array of non-strings in ignore', () => {
    expect(() => parseConfig({ ignore: [1, 2, 3] })).toThrow(ConfigError);
  });
});

describe('loadConfig', () => {
  let readFileMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    const fs = await import('node:fs/promises');
    readFileMock = vi.mocked(fs.readFile);
  });

  it('loads a valid YAML config and reads the guidelines file', async () => {
    readFileMock
      .mockResolvedValueOnce('model: openai/gpt-4o\nmax_files: 5' as unknown as Buffer)
      .mockResolvedValueOnce('Review the code carefully.' as unknown as Buffer);

    const result = await loadConfig('.github/carl.yml');

    expect(result.config.model).toBe('openai/gpt-4o');
    expect(result.config.max_files).toBe(5);
    expect(result.guidelinesContent).toBe('Review the code carefully.');
  });

  it('applies defaults when YAML file is empty', async () => {
    readFileMock
      .mockResolvedValueOnce('' as unknown as Buffer)
      .mockResolvedValueOnce('Guidelines here' as unknown as Buffer);

    const result = await loadConfig('.github/carl.yml');

    expect(result.config.model).toBe('anthropic/claude-sonnet-4-5');
    expect(result.config.max_diff_chars).toBe(20000);
  });

  it('throws ConfigError when config file cannot be read', async () => {
    readFileMock.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await expect(loadConfig('.github/carl.yml')).rejects.toThrow(ConfigError);
  });

  it('throws ConfigError when guidelines file cannot be read', async () => {
    readFileMock
      .mockResolvedValueOnce('model: openai/gpt-4o' as unknown as Buffer)
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await expect(loadConfig('.github/carl.yml')).rejects.toThrow(ConfigError);
  });

  it('throws ConfigError when YAML is syntactically invalid', async () => {
    readFileMock.mockResolvedValueOnce('model: [unclosed bracket' as unknown as Buffer);

    await expect(loadConfig('.github/carl.yml')).rejects.toThrow(ConfigError);
  });
});
