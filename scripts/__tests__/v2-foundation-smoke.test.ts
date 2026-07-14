import { describe, expect, it, vi } from 'vitest';

import {
  parseSmokeArgs,
  runFoundationSmoke,
} from '../v2-foundation-smoke.js';

describe('V2 foundation smoke command', () => {
  it('requires an API URL and expected release', () => {
    expect(() => parseSmokeArgs([])).toThrow(/--api-url/);
    expect(() => parseSmokeArgs(['--api-url', 'http://localhost:5100'])).toThrow(
      /--expected-release/,
    );
  });

  it('checks all foundation endpoints and records only safe summaries', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      return new Response(
        JSON.stringify({
          status: 'ok',
          version: 'release-test',
          environment: 'test',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-request-id': `request-${path.slice(1)}`,
          },
        },
      );
    });

    const result = await runFoundationSmoke(
      {
        apiUrl: 'http://localhost:5100',
        expectedRelease: 'release-test',
        timeoutMs: 500,
      },
      fetcher,
    );

    expect(result.exitCode).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.output).toContain('GET /healthz 200');
    expect(result.output).toContain('GET /readyz 200');
    expect(result.output).toContain('GET /versionz 200');
  });

  it('fails closed without printing response bodies', async () => {
    const secret = 'database-password-must-not-leak';
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(secret, {
        status: 500,
        headers: {
          'content-type': 'text/plain',
          'x-request-id': 'request-failure',
        },
      }),
    );

    const result = await runFoundationSmoke(
      {
        apiUrl: 'http://localhost:5100',
        expectedRelease: 'release-test',
        timeoutMs: 500,
      },
      fetcher,
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.output).not.toContain(secret);
    expect(result.output).toContain('GET /healthz 500');
  });
});
