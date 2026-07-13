const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

function loadMigration() {
  try {
    return require('../scripts/remove-admin-bootstrap-ttl-index');
  } catch (loadError) {
    return { loadError };
  }
}

describe('admin bootstrap TTL index migration', () => {
  let mongoServer;
  let collectionSequence = 0;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(() => jest.restoreAllMocks());

  function freshCollection() {
    collectionSequence += 1;
    return mongoose.connection.db.collection(`admin_bootstrap_index_${collectionSequence}`);
  }

  function migrationApi() {
    const api = loadMigration();
    expect(api.loadError).toBeUndefined();
    return api;
  }

  test('defaults to dry-run and requires explicit execute confirmation', () => {
    const { EXECUTE_CONFIRMATION, parseArgs } = migrationApi();

    expect(parseArgs([])).toEqual({ execute: false });
    expect(parseArgs(['--dry-run'])).toEqual({ execute: false });
    expect(() => parseArgs(['--execute'])).toThrow('confirmation');
    expect(() => parseArgs(['--confirm-execute', EXECUTE_CONFIRMATION])).toThrow('--execute');
    expect(() => parseArgs(['--execute', '--confirm-execute', 'incorrect'])).toThrow('confirmation');
    expect(parseArgs(['--execute', '--confirm-execute', EXECUTE_CONFIRMATION]))
      .toEqual({ execute: true });
    expect(() => parseArgs(['--dry-run', '--execute', '--confirm-execute', EXECUTE_CONFIRMATION]))
      .toThrow('mutually exclusive');
    expect(() => parseArgs(['--unknown'])).toThrow('unknown option');
  });

  test('dry-run reports the named TTL index without changing indexes', async () => {
    const { INDEX_NAME, removeAdminBootstrapTtlIndex } = migrationApi();
    const collection = freshCollection();
    await collection.createIndex(
      { leaseExpiresAt: 1 },
      { name: INDEX_NAME, expireAfterSeconds: 0, partialFilterExpression: { state: 'pending' } },
    );
    await collection.createIndex({ state: 1 }, { name: 'bootstrap_state_lookup' });
    const before = await collection.listIndexes().toArray();

    await expect(removeAdminBootstrapTtlIndex({ collection })).resolves.toEqual({
      index: 'present',
      dropped: 0,
    });

    expect(await collection.listIndexes().toArray()).toEqual(before);
  });

  test('execute drops only the exact obsolete index and confirms absence', async () => {
    const { INDEX_NAME, removeAdminBootstrapTtlIndex } = migrationApi();
    const collection = freshCollection();
    await collection.createIndex(
      { leaseExpiresAt: 1 },
      { name: INDEX_NAME, expireAfterSeconds: 0 },
    );
    await collection.createIndex({ state: 1 }, { name: 'bootstrap_state_lookup' });

    await expect(removeAdminBootstrapTtlIndex({ collection, execute: true })).resolves.toEqual({
      index: 'absent',
      dropped: 1,
    });

    expect((await collection.listIndexes().toArray()).map(({ name }) => name))
      .toEqual(['_id_', 'bootstrap_state_lookup']);
  });

  test('does not drop a differently named TTL index', async () => {
    const { removeAdminBootstrapTtlIndex } = migrationApi();
    const collection = freshCollection();
    await collection.createIndex(
      { leaseExpiresAt: 1 },
      { name: 'different_bootstrap_ttl', expireAfterSeconds: 0 },
    );

    await expect(removeAdminBootstrapTtlIndex({ collection, execute: true })).resolves.toEqual({
      index: 'absent',
      dropped: 0,
    });
    expect((await collection.listIndexes().toArray()).map(({ name }) => name))
      .toContain('different_bootstrap_ttl');
  });

  test('execute is idempotent when the obsolete index is already absent', async () => {
    const { removeAdminBootstrapTtlIndex } = migrationApi();
    const collection = freshCollection();
    await collection.createIndex({ state: 1 }, { name: 'bootstrap_state_lookup' });

    await expect(removeAdminBootstrapTtlIndex({ collection, execute: true })).resolves.toEqual({
      index: 'absent',
      dropped: 0,
    });
  });

  test('dry-run treats an uncreated bootstrap collection as absent without creating it', async () => {
    const { removeAdminBootstrapTtlIndex } = migrationApi();
    const collection = freshCollection();

    await expect(removeAdminBootstrapTtlIndex({ collection })).resolves.toEqual({
      index: 'absent',
      dropped: 0,
    });
    await expect(mongoose.connection.db.listCollections({ name: collection.collectionName }).hasNext())
      .resolves.toBe(false);
  });

  test('CLI emits only sanitized index and dropped status fields', async () => {
    const { runCli } = migrationApi();
    const logger = { log: jest.fn(), error: jest.fn() };
    const connectDB = jest.fn().mockResolvedValue(undefined);
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const removeIndex = jest.fn().mockResolvedValue({
      index: 'present',
      dropped: 0,
      uri: 'mongodb://private-host/database',
      secret: 'private-secret',
      userId: '507f1f77bcf86cd799439011',
    });

    await expect(runCli([], {
      logger, connectDB, disconnect, removeIndex, collection: {},
    })).resolves.toBe(0);

    expect(logger.log).toHaveBeenCalledWith(JSON.stringify({ index: 'present', dropped: 0 }));
    expect(logger.error).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(/mongodb|private|507f1f77bcf86cd799439011/i);
  });

  test('CLI rejects unconfirmed execution before connecting and sanitizes runtime failures', async () => {
    const { runCli } = migrationApi();
    const logger = { log: jest.fn(), error: jest.fn() };
    const connectDB = jest.fn().mockResolvedValue(undefined);
    const disconnect = jest.fn().mockResolvedValue(undefined);

    await expect(runCli(['--execute'], { logger, connectDB, disconnect })).resolves.toBe(1);
    expect(connectDB).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenLastCalledWith(JSON.stringify({
      index: 'not-checked',
      dropped: 0,
    }));

    const removeIndex = jest.fn().mockRejectedValue(
      new Error('mongodb://private-host secret 507f1f77bcf86cd799439011'),
    );
    await expect(runCli([], {
      logger, connectDB, disconnect, removeIndex, collection: {},
    })).resolves.toBe(1);
    expect(logger.error).toHaveBeenLastCalledWith(JSON.stringify({ index: 'error', dropped: 0 }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/mongodb|private|secret|507f1f77bcf86cd799439011/i);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
