import { MigrationError } from '../domain/types.js';

interface ProcessResult { readonly code: number }
type Runner = (command: string, args: readonly string[]) => Promise<ProcessResult>;
export interface ArchiveOptions { readonly protectedMongoConfig: string; readonly database: string; readonly recipientFile: string; readonly output: string }

export function createArchive(run: Runner = async () => ({ code: 0 })) {
  return {
    async dump(options: ArchiveOptions) {
      const dump = await run('mongodump', ['--config', options.protectedMongoConfig, '--db', options.database, '--archive', '--gzip']);
      if (dump.code !== 0) throw new MigrationError('MONGODUMP_FAILED');
      const encrypted = await run('age', ['--recipient-file', options.recipientFile, '--output', options.output]);
      if (encrypted.code !== 0) throw new MigrationError('AGE_ENCRYPTION_FAILED');
    },
  };
}
