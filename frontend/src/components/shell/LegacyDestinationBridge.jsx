import { useEffect, useRef } from 'react';

const noop = () => {};

function callRequiredAction(action, actionName, destination, ...args) {
  if (typeof action === 'function') {
    action(...args);
    return true;
  }

  console.error(
    `LegacyDestinationBridge requires an ${actionName} callback for the ${destination} destination.`,
  );
  return false;
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

    let handled = false;

    if (destination === 'activity') {
      handled = callRequiredAction(openTimeline, 'openTimeline', destination);
    } else if (destination === 'messages') {
      handled = user
        ? callRequiredAction(openFriends, 'openFriends', destination)
        : callRequiredAction(openAuth, 'openAuth', destination, 'login', '登录后查看消息');
    } else if (destination === 'me') {
      handled = user?._id
        ? callRequiredAction(openProfile, 'openProfile', destination, user._id)
        : callRequiredAction(openAuth, 'openAuth', destination, 'login', '登录后查看个人主页');
    } else {
      console.error(`LegacyDestinationBridge received an unknown destination: ${destination}.`);
    }

    if (!handled) return;

    handledDestinationRef.current = destination;
    if (typeof onHandled === 'function') onHandled('map');
  }, [destination, onHandled, openAuth, openFriends, openProfile, openTimeline, user]);

  return null;
}
