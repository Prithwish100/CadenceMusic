import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-[#18181E] border border-[#E25822]/40 px-3.5 py-1.5 text-xs font-medium text-[#F5F5F7] shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2"
    >
      <span className="h-2 w-2 rounded-full bg-[#E25822] animate-ping" />
      <WifiOff className="w-3.5 h-3.5 text-[#E25822]" />
      <span>Offline Mode — Playing from cached library</span>
    </aside>
  );
};
