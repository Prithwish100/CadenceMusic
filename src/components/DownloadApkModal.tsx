import React from 'react';
import {
  CheckCircle2,
  Download,
  HelpCircle,
  Radio,
  Smartphone,
  X,
  Zap,
} from 'lucide-react';

interface DownloadApkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadApkModal: React.FC<DownloadApkModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="apk-modal-title"
      className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#14141A] border border-white/[0.09] rounded-2xl p-6 shadow-2xl relative space-y-5 text-left max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#E25822] to-[#B33E10] flex items-center justify-center text-white shadow-lg shadow-[#E25822]/20 shrink-0">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h2 id="apk-modal-title" className="text-lg font-bold text-[#F5F5F7] font-display">
                  Cadence Flutter APK
                </h2>
                <span className="text-xs font-medium text-[#94949E]">
                  v1.4
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E25822]/20 text-[#E25822] border border-[#E25822]/30">
                  Android 16 Ready
                </span>
              </div>
              <p className="text-xs text-[#94949E]">
                Native Background Audio + Lock Screen Controls + Google Account Sign-In
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 text-[#94949E] hover:text-[#F5F5F7] hover:bg-white/[0.06] rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Why choose the APK */}
        <div className="p-4 rounded-xl bg-[#E25822]/10 border-l-4 border-[#E25822] space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#E25822]">
            <HelpCircle className="w-4 h-4 shrink-0" />
            <span>Why install the Cadence Android APK?</span>
          </div>
          <p className="text-sm text-[#F5F5F7] leading-relaxed italic">
            &ldquo;Browser tabs may throttle background audio due to mobile battery restrictions. Install the native Cadence Flutter APK for uninterrupted background playback, lock-screen controls, and instant Google sign-in.&rdquo;
          </p>
        </div>

        {/* Key Native Advantages */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[#1C1C24] border border-white/[0.06] space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[#F5F5F7]">
              <Radio className="w-3.5 h-3.5 text-[#E25822]" />
              <span>Android Foreground Service</span>
            </div>
            <p className="text-[#94949E] leading-normal">
              Maintains high-priority playback even when screen is locked or switching between apps.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#1C1C24] border border-white/[0.06] space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[#F5F5F7]">
              <Zap className="w-3.5 h-3.5 text-[#E25822]" />
              <span>External Browser Google Auth</span>
            </div>
            <p className="text-[#94949E] leading-normal">
              Signs in securely through your browser and automatically redirects right back into the app.
            </p>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="space-y-2.5 pt-1">
          <a
            href="/cadence-flutter-test.apk?v=1.4.0"
            download="Cadence-Flutter-v1.4.apk"
            className="w-full py-3 px-4 rounded-xl bg-[#E25822] hover:bg-[#F06A35] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#E25822]/25 hover:shadow-[#E25822]/40 transition-all cursor-pointer group"
          >
            <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
            <span>Download Cadence APK</span>
            <span className="text-[11px] text-white/80 font-normal">v1.4</span>
          </a>

          <div className="flex items-center justify-between text-[11px] text-[#94949E] px-1">
            <span>Direct Flutter APK build (v1.4.0)</span>
            <a
              href="/download/apk?v=1.4.0"
              download="Cadence-Flutter-v1.4.apk"
              className="text-[#E25822] hover:underline"
            >
              Alternative download link <span className="text-[10px] opacity-80">v1.4</span>
            </a>
          </div>
        </div>

        {/* Native Features Summary */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-1.5 text-[11px] text-[#94949E]">
          <div className="flex items-start gap-2 text-[#F5F5F7]">
            <CheckCircle2 className="w-4 h-4 text-[#E25822] shrink-0 mt-0.5" />
            <span className="font-semibold text-xs">Notification Bar Mini Player &amp; Zero-Buffer Engine</span>
          </div>
          <p className="leading-relaxed">
            Includes full Android Notification Bar &amp; Lock Screen Mini Player (with Album Art, Seek Bar, Play/Pause, Next/Previous) and multi-threaded background pre-buffering.
          </p>
        </div>

        {/* Close / Dismiss */}
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#94949E] hover:text-[#F5F5F7] hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            Continue on Website
          </button>
        </div>
      </div>
    </div>
  );
};

