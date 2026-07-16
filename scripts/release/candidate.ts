import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

const shaPattern = /^[0-9a-f]{40}$/;

export function verifyReleaseIdentity(input: Readonly<{
  releaseSha: string;
  gitHead: string;
  renderGitCommit?: string;
}>): Readonly<{ releaseSha: string }> {
  if (!shaPattern.test(input.releaseSha)) throw new Error('RELEASE_SHA must be an exact 40-character Git SHA');
  if (input.gitHead !== input.releaseSha) throw new Error('RELEASE_SHA does not match Git HEAD');
  if (input.renderGitCommit && input.renderGitCommit !== input.releaseSha) {
    throw new Error('RELEASE_SHA does not match Render Git commit');
  }
  return { releaseSha: input.releaseSha };
}

export async function verifyCandidate(input: Readonly<{
  root: string;
  releaseSha: string;
  gitHead: string;
  renderGitCommit?: string;
}>): Promise<Readonly<{ releaseSha: string }>> {
  const identity = verifyReleaseIdentity(input);
  const required = ['apps/web/dist/index.html', 'apps/api/dist/bootstrap/server.js'] as const;
  for (const path of required) {
    try { await access(resolve(input.root, path)); }
    catch { throw new Error(`candidate build output is missing: ${path}`); }
  }
  return identity;
}
