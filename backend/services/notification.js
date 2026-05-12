const Notification = require('../models/Notification');
const { sendPushToUser } = require('../routes/push');
const bus = require('../events/bus');

/**
 * 创建通知：写入数据库 + Socket 实时推送 + Web Push 离线推送。
 * 由各个路由调用（reaction、comment、profile_view）。
 */
function makeCreateNotification() {
  return async function createNotification({ recipientId, senderName, type, footprintId, content }) {
    const notifData = { recipientId, senderName, type, content };
    if (footprintId) notifData.footprintId = footprintId;
    const notif = await Notification.create(notifData);
    bus.emit('new_notification', { recipientId, notification: notif });

    let pushTitle;
    if (type === 'reaction') {
      pushTitle = `${senderName} 对你的打卡表示了 ${content}`;
    } else if (type === 'profile_view') {
      pushTitle = `${senderName} 浏览了你的主页`;
    } else {
      pushTitle = `${senderName} 评论了你`;
    }
    sendPushToUser(recipientId, {
      title: pushTitle,
      body: content,
      icon: '/marker-icon.png',
      data: { url: footprintId ? `/?fp=${footprintId}` : '/' },
    });
  };
}

module.exports = { makeCreateNotification };
