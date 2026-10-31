import React, { useState } from 'react';
import { ArrowDownToLine, Share2, Sparkles, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { isRunningInNativeApk } from '../utils/nativeStreamResolver';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'pill' | 'compact';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'pill',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed as standalone PWA or running inside the native Android APK, suppress the button (keep on website)
  if (isInstalled || isRunningInNativeApk()) {
    return null;
  }

  // Handle click for Chromium / Android / Desktop or fallback
  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      // In browsers where beforeinstallprompt hasn't fired yet or is blocked, show guidance
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`group flex items-center gap-1 rounded-full transition-all duration-150 active:scale-95 ${
          variant === 'compact'
            ? 'h-8 px-2.5 bg-[#18181E] hover:bg-[#22222A] text-[#F5F5F7] border border-white/[0.08]'
            : 'px-3 py-1.5 bg-gradient-to-r from-[#E25822] to-[#F06A35] hover:brightness-110 text-white font-medium shadow-md shadow-[#E25822]/20'
        } ${className}`}
        title="Install Cadence as an app on your device"
        aria-label="Install"
      >
        <ArrowDownToLine className="w-3 h-3 transition-transform group-hover:translate-y-0.5 shrink-0" />
        <span className="text-[11px] font-semibold whitespace-nowrap">Install</span>
      </button>

      {/* iOS & Browser Guidance Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl bg-[#121216] border border-white/[0.1] p-6 shadow-2xl relative text-left">
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-[#94949E] hover:text-[#F5F5F7] hover:bg-white/[0.08] transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E25822] to-[#B83A0E] flex items-center justify-center text-white shadow-lg shadow-[#E25822]/25">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F5F7] font-display">Install Cadence</h3>
                <p className="text-xs text-[#94949E]">Fast, offline-ready standalone player</p>
              </div>
            </div>

            <div className="space-y-3 py-2 text-xs sm:text-sm text-[#F5F5F7]/85 border-y border-white/[0.06] my-4">
              {isIOS ? (
                <>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-white/[0.08] text-[#E25822] font-bold flex items-center justify-center shrink-0 text-xs">
                      1
                    </span>
                    <p>
                      Tap the <Share2 className="w-3.5 h-3.5 inline mx-1 text-[#E25822]" />{' '}
                      <strong>Share</strong> button in Safari&apos;s bottom navigation bar.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-white/[0.08] text-[#E25822] font-bold flex items-center justify-center shrink-0 text-xs">
                      2
                    </span>
                    <p>
                      Scroll down and tap <strong>Add to Home Screen</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-white/[0.08] text-[#E25822] font-bold flex items-center justify-center shrink-0 text-xs">
                      3
                    </span>
                    <p>
                      Tap <strong>Add</strong> in the top-right corner to launch Cadence directly from
                      your home screen!
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-white/[0.08] text-[#E25822] font-bold flex items-center justify-center shrink-0 text-xs">
                      1
                    </span>
                    <p>
                      In Chrome, Edge, or Brave, look for the <strong>Install</strong> icon in the
                      address bar (right side).
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-white/[0.08] text-[#E25822] font-bold flex items-center justify-center shrink-0 text-xs">
                      2
                    </span>
                    <p>
                      Or click the browser menu (<strong>⋮</strong> or <strong>…</strong>) and select{' '}
                      <strong>&quot;Install Cadence&quot;</strong>.
                    </p>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-[#E25822] hover:bg-[#F06A35] text-white text-xs font-bold transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
