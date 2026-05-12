const SUPERUSER_NAME = '阿森';

function isSuperuserName(name) {
  return name === SUPERUSER_NAME;
}

module.exports = { SUPERUSER_NAME, isSuperuserName };
