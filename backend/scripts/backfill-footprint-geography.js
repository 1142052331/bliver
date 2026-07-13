#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const { connectDBOrThrow } = require('../config/db');
const { createFootprintBackfillService, validateBackfillOptions } = require('../services/FootprintBackfillService');

const EXECUTE_CONFIRMATION = 'BACKFILL_FOOTPRINT_GEOGRAPHY';
const PRODUCTION_CONFIRMATION = EXECUTE_CONFIRMATION;

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new TypeError(`${flag} requires a value`);
  return value;
}

function parseInteger(value, flag) {
  if (!/^-?\d+$/.test(value)) throw new TypeError(`${flag} must be an integer`);
  return Number(value);
}

function parseArgs(argv = [], env = process.env) {
  const options = {
    dryRun: true,
    limit: 100,
    cursor: null,
    delayMs: 0,
    retryFailed: false,
  };
  let explicitDryRun = false;
  let execute = false;
  let executeConfirmation = '';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      explicitDryRun = true;
    } else if (arg === '--execute') {
      execute = true;
      options.dryRun = false;
    } else if (arg === '--confirm-execute') {
      executeConfirmation = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--confirm-production') {
      executeConfirmation = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--retry-failed') {
      options.retryFailed = true;
    } else if (arg === '--limit') {
      options.limit = parseInteger(readValue(argv, index, arg), 'limit');
      index += 1;
    } else if (arg === '--cursor') {
      options.cursor = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--delay') {
      options.delayMs = parseInteger(readValue(argv, index, arg), 'delayMs');
      index += 1;
    } else {
      throw new TypeError('unknown option');
    }
  }

  if (explicitDryRun && execute) throw new TypeError('--dry-run and --execute are mutually exclusive');
  if (execute && executeConfirmation !== EXECUTE_CONFIRMATION) {
    if (!executeConfirmation) {
      throw new TypeError(
        `--confirm-execute ${EXECUTE_CONFIRMATION} is required; --confirm-production is a legacy alias`,
      );
    }
    throw new TypeError('invalid execute confirmation token');
  }

  const validated = validateBackfillOptions(options);
  if (!validated.dryRun && env.NODE_ENV === 'production') {
    if (validated.delayMs < 1000) {
      throw new RangeError('production execute delayMs must be at least 1000');
    }
    if (!validated.cursor && (validated.limit < 5 || validated.limit > 10)) {
      throw new RangeError('first production execute batch limit must be between 5 and 10');
    }
    if (validated.cursor && validated.limit > 100) {
      throw new RangeError('resumed production execute batch limit must not exceed 100');
    }
  }

  return validated;
}

async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  const logger = dependencies.logger || console;
  let options;
  try {
    options = parseArgs(argv, dependencies.env || process.env);
  } catch (error) {
    logger.error(`Invalid arguments: ${error.message}`);
    return 1;
  }

  const connect = dependencies.connectDB || connectDBOrThrow;
  const disconnect = dependencies.disconnect || (() => mongoose.disconnect());
  const createService = dependencies.createService || createFootprintBackfillService;
  let connectionAttempted = false;
  let exitCode = 0;
  try {
    connectionAttempted = true;
    await connect();
    const totals = await createService().run(options);
    logger.log(JSON.stringify({ mode: options.dryRun ? 'dry-run' : 'execute', ...totals }));
  } catch {
    logger.error('Footprint geography backfill failed');
    exitCode = 1;
  } finally {
    if (connectionAttempted) {
      try {
        await disconnect();
      } catch {
        logger.error('Database disconnect failed');
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
  parseArgs,
  runCli,
  EXECUTE_CONFIRMATION,
  PRODUCTION_CONFIRMATION,
};
