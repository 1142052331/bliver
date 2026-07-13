import { useEffect, useRef } from 'react';

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
  openFriends,
  openProfile,
  openAuth,
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
      handled = true;
    } else if (destination === 'messages') {
      handled = user
        ? callRequiredAction(openFriends, 'openFriends', destination)
        : callRequiredAction(openAuth, 'openAuth', destination, 'login', '登录后查看消息');
    } else if (destination === 'me') {
      handled = user?._id
        ? true
        : callRequiredAction(openAuth, 'openAuth', destination, 'login', '登录后查看个人主页');
    } else {
      console.error(`LegacyDestinationBridge received an unknown destination: ${destination}.`);
    }

    if (!handled) return;

    handledDestinationRef.current = destination;
  }, [destination, openAuth, openFriends, openProfile, user]);

  return null;
}
