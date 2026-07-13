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

  test('defaults to dry-run and requires an expected database plus explicit execute confirmation', () => {
    const { EXECUTE_CONFIRMATION, parseArgs } = migrationApi();
    const databaseArgs = ['--expected-database', 'bliver_candidate'];

    expect(() => parseArgs([])).toThrow('--expected-database');
    expect(parseArgs(databaseArgs)).toEqual({
      execute: false,
      expectedDatabase: 'bliver_candidate',
    });
    expect(parseArgs(['--dry-run', ...databaseArgs])).toEqual({
      execute: false,
      expectedDatabase: 'bliver_candidate',
    });
    expect(() => parseArgs(['--execute', ...databaseArgs])).toThrow('confirmation');
    expect(() => parseArgs(['--confirm-execute', EXECUTE_CONFIRMATION])).toThrow('--execute');
    expect(() => parseArgs(['--execute', '--confirm-execute', 'incorrect', ...databaseArgs]))
      .toThrow('confirmation');
    expect(parseArgs(['--execute', '--confirm-execute', EXECUTE_CONFIRMATION, ...databaseArgs]))
      .toEqual({ execute: true, expectedDatabase: 'bliver_candidate' });
    expect(() => parseArgs([
      '--dry-run', '--execute', '--confirm-execute', EXECUTE_CONFIRMATION, ...databaseArgs,
    ]))
      .toThrow('mutually exclusive');
    expect(() => parseArgs(['--expected-database', '   '])).toThrow('--expected-database');
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
      { name: INDEX_NAME, expireAfterSeconds: 0, partialFilterExpression: { state: 'pending' } },
    );
    await collection.createIndex({ state: 1 }, { name: 'bootstrap_state_lookup' });

    await expect(removeAdminBootstrapTtlIndex({ collection, execute: true })).resolves.toEqual({
      index: 'absent',
      dropped: 1,
    });

    expect((await collection.listIndexes().toArray()).map(({ name }) => name))
      .toEqual(['_id_', 'bootstrap_state_lookup']);
  });

  test.each([
    ['wrong key', { state: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { state: 'pending' } }],
    ['wrong expiry', { leaseExpiresAt: 1 }, { expireAfterSeconds: 60, partialFilterExpression: { state: 'pending' } }],
    ['missing partial filter', { leaseExpiresAt: 1 }, { expireAfterSeconds: 0 }],
  ])('refuses to drop the named index with %s', async (_label, key, options) => {
    const { INDEX_NAME, removeAdminBootstrapTtlIndex } = migrationApi();
    const collection = freshCollection();
    await collection.createIndex(key, { name: INDEX_NAME, ...options });

    await expect(removeAdminBootstrapTtlIndex({ collection, execute: true }))
      .rejects.toThrow('definition');
    expect((await collection.listIndexes().toArray()).map(({ name }) => name))
      .toContain(INDEX_NAME);
  });

  test('reports dropped zero when another operator removes the index first', async () => {
    const { INDEX_NAME, removeAdminBootstrapTtlIndex } = migrationApi();
    const legacyIndex = {
      name: INDEX_NAME,
      key: { leaseExpiresAt: 1 },
      expireAfterSeconds: 0,
      partialFilterExpression: { state: 'pending' },
    };
    const collection = {
      listIndexes: jest.fn()
        .mockReturnValueOnce({ toArray: jest.fn().mockResolvedValue([legacyIndex]) })
        .mockReturnValueOnce({ toArray: jest.fn().mockResolvedValue([]) }),
      dropIndex: jest.fn().mockRejectedValue(Object.assign(new Error('gone'), {
        code: 27,
        codeName: 'IndexNotFound',
      })),
    };

    await expect(removeAdminBootstrapTtlIndex({ collection, execute: true })).resolves.toEqual({
      index: 'absent',
      dropped: 0,
    });
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
    const getDatabaseName = jest.fn().mockReturnValue('bliver_candidate');
    const removeIndex = jest.fn().mockResolvedValue({
      index: 'present',
      dropped: 0,
      uri: 'mongodb://private-host/database',
      secret: 'private-secret',
      userId: '507f1f77bcf86cd799439011',
    });

    await expect(runCli(['--expected-database', 'bliver_candidate'], {
      logger, connectDB, disconnect, getDatabaseName, removeIndex, collection: {},
    })).resolves.toBe(0);

    expect(logger.log).toHaveBeenCalledWith(JSON.stringify({ index: 'present', dropped: 0 }));
    expect(logger.error).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(/mongodb|private|507f1f77bcf86cd799439011/i);
  });

  test('CLI refuses a connected database identity mismatch before inspecting or mutating indexes', async () => {
    const { EXECUTE_CONFIRMATION, runCli } = migrationApi();
    const logger = { log: jest.fn(), error: jest.fn() };
    const connectDB = jest.fn().mockResolvedValue(undefined);
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const getDatabaseName = jest.fn().mockReturnValue('bliver_production');
    const removeIndex = jest.fn();

    await expect(runCli([
      '--execute',
      '--confirm-execute', EXECUTE_CONFIRMATION,
      '--expected-database', 'bliver_candidate',
    ], {
      logger, connectDB, disconnect, getDatabaseName, removeIndex, collection: {},
    })).resolves.toBe(1);

    expect(connectDB).toHaveBeenCalledTimes(1);
    expect(getDatabaseName).toHaveBeenCalledTimes(1);
    expect(removeIndex).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenLastCalledWith(JSON.stringify({ index: 'error', dropped: 0 }));
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
    await expect(runCli(['--expected-database', 'bliver_candidate'], {
      logger,
      connectDB,
      disconnect,
      getDatabaseName: () => 'bliver_candidate',
      removeIndex,
      collection: {},
    })).resolves.toBe(1);
    expect(logger.error).toHaveBeenLastCalledWith(JSON.stringify({ index: 'error', dropped: 0 }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/mongodb|private|secret|507f1f77bcf86cd799439011/i);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
