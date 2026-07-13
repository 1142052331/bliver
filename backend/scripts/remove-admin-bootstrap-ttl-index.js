#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const AdminBootstrap = require('../models/AdminBootstrap');
const { connectDBOrThrow } = require('../config/db');

const INDEX_NAME = 'admin_bootstrap_pending_ttl';
const EXECUTE_CONFIRMATION = 'DROP_ADMIN_BOOTSTRAP_TTL_INDEX';
const DEFAULT_STATUS = Object.freeze({ index: 'not-checked', dropped: 0 });
const SAFE_INDEX_STATUSES = new Set(['not-checked', 'present', 'absent', 'error']);

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

function sanitizeStatus(status) {
  return {
    index: SAFE_INDEX_STATUSES.has(status?.index) ? status.index : 'not-checked',
    dropped: status?.dropped === 1 ? 1 : 0,
  };
}

async function hasObsoleteIndex(collection) {
  try {
    const indexes = await collection.listIndexes().toArray();
    return indexes.some((index) => index.name === INDEX_NAME);
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return false;
    throw error;
  }
}

async function removeAdminBootstrapTtlIndex({ collection = AdminBootstrap.collection, execute = false } = {}) {
  const present = await hasObsoleteIndex(collection);
  if (!present || !execute) {
    return { index: present ? 'present' : 'absent', dropped: 0 };
  }

  try {
    await collection.dropIndex(INDEX_NAME);
  } catch (error) {
    // A concurrent operator may have removed it; the post-check makes this
    // operation idempotent without ever touching another index.
    if (error?.code !== 27 && error?.codeName !== 'IndexNotFound') throw error;
  }

  if (await hasObsoleteIndex(collection)) {
    throw new Error('admin bootstrap TTL index still exists');
  }
  return { index: 'absent', dropped: 1 };
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

  const connect = dependencies.connectDB || connectDBOrThrow;
  const disconnect = dependencies.disconnect || (() => mongoose.disconnect());
  const removeIndex = dependencies.removeIndex || removeAdminBootstrapTtlIndex;
  const collection = dependencies.collection || AdminBootstrap.collection;
  let connectionAttempted = false;
  let exitCode = 0;

  try {
    connectionAttempted = true;
    await connect();
    const result = await removeIndex({ collection, execute: options.execute });
    logger.log(JSON.stringify(sanitizeStatus(result)));
  } catch {
    logger.error(JSON.stringify({ index: 'error', dropped: 0 }));
    exitCode = 1;
  } finally {
    if (connectionAttempted) {
      try {
        await disconnect();
      } catch {
        logger.error(JSON.stringify({ index: 'error', dropped: 0 }));
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
  INDEX_NAME,
  EXECUTE_CONFIRMATION,
  parseArgs,
  removeAdminBootstrapTtlIndex,
  runCli,
};
