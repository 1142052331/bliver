const { SUPERUSER_NAME } = require('./superuser');
const { isFounder } = require('./UserIdentityPolicy');

function isAdmin(user) {
  return user?.role === 'admin';
}

function isSuperuser(user) {
  return isFounder(user);
}

function isSuperuserName(name) {
  return name === SUPERUSER_NAME;
}

function canDeleteComment(actor, commentUserId, commentUserName) {
  if (actor.id === commentUserId?.toString()) return true;
  if (isAdmin(actor)) return true;
  return false;
}

function shouldIncludeSuperuser(user) {
  return !isSuperuser(user);
}

function shouldIncludeChatFriends(user) {
  return isSuperuser(user);
}

module.exports = {
  isAdmin,
  isSuperuser,
  isSuperuserName,
  canDeleteComment,
  shouldIncludeSuperuser,
  shouldIncludeChatFriends,
};
