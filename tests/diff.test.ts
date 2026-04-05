import { describe, it, expect, vi } from 'vitest';
import { fetchDiff, filterFiles, buildDiffString, getFilteredDiff, DiffError } from '../src/diff';
import type { DiffFile } from '../src/diff';

function makeFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    filename: 'src/index.ts',
    patch: '@@ -1,3 +1,4 @@\n context\n+added\n removed',
    status: 'modified',
    additions: 1,
    deletions: 1,
    ...overrides,
  };
}

function makeMockOctokit(paginateResult: DiffFile[] = []) {
  return {
    paginate: vi.fn().mockResolvedValue(paginateResult),
    rest: {
      pulls: {
        listFiles: vi.fn(),
      },
    },
  };
}

describe('filterFiles', () => {
  it('returns all files when ignore patterns are empty', () => {
    const files = [makeFile({ filename: 'src/index.ts' }), makeFile({ filename: 'package.json' })];
    expect(filterFiles(files, [])).toHaveLength(2);
  });

  it('removes files matching a glob pattern', () => {
    const files = [makeFile({ filename: 'yarn.lock' }), makeFile({ filename: 'src/index.ts' })];
    const result = filterFiles(files, ['*.lock']);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('src/index.ts');
  });

  it('removes files matching dist/** pattern', () => {
    const files = [makeFile({ filename: 'dist/index.js' }), makeFile({ filename: 'src/ai.ts' })];
    const result = filterFiles(files, ['dist/**']);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('src/ai.ts');
  });

  it('handles multiple ignore patterns', () => {
    const files = [
      makeFile({ filename: 'yarn.lock' }),
      makeFile({ filename: 'dist/index.js' }),
      makeFile({ filename: 'src/config.ts' }),
    ];
    const result = filterFiles(files, ['*.lock', 'dist/**']);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('src/config.ts');
  });

  it('matches dotfiles with dot: true', () => {
    const files = [makeFile({ filename: '.env' }), makeFile({ filename: 'src/index.ts' })];
    const result = filterFiles(files, ['.env']);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('src/index.ts');
  });
});

describe('buildDiffString', () => {
  it('formats files with correct headers', () => {
    const file = makeFile({ filename: 'src/foo.ts', patch: '+added line' });
    const result = buildDiffString([file]);
    expect(result).toContain('--- a/src/foo.ts');
    expect(result).toContain('+++ b/src/foo.ts');
    expect(result).toContain('+added line');
  });

  it('skips binary files with undefined patch', () => {
    const files = [
      makeFile({ filename: 'image.png', patch: undefined }),
      makeFile({ filename: 'src/index.ts', patch: '+code' }),
    ];
    const result = buildDiffString(files);
    expect(result).not.toContain('image.png');
    expect(result).toContain('src/index.ts');
  });

  it('joins multiple files with double newline', () => {
    const files = [
      makeFile({ filename: 'a.ts', patch: '+a' }),
      makeFile({ filename: 'b.ts', patch: '+b' }),
    ];
    const result = buildDiffString(files);
    expect(result).toContain('--- a/a.ts');
    expect(result).toContain('--- a/b.ts');
    expect(result.split('\n\n').length).toBeGreaterThan(1);
  });

  it('returns empty string for empty files array', () => {
    expect(buildDiffString([])).toBe('');
  });
});

describe('fetchDiff', () => {
  it('calls paginate and maps result to DiffFile', async () => {
    const rawFiles = [
      {
        filename: 'src/index.ts',
        patch: '+code',
        status: 'modified',
        additions: 1,
        deletions: 0,
      },
    ];
    const octokit = makeMockOctokit(rawFiles as unknown as DiffFile[]);

    const result = await fetchDiff(octokit as never, 'owner', 'repo', 1);

    expect(octokit.paginate).toHaveBeenCalledWith(
      octokit.rest.pulls.listFiles,
      expect.objectContaining({ owner: 'owner', repo: 'repo', pull_number: 1 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('src/index.ts');
  });

  it('throws DiffError when paginate fails', async () => {
    const octokit = makeMockOctokit();
    octokit.paginate.mockRejectedValueOnce(new Error('API error'));

    await expect(fetchDiff(octokit as never, 'owner', 'repo', 1)).rejects.toThrow(DiffError);
  });
});

describe('getFilteredDiff', () => {
  it('composes fetch + filter + build and returns totalChars', async () => {
    const rawFiles = [
      { filename: 'src/index.ts', patch: '+code', status: 'modified', additions: 1, deletions: 0 },
      {
        filename: 'dist/bundle.js',
        patch: '+bundle',
        status: 'modified',
        additions: 1,
        deletions: 0,
      },
    ];
    const octokit = makeMockOctokit(rawFiles as unknown as DiffFile[]);

    const result = await getFilteredDiff(octokit as never, 'owner', 'repo', 1, ['dist/**']);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].filename).toBe('src/index.ts');
    expect(result.rawDiff).toContain('src/index.ts');
    expect(result.rawDiff).not.toContain('dist/bundle.js');
    expect(result.totalChars).toBe(result.rawDiff.length);
  });
});
