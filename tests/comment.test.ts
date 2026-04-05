import { describe, it, expect, vi } from 'vitest';
import { postReviewComment, buildFallbackComment } from '../src/comment';

function makeMockOctokit() {
  return {
    rest: {
      pulls: {
        createReview: vi.fn().mockResolvedValue({ data: { id: 1 } }),
      },
    },
  };
}

describe('postReviewComment', () => {
  it('calls createReview with correct parameters', async () => {
    const octokit = makeMockOctokit();

    await postReviewComment({
      octokit: octokit as never,
      owner: 'deyna256',
      repo: 'carl',
      pullNumber: 42,
      body: '### carl review\n\nLooks good!',
    });

    expect(octokit.rest.pulls.createReview).toHaveBeenCalledOnce();
    expect(octokit.rest.pulls.createReview).toHaveBeenCalledWith({
      owner: 'deyna256',
      repo: 'carl',
      pull_number: 42,
      event: 'COMMENT',
      body: '### carl review\n\nLooks good!',
    });
  });

  it('uses COMMENT event (not APPROVE or REQUEST_CHANGES)', async () => {
    const octokit = makeMockOctokit();

    await postReviewComment({
      octokit: octokit as never,
      owner: 'o',
      repo: 'r',
      pullNumber: 1,
      body: 'body',
    });

    const call = octokit.rest.pulls.createReview.mock.calls[0][0] as { event: string };
    expect(call.event).toBe('COMMENT');
  });

  it('propagates errors from the GitHub API', async () => {
    const octokit = makeMockOctokit();
    octokit.rest.pulls.createReview.mockRejectedValueOnce(new Error('API error'));

    await expect(
      postReviewComment({
        octokit: octokit as never,
        owner: 'o',
        repo: 'r',
        pullNumber: 1,
        body: 'body',
      }),
    ).rejects.toThrow('API error');
  });
});

describe('buildFallbackComment', () => {
  it('includes the reason in the output', () => {
    const comment = buildFallbackComment('service unavailable');
    expect(comment).toContain('service unavailable');
  });

  it('contains a warning indicator', () => {
    const comment = buildFallbackComment('timeout');
    expect(comment).toContain(':warning:');
  });

  it('matches snapshot', () => {
    expect(buildFallbackComment('OpenRouter returned HTTP 503: Service Unavailable')).toMatchSnapshot();
  });
});
