export const SUPERUSER_NAME = '阿森';

export function isSuperuserName(name) {
  return name === SUPERUSER_NAME;
}

export function isSuperuser(user) {
  return isSuperuserName(user?.name);
}

export function isAdminUser(user) {
  return user?.role === 'admin';
}

export function canBypassFriendship(user) {
  return isAdminUser(user) || isSuperuser(user);
}
