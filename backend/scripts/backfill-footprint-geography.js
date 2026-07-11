#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const { connectDBOrThrow } = require('../config/db');
const { createFootprintBackfillService, validateBackfillOptions } = require('../services/FootprintBackfillService');

const PRODUCTION_CONFIRMATION = 'BACKFILL_FOOTPRINT_GEOGRAPHY';

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
  let productionConfirmation = '';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      explicitDryRun = true;
    } else if (arg === '--execute') {
      execute = true;
      options.dryRun = false;
    } else if (arg === '--confirm-production') {
      productionConfirmation = readValue(argv, index, arg);
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
      throw new TypeError(`unknown option: ${arg}`);
    }
  }

  if (explicitDryRun && execute) throw new TypeError('--dry-run and --execute are mutually exclusive');
  if (execute && env.NODE_ENV === 'production' && productionConfirmation !== PRODUCTION_CONFIRMATION) {
    if (!productionConfirmation) {
      throw new TypeError(`--confirm-production ${PRODUCTION_CONFIRMATION} is required in production`);
    }
    throw new TypeError('invalid production confirmation token');
  }

  return validateBackfillOptions(options);
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
  try {
    connectionAttempted = true;
    await connect();
    const totals = await createService().run(options);
    logger.log(JSON.stringify({ mode: options.dryRun ? 'dry-run' : 'execute', ...totals }));
    return 0;
  } catch {
    logger.error('Footprint geography backfill failed');
    return 1;
  } finally {
    if (connectionAttempted) {
      try {
        await disconnect();
      } catch {
        logger.error('Database disconnect failed');
      }
    }
  }
}

if (require.main === module) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = { parseArgs, runCli, PRODUCTION_CONFIRMATION };
