import React from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { isRunningInNativeApk } from '../utils/nativeStreamResolver';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'pill' | 'compact';
  onOpenDownloadApk?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'pill',
  onOpenDownloadApk,
}) => {
  // Hide the Install APK button when already running inside the native Android APK
  if (isRunningInNativeApk()) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => onOpenDownloadApk?.()}
      className={`group flex items-center gap-1 sm:gap-1.5 rounded-full transition-all duration-150 active:scale-95 cursor-pointer shrink-0 ${
        variant === 'compact'
          ? 'h-8 px-2 sm:px-2.5 bg-[#18181E] hover:bg-[#22222A] text-[#F5F5F7] border border-white/[0.08]'
          : 'px-3.5 py-1.5 bg-gradient-to-r from-[#E25822] to-[#F06A35] hover:brightness-110 text-white font-medium shadow-md shadow-[#E25822]/20'
      } ${className}`}
      title="Download Cadence Android APK (v1.4)"
      aria-label="Install"
    >
      <ArrowDownToLine className="w-3.5 h-3.5 transition-transform group-hover:translate-y-0.5 shrink-0" />
      <span className="text-[11px] font-semibold whitespace-nowrap">Install</span>
      <span className="text-[9px] font-medium opacity-80 whitespace-nowrap">v1.4</span>
    </button>
  );
};

