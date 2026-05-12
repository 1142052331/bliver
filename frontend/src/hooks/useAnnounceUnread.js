import { useState, useEffect } from 'react';
import { apiClient } from '../api';
import { hasUnreadAnnouncements } from '../components/AnnouncementPanel';

export default function useAnnounceUnread(user) {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasUnread(false);
      return;
    }
    let cancelled = false;
    apiClient.announcements.list().then(({ data }) => {
      if (!cancelled && data?.announcements) {
        setHasUnread(hasUnreadAnnouncements(data.announcements));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const clearUnread = () => setHasUnread(false);

  return [hasUnread, clearUnread];
}
