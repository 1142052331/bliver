const { SUPERUSER_NAME } = require('./superuser');

function isAdmin(user) {
  return user?.role === 'admin';
}

function isSuperuser(user) {
  return user?.name === SUPERUSER_NAME;
}

function isSuperuserName(name) {
  return name === SUPERUSER_NAME;
}

function canDeleteComment(actor, commentUserId, commentUserName) {
  if (actor.id === commentUserId?.toString()) return true;
  if (isSuperuser(actor)) return true;
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
