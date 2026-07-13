#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const User = require('../models/User');
const { SUPERUSER_NAME } = require('../services/superuser');

const EXECUTE_CONFIRMATION = 'MIGRATE_BLIVER_FOUNDER';
const SYSTEM_IDENTITY = 'asen';
const INDEX_NAME = 'systemIdentity_1';
const DEFAULT_STATUS = Object.freeze({ matched: 0, modified: 0, index: 'not-checked' });
const SAFE_INDEX_STATUSES = new Set([
  'not-checked',
  'missing',
  'ready',
  'created',
  'invalid',
  'error',
]);

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new TypeError(`${flag} requires a value`);
  }
  return value;
}

function parseArgs(argv = []) {
  let execute = false;
  let explicitDryRun = false;
  let confirmation = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      explicitDryRun = true;
    } else if (arg === '--execute') {
      execute = true;
    } else if (arg === '--confirm-execute') {
      confirmation = readValue(argv, index, arg);
      index += 1;
    } else {
      throw new TypeError('unknown option');
    }
  }

  if (explicitDryRun && execute) {
    throw new TypeError('--dry-run and --execute are mutually exclusive');
  }
  if (confirmation !== null && !execute) {
    throw new TypeError('--confirm-execute requires --execute');
  }
  if (execute && confirmation !== EXECUTE_CONFIRMATION) {
    throw new TypeError('valid execution confirmation is required');
  }

  return { execute };
}

function statusError(message, status = DEFAULT_STATUS) {
  const error = new Error(message);
  error.status = { ...status };
  return error;
}

function sanitizeStatus(status) {
  return {
    matched: Number.isSafeInteger(status?.matched) && status.matched >= 0 ? status.matched : 0,
    modified: Number.isSafeInteger(status?.modified) && status.modified >= 0 ? status.modified : 0,
    index: SAFE_INDEX_STATUSES.has(status?.index) ? status.index : 'not-checked',
  };
}

function isExpectedIndex(index) {
  const keyEntries = Object.entries(index?.key || {});
  return index?.name === INDEX_NAME
    && keyEntries.length === 1
    && keyEntries[0][0] === 'systemIdentity'
    && keyEntries[0][1] === 1
    && index.unique === true
    && index.sparse === true;
}

async function inspectIdentityIndex(collection) {
  const indexes = await collection.listIndexes().toArray();
  const index = indexes.find((candidate) => candidate.name === INDEX_NAME);
  if (!index) return 'missing';
  if (!isExpectedIndex(index)) {
    throw statusError('system identity index is incompatible', {
      matched: 1,
      modified: 0,
      index: 'invalid',
    });
  }
  return 'ready';
}

async function ensureIdentityIndex(collection) {
  const status = await inspectIdentityIndex(collection);
  if (status === 'ready') return status;

  await collection.createIndex(
    { systemIdentity: 1 },
    { name: INDEX_NAME, unique: true, sparse: true },
  );
  const confirmedStatus = await inspectIdentityIndex(collection);
  if (confirmedStatus !== 'ready') {
    throw statusError('system identity index could not be confirmed', {
      matched: 1,
      modified: 0,
      index: 'error',
    });
  }
  return 'created';
}

async function migrateFounderIdentity({ collection = User.collection, execute = false } = {}) {
  const founders = await collection.find(
    { name: SUPERUSER_NAME },
    { projection: { _id: 1, name: 1, role: 1, systemIdentity: 1 } },
  ).limit(2).toArray();

  if (founders.length !== 1) {
    throw statusError('founder match count must be exactly one', {
      matched: founders.length,
      modified: 0,
      index: 'not-checked',
    });
  }

  const founder = founders[0];
  const conflictingIdentity = await collection.findOne(
    { systemIdentity: SYSTEM_IDENTITY, _id: { $ne: founder._id } },
    { projection: { _id: 1 } },
  );
  if (conflictingIdentity) {
    throw statusError('system identity is already assigned', {
      matched: 1,
      modified: 0,
      index: 'not-checked',
    });
  }

  if (!execute) {
    let index;
    try {
      index = await inspectIdentityIndex(collection);
    } catch (error) {
      if (error.status) throw error;
      throw statusError('system identity index inspection failed', {
        matched: 1,
        modified: 0,
        index: 'error',
      });
    }
    return { matched: 1, modified: 0, index };
  }

  let index;
  try {
    index = await ensureIdentityIndex(collection);
  } catch (error) {
    if (error.status) throw error;
    throw statusError('system identity index operation failed', {
      matched: 1,
      modified: 0,
      index: 'error',
    });
  }

  if (founder.role === 'admin' && founder.systemIdentity === SYSTEM_IDENTITY) {
    return { matched: 1, modified: 0, index };
  }

  let result;
  try {
    result = await collection.updateOne(
      { _id: founder._id, name: SUPERUSER_NAME },
      {
        $set: { role: 'admin', systemIdentity: SYSTEM_IDENTITY },
        $inc: { sessionVersion: 1 },
      },
      { upsert: false },
    );
  } catch {
    throw statusError('founder update failed', {
      matched: 0,
      modified: 0,
      index,
    });
  }

  if (result.matchedCount !== 1) {
    throw statusError('founder update guard did not match', {
      matched: result.matchedCount,
      modified: 0,
      index,
    });
  }

  return { matched: 1, modified: result.modifiedCount, index };
}

async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  const logger = dependencies.logger || console;
  let options;
  try {
    options = parseArgs(argv);
  } catch {
    logger.error(JSON.stringify(DEFAULT_STATUS));
    return 1;
  }

  const connect = dependencies.connectDB || (() => mongoose.connect(process.env.MONGODB_URI));
  const disconnect = dependencies.disconnect || (() => mongoose.disconnect());
  const migrate = dependencies.migrate || migrateFounderIdentity;
  const collection = dependencies.collection || (dependencies.User || User).collection;
  let connectionAttempted = false;
  let exitCode = 0;

  try {
    connectionAttempted = true;
    await connect();
    const result = await migrate({ collection, execute: options.execute });
    logger.log(JSON.stringify(sanitizeStatus(result)));
  } catch (error) {
    logger.error(JSON.stringify(sanitizeStatus(error.status)));
    exitCode = 1;
  } finally {
    if (connectionAttempted) {
      try {
        await disconnect();
      } catch {
        logger.error(JSON.stringify(DEFAULT_STATUS));
        exitCode = 1;
      }
    }
  }

  return exitCode;
}

if (require.main === module) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  EXECUTE_CONFIRMATION,
  parseArgs,
  migrateFounderIdentity,
  runCli,
};
