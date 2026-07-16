import { describe, expect, it } from 'vitest';

import { auditEnvironmentExample, findSecretCandidates } from './config-audit.js';
import { validateDependencyExceptions } from './dependency-policy.js';
import { SECURITY_BEHAVIOR_TEST_FILES } from './run.js';

describe('V2 security audit helpers', () => {
  it('requires environment examples to contain names only', () => {
    expect(auditEnvironmentExample('DATABASE_URL=\nSESSION_SECRET=\n')).toEqual([]);
    expect(auditEnvironmentExample('SESSION_SECRET=real-value\n')).toContainEqual(expect.stringContaining('SESSION_SECRET'));
  });

  it('detects high-confidence committed secret formats without echoing values', () => {
    expect(findSecretCandidates(`-----BEGIN ${'PRIVATE'} KEY-----\nmaterial`)).toEqual(['private-key']);
    expect(findSecretCandidates('ordinary fixture text')).toEqual([]);
  });

  it('requires dependency exceptions to carry accountable review metadata', () => {
    expect(validateDependencyExceptions([])).toEqual([]);
    expect(validateDependencyExceptions([{ advisory: 'GHSA-test', owner: '', reason: '', reviewDate: '' }])).toHaveLength(3);
  });

  it('rejects expired dependency exceptions by UTC date while allowing the review day', () => {
    const exception = { advisory: 'GHSA-expired', owner: 'platform', reason: 'Temporary transitive exception', reviewDate: '2026-07-15' };
    expect(validateDependencyExceptions([exception], new Date('2026-07-16T00:00:00.000Z'))).toContain(
      'GHSA-expired exception review date 2026-07-15 expired before 2026-07-16 UTC',
    );
    expect(validateDependencyExceptions([{ ...exception, reviewDate: '2026-07-16' }], new Date('2026-07-16T23:59:59.999Z'))).toEqual([]);
    expect(validateDependencyExceptions([{ ...exception, reviewDate: '2026-08-15' }], new Date('2026-07-16T12:00:00.000Z'))).toEqual([]);
  });

  it('aggregates every required runtime security behavior suite', () => {
    expect(SECURITY_BEHAVIOR_TEST_FILES).toEqual(expect.arrayContaining([
      expect.stringContaining('security-policies.test.ts'),
      expect.stringContaining('providers.test.ts'),
      expect.stringContaining('governance.test.ts'),
      expect.stringContaining('map-query.test.ts'),
      expect.stringContaining('routes.test.ts'),
    ]));
  });
});
