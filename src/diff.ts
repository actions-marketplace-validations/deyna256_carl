import micromatch from 'micromatch';
import type { getOctokit } from '@actions/github';

type Octokit = ReturnType<typeof getOctokit>;

export class DiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiffError';
  }
}

export interface DiffFile {
  readonly filename: string;
  readonly patch: string | undefined;
  readonly status:
    | 'added'
    | 'modified'
    | 'removed'
    | 'renamed'
    | 'copied'
    | 'changed'
    | 'unchanged';
  readonly additions: number;
  readonly deletions: number;
}

export interface FilteredDiff {
  readonly files: DiffFile[];
  readonly rawDiff: string;
  readonly totalChars: number;
}

export async function fetchDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<DiffFile[]> {
  type ListFilesItem = Awaited<
    ReturnType<typeof octokit.rest.pulls.listFiles>
  >['data'][number];

  let items: ListFilesItem[];
  try {
    items = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });
  } catch (err) {
    throw new DiffError(
      `Failed to fetch PR diff: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return items.map((f) => ({
    filename: f.filename,
    patch: f.patch,
    status: f.status as DiffFile['status'],
    additions: f.additions,
    deletions: f.deletions,
  }));
}

export function filterFiles(
  files: readonly DiffFile[],
  ignorePatterns: readonly string[],
): DiffFile[] {
  if (ignorePatterns.length === 0) {
    return [...files];
  }
  const filenames = files.map((f) => f.filename);
  const ignored = new Set(micromatch(filenames, [...ignorePatterns], { dot: true }));
  return files.filter((f) => !ignored.has(f.filename));
}

export function buildDiffString(files: readonly DiffFile[]): string {
  return files
    .filter((f) => f.patch !== undefined)
    .map((f) => `--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch}`)
    .join('\n\n');
}

export async function getFilteredDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  ignorePatterns: readonly string[],
): Promise<FilteredDiff> {
  const allFiles = await fetchDiff(octokit, owner, repo, pullNumber);
  const files = filterFiles(allFiles, ignorePatterns);
  const rawDiff = buildDiffString(files);
  return { files, rawDiff, totalChars: rawDiff.length };
}
