import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import dns from 'node:dns';

import { createCloudinaryMetadataPort, verifyCloudinaryImage, type VerifiedMedia } from './adapters/cloudinary.js';
import { createMongoCollectionsSource, type MongoCollectionsSource } from './adapters/mongo-source.js';
import { createPostgresTarget, loadMigration } from './adapters/postgres-target.js';
import { FixtureSource } from './adapters/fixture-source.js';
import { loadConfig } from './config.js';
import { preflight } from './domain/preflight.js';
import { applyPreservationPolicy } from './domain/source-policy.js';
import { buildMigrationPlan } from './domain/transform.js';

type Environment = Readonly<Record<string, string | undefined>>;
type SourceFactory = (url: string, database: string) => Promise<MongoCollectionsSource>;

function configureDns(environment: Environment): void {
  const servers = environment.LEGACY_MONGO_DNS_SERVERS?.split(',').map((value) => value.trim()).filter(Boolean);
  if (servers?.length) dns.setServers(servers);
}

export async function runCli(
  args: readonly string[],
  environment: Environment,
  print: (line: string) => void,
  sourceFactory: SourceFactory = createMongoCollectionsSource,
): Promise<number> {
  const command = args[0];
  if (command === 'preflight' && args.includes('--fixture')) {
    const index = args.indexOf('--fixture');
    const path = args[index + 1];
    if (!path) { print('FIXTURE_REQUIRED'); return 1; }
    const result = preflight(await (await FixtureSource.fromFile(resolve(path))).collections());
    print(JSON.stringify({ summary: result.summary, defaultedVisibilityCount: result.defaultedVisibilityCount, errors: result.errors }));
    return result.errors.length ? 1 : 0;
  }
  if (command === 'preflight' && args.includes('--source')) {
    const config = loadConfig(environment);
    if (!config.ok) { print(config.code); return 1; }
    const url = environment.LEGACY_MONGO_URL?.trim();
    const database = environment.LEGACY_MONGO_DATABASE?.trim();
    if (!url) { print('MONGO_URL_REQUIRED'); return 1; }
    if (!database) { print('MONGO_DATABASE_REQUIRED'); return 1; }
    let source: MongoCollectionsSource | undefined;
    try {
      configureDns(environment);
      source = await sourceFactory(url, database);
      const policy = applyPreservationPolicy(await source.collections());
      const result = preflight(policy.collections);
      print(JSON.stringify({
        summary: result.summary,
        defaultedVisibilityCount: result.defaultedVisibilityCount,
        errors: result.errors,
        preservation: {
          recoveredCommentAuthors: policy.recoveredCommentAuthors,
          defaultedReactionTimestamps: policy.defaultedReactionTimestamps,
          tombstoneUsers: policy.tombstoneUsers,
          archivedDanglingNotifications: policy.archivedDanglingNotifications,
          archivedDanglingPushSubscriptions: policy.archivedDanglingPushSubscriptions,
          archivedDanglingReports: policy.archivedDanglingReports,
        },
      }));
      return result.errors.length ? 1 : 0;
    } catch (error) {
      print(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'SOURCE_PREFLIGHT_FAILED');
      return 1;
    } finally {
      await source?.close();
    }
  }
  if (command === 'migrate' && args.includes('--source')) {
    const url = environment.LEGACY_MONGO_URL?.trim();
    const database = environment.LEGACY_MONGO_DATABASE?.trim();
    const targetUrl = environment.TARGET_DATABASE_URL?.trim();
    const cloudName = environment.CLOUDINARY_CLOUD_NAME?.trim();
    const cloudKey = environment.CLOUDINARY_API_KEY?.trim();
    const cloudSecret = environment.CLOUDINARY_API_SECRET?.trim();
    const v1Vapid = environment.LEGACY_VAPID_PUBLIC_KEY?.trim();
    const v2Vapid = environment.V2_VAPID_PUBLIC_KEY?.trim();
    const archiveIndex = args.indexOf('--archive');
    const archivePath = archiveIndex >= 0 ? args[archiveIndex + 1] : undefined;
    if (!url) { print('MONGO_URL_REQUIRED'); return 1; }
    if (!database) { print('MONGO_DATABASE_REQUIRED'); return 1; }
    if (!targetUrl) { print('TARGET_DATABASE_URL_REQUIRED'); return 1; }
    if (!archivePath || environment.ARCHIVE_RESTORE_VERIFIED !== 'true') { print('ARCHIVE_RESTORE_EVIDENCE_REQUIRED'); return 1; }
    if (!cloudName || !cloudKey || !cloudSecret) { print('CLOUDINARY_METADATA_CONFIG_REQUIRED'); return 1; }
    try { await access(resolve(archivePath)); } catch { print('ARCHIVE_NOT_FOUND'); return 1; }
    let source: MongoCollectionsSource | undefined;
    const target = createPostgresTarget(targetUrl);
    try {
      configureDns(environment);
      source = await sourceFactory(url, database);
      const policy = applyPreservationPolicy(await source.collections());
      const result = preflight(policy.collections);
      if (result.errors.length) {
        print(JSON.stringify({ summary: result.summary, errors: result.errors }));
        return 1;
      }
      const media = new Map<string, VerifiedMedia>();
      const metadata = createCloudinaryMetadataPort(cloudName, cloudKey, cloudSecret);
      for (const footprint of policy.collections.Footprint) {
        const photoUrl = String(footprint.photoUrl ?? '').trim();
        if (photoUrl) media.set(String(footprint._id), await verifyCloudinaryImage(photoUrl, cloudName, metadata));
      }
      const plan = buildMigrationPlan(policy.collections, media, {
        ...(v1Vapid ? { v1VapidPublicKey: v1Vapid } : {}),
        ...(v2Vapid ? { v2VapidPublicKey: v2Vapid } : {}),
      });
      await loadMigration(target, plan);
      print(JSON.stringify({
        status: 'MIGRATED',
        source: result.summary.source,
        archivedOnly: result.summary.archivedOnly,
        targetRows: Object.fromEntries(Object.entries(plan.rows).filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1])).map(([name, value]) => [name, value.length])),
        digest: plan.digest,
      }));
      return 0;
    } catch (error) {
      print(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'MIGRATION_FAILED');
      return 1;
    } finally {
      await source?.close();
      await target.close();
    }
  }
  print('PHASE_B_SOURCE_REQUIRED');
  return 1;
}

if (process.argv[1]?.endsWith('cli.ts')) {
  runCli(process.argv.slice(2), process.env, (line) => process.stdout.write(`${line}\n`)).then((code) => { process.exitCode = code; });
}
