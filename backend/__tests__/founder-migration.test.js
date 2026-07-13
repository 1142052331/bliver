const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { SUPERUSER_NAME } = require('../services/superuser');
const {
  EXECUTE_CONFIRMATION,
  parseArgs,
  migrateFounderIdentity,
  runCli,
} = require('../scripts/migrate-founder-identity');

describe('founder identity migration', () => {
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
    return mongoose.connection.db.collection(`founder_migration_${collectionSequence}`);
  }

  function founder(overrides = {}) {
    return {
      _id: new mongoose.Types.ObjectId(),
      name: SUPERUSER_NAME,
      role: 'user',
      sessionVersion: 3,
      ...overrides,
    };
  }

  test('defaults to dry-run and requires both execute confirmation arguments', () => {
    expect(parseArgs([])).toEqual({ execute: false });
    expect(parseArgs(['--dry-run'])).toEqual({ execute: false });
    expect(() => parseArgs(['--execute'])).toThrow('confirmation');
    expect(() => parseArgs(['--confirm-execute', EXECUTE_CONFIRMATION])).toThrow('--execute');
    expect(() => parseArgs(['--execute', '--confirm-execute', 'incorrect'])).toThrow('confirmation');
    expect(parseArgs(['--execute', '--confirm-execute', EXECUTE_CONFIRMATION]))
      .toEqual({ execute: true });
    expect(() => parseArgs(['--dry-run', '--execute', '--confirm-execute', EXECUTE_CONFIRMATION]))
      .toThrow('mutually exclusive');
  });

  test('dry-run finds the exact founder without changing data or indexes', async () => {
    const collection = freshCollection();
    const target = founder();
    await collection.insertMany([
      target,
      { _id: new mongoose.Types.ObjectId(), name: 'ordinary-user', role: 'user', sessionVersion: 0 },
    ]);

    await expect(migrateFounderIdentity({ collection })).resolves.toEqual({
      matched: 1,
      modified: 0,
      index: 'missing',
    });

    await expect(collection.findOne({ _id: target._id })).resolves.toMatchObject({
      role: 'user',
      sessionVersion: 3,
    });
    expect((await collection.listIndexes().toArray()).map(({ name }) => name)).toEqual(['_id_']);
  });

  test.each([
    ['no exact founder', [], 0],
    ['duplicate exact founders', [founder(), founder()], 2],
  ])('refuses %s before making any change', async (_label, documents, matched) => {
    const collection = freshCollection();
    if (documents.length > 0) await collection.insertMany(documents);

    await expect(migrateFounderIdentity({ collection, execute: true }))
      .rejects.toMatchObject({ status: { matched, modified: 0, index: 'not-checked' } });

    if (documents.length > 0) {
      expect(await collection.countDocuments({ role: 'admin' })).toBe(0);
    }
    const indexes = documents.length > 0 ? await collection.listIndexes().toArray() : [];
    expect(indexes.map(({ name }) => name)).not.toContain('systemIdentity_1');
  });

  test('refuses to take an identity already held by another account', async () => {
    const collection = freshCollection();
    const target = founder();
    await collection.insertMany([
      target,
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'identity-holder',
        role: 'user',
        systemIdentity: 'asen',
        sessionVersion: 0,
      },
    ]);

    await expect(migrateFounderIdentity({ collection, execute: true }))
      .rejects.toMatchObject({ status: { matched: 1, modified: 0, index: 'not-checked' } });

    await expect(collection.findOne({ _id: target._id })).resolves.not.toHaveProperty('systemIdentity');
    expect((await collection.listIndexes().toArray()).map(({ name }) => name))
      .not.toContain('systemIdentity_1');
  });

  test('executes once, preserves unrelated indexes, creates the unique sparse index, and reruns safely', async () => {
    const collection = freshCollection();
    const target = founder();
    await collection.insertOne(target);
    await collection.createIndex({ role: 1 }, { name: 'role_lookup' });

    await expect(migrateFounderIdentity({ collection, execute: true })).resolves.toEqual({
      matched: 1,
      modified: 1,
      index: 'created',
    });

    await expect(collection.findOne({ _id: target._id })).resolves.toMatchObject({
      role: 'admin',
      systemIdentity: 'asen',
      sessionVersion: 4,
    });
    const indexes = await collection.listIndexes().toArray();
    expect(indexes.map(({ name }) => name)).toContain('role_lookup');
    expect(indexes.find(({ name }) => name === 'systemIdentity_1')).toMatchObject({
      key: { systemIdentity: 1 },
      unique: true,
      sparse: true,
    });
    await expect(collection.insertOne({
      _id: new mongoose.Types.ObjectId(),
      name: 'second-identity',
      systemIdentity: 'asen',
    })).rejects.toMatchObject({ code: 11000 });

    await expect(migrateFounderIdentity({ collection, execute: true })).resolves.toEqual({
      matched: 1,
      modified: 0,
      index: 'ready',
    });
    expect((await collection.findOne({ _id: target._id })).sessionVersion).toBe(4);
  });

  test('uses the founder id and exact name as the update guard and explicitly disables upsert', async () => {
    const target = founder();
    const indexSnapshots = [[], [{
      name: 'systemIdentity_1',
      key: { systemIdentity: 1 },
      unique: true,
      sparse: true,
    }]];
    const collection = {
      find: jest.fn(() => ({
        limit: jest.fn(() => ({ toArray: jest.fn().mockResolvedValue([target]) })),
      })),
      findOne: jest.fn().mockResolvedValue(null),
      listIndexes: jest.fn(() => ({
        toArray: jest.fn().mockImplementation(async () => indexSnapshots.shift()),
      })),
      createIndex: jest.fn().mockResolvedValue('systemIdentity_1'),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    };

    await migrateFounderIdentity({ collection, execute: true });

    expect(collection.find).toHaveBeenCalledWith(
      { name: SUPERUSER_NAME },
      { projection: { _id: 1, name: 1, role: 1, systemIdentity: 1 } },
    );
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: target._id, name: SUPERUSER_NAME },
      {
        $set: { role: 'admin', systemIdentity: 'asen' },
        $inc: { sessionVersion: 1 },
      },
      { upsert: false },
    );
  });

  test('CLI emits only matched, modified, and index status fields', async () => {
    const logger = { log: jest.fn(), error: jest.fn() };
    const connectDB = jest.fn().mockResolvedValue(undefined);
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const migrate = jest.fn().mockResolvedValue({
      matched: 1,
      modified: 0,
      index: 'ready',
      name: SUPERUSER_NAME,
      id: new mongoose.Types.ObjectId().toString(),
    });

    await expect(runCli([], { logger, connectDB, disconnect, migrate, collection: {} }))
      .resolves.toBe(0);

    expect(migrate).toHaveBeenCalledWith({ collection: {}, execute: false });
    expect(logger.log).toHaveBeenCalledWith(JSON.stringify({
      matched: 1,
      modified: 0,
      index: 'ready',
    }));
    expect(logger.error).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  test('CLI rejects unconfirmed execution before connecting and sanitizes runtime failures', async () => {
    const logger = { log: jest.fn(), error: jest.fn() };
    const connectDB = jest.fn().mockResolvedValue(undefined);
    const disconnect = jest.fn().mockResolvedValue(undefined);

    await expect(runCli(['--execute'], { logger, connectDB, disconnect })).resolves.toBe(1);
    expect(connectDB).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenLastCalledWith(JSON.stringify({
      matched: 0,
      modified: 0,
      index: 'not-checked',
    }));

    const migrate = jest.fn().mockRejectedValue(
      new Error(`sensitive ${SUPERUSER_NAME} 507f1f77bcf86cd799439011`),
    );
    await expect(runCli([], { logger, connectDB, disconnect, migrate, collection: {} }))
      .resolves.toBe(1);
    expect(logger.error).toHaveBeenLastCalledWith(JSON.stringify({
      matched: 0,
      modified: 0,
      index: 'not-checked',
    }));
    expect(JSON.stringify(logger.mock?.calls || logger.error.mock.calls)).not.toContain(SUPERUSER_NAME);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('507f1f77bcf86cd799439011');
  });
});
