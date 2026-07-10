import { useEffect, useRef } from 'react';

const noop = () => {};

function callRequiredAction(action, actionName, destination, ...args) {
  if (typeof action === 'function') {
    action(...args);
    return;
  }

  console.error(
    `LegacyDestinationBridge requires an ${actionName} callback for the ${destination} destination.`,
  );
}

export default function LegacyDestinationBridge({
  destination,
  user,
  openTimeline,
  openFriends,
  openProfile,
  openAuth,
  onHandled = noop,
}) {
  const handledDestinationRef = useRef('map');

  useEffect(() => {
    if (destination === 'map') {
      handledDestinationRef.current = 'map';
      return;
    }

    if (handledDestinationRef.current === destination) return;
    handledDestinationRef.current = destination;

    if (destination === 'activity') {
      callRequiredAction(openTimeline, 'openTimeline', destination);
    } else if (destination === 'messages') {
      if (user) {
        callRequiredAction(openFriends, 'openFriends', destination);
      } else {
        callRequiredAction(openAuth, 'openAuth', destination, 'login', '登录后查看消息');
      }
    } else if (destination === 'me') {
      if (user?._id) {
        callRequiredAction(openProfile, 'openProfile', destination, user._id);
      } else {
        callRequiredAction(openAuth, 'openAuth', destination, 'login', '登录后查看个人主页');
      }
    }

    if (typeof onHandled === 'function') onHandled('map');
  }, [destination, onHandled, openAuth, openFriends, openProfile, openTimeline, user]);

  return null;
}
