const AppError = require('../middleware/AppError');
const { SUPERUSER_NAME } = require('./superuser');

const FOUNDER_SYSTEM_IDENTITY = 'asen';

function isFounder(user) {
  return user?.systemIdentity === FOUNDER_SYSTEM_IDENTITY;
}

function isReservedName(name) {
  return typeof name === 'string' && name.trim() === SUPERUSER_NAME;
}

function assertNameClaimAllowed(name, currentUser = null) {
  if (isReservedName(name) && !isFounder(currentUser)) {
    throw new AppError(409, 'Name is reserved');
  }
}

module.exports = {
  FOUNDER_SYSTEM_IDENTITY,
  isFounder,
  isReservedName,
  assertNameClaimAllowed,
};
