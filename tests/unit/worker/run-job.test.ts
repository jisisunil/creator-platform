import { describe, expect, it, vi } from 'vitest';
import type { Container } from '@/adapters/container';
import type { JobDefinition } from '../../../worker/job-definition';
import { runJob } from '../../../worker/run-job';

const container = {} as Container;

describe('runJob (NFR-10)', () => {
  it('passes job data and the container to the handler', async () => {
    const handle = vi.fn(async () => ({ processed: 3 }));
    const job: JobDefinition<{ creatorId: string }> = { name: 'test.job', handle };

    await runJob(job, { creatorId: 'c1' }, container);

    expect(handle).toHaveBeenCalledWith({ creatorId: 'c1' }, container);
  });

  it('rethrows failures so the queue can retry', async () => {
    const job: JobDefinition = {
      name: 'test.failing',
      handle: async () => {
        throw new Error('upstream timeout');
      },
    };

    await expect(runJob(job, {}, container)).rejects.toThrow('upstream timeout');
  });
});
