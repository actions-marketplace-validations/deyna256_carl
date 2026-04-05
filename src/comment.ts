import type { getOctokit } from '@actions/github';

type Octokit = ReturnType<typeof getOctokit>;

export interface PostCommentOptions {
  readonly octokit: Octokit;
  readonly owner: string;
  readonly repo: string;
  readonly pullNumber: number;
  readonly body: string;
}

export async function postReviewComment(options: PostCommentOptions): Promise<void> {
  const { octokit, owner, repo, pullNumber, body } = options;
  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: pullNumber,
    event: 'COMMENT',
    body,
  });
}

export function buildFallbackComment(reason: string): string {
  return `:warning: **carl** could not complete the review: ${reason}`;
}
