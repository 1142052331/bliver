import { describe, expect, it } from 'vitest';

import { auditEnvironmentExample, findSecretCandidates } from './config-audit.js';
import { validateDependencyExceptions } from './dependency-policy.js';

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
});
