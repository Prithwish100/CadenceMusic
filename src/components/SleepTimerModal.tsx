import React, { useState } from 'react';
import { Check, Clock, Moon, Plus, Sparkles, X } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { formatTime } from '../utils/formatTime';

const PRESET_OPTIONS = [
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '1 hour', minutes: 60 },
];

export const SleepTimerModal: React.FC = () => {
  const {
    currentTrack,
    currentTime,
    duration,
    sleepTimerRemaining,
    sleepTimerTotal,
    sleepTimerMode,
    isSleepTimerOpen,
    setIsSleepTimerOpen,
    setSleepTimer,
    cancelSleepTimer,
    extendSleepTimer,
  } = usePlayer();

  const [customMinutes, setCustomMinutes] = useState<string>('');
  const [customError, setCustomError] = useState<string | null>(null);

  if (!isSleepTimerOpen) return null;

  const handleClose = () => {
    setIsSleepTimerOpen(false);
    setCustomError(null);
  };

  const handleSetPreset = (minutes: number) => {
    setSleepTimer(minutes);
    handleClose();
  };

  const handleSetEndOfTrack = () => {
    setSleepTimer('end_of_track');
    handleClose();
  };

  const handleSetCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customMinutes, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setCustomError('Please enter a valid number of minutes (1-720)');
      return;
    }
    if (parsed > 720) {
      setCustomError('Maximum sleep timer duration is 12 hours (720 minutes)');
      return;
    }
    setSleepTimer(parsed);
    setCustomMinutes('');
    setCustomError(null);
    handleClose();
  };

  const formatCountdown = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const remainingTrackTime = Math.max(0, Math.round((duration || 200) - currentTime));

  const progressPercent =
    sleepTimerRemaining !== null && sleepTimerTotal && sleepTimerTotal > 0
      ? Math.max(0, Math.min(100, (sleepTimerRemaining / sleepTimerTotal) * 100))
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sleep-timer-title"
    >
      <div
        className="w-full max-w-md bg-[#121216] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#0A0A0C]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#E25822]/15 text-[#E25822] flex items-center justify-center">
              <Moon className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 id="sleep-timer-title" className="text-base font-bold text-[#F5F5F7] font-display">
                Sleep Timer
              </h2>
              <p className="text-xs text-[#94949E]">Automatically stops audio playback</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#94949E] hover:text-[#F5F5F7] hover:bg-white/[0.06] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Active Timer Display */}
          {sleepTimerRemaining !== null ? (
            <div className="p-4 rounded-xl bg-[#0A0A0C] border border-[#E25822]/30 shadow-[0_0_20px_rgba(226,88,34,0.15)] text-center space-y-3">
              <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#E25822] tracking-wider uppercase">
                <span className="w-2 h-2 rounded-full bg-[#E25822] animate-ping" />
                <span>Timer Active</span>
              </div>

              <div className="text-3xl sm:text-4xl font-extrabold font-mono text-[#F5F5F7] tracking-tight">
                {formatCountdown(sleepTimerRemaining)}
              </div>

              <p className="text-xs text-[#94949E]">
                {sleepTimerMode === 'end_of_track' ? (
                  <>Playback will stop at the end of <span className="text-[#F5F5F7] font-medium">"{currentTrack.title}"</span></>
                ) : (
                  <>Music will fade and pause when the timer expires</>
                )}
              </p>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#C2410C] to-[#E25822] transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Quick actions */}
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => extendSleepTimer(5)}
                  className="px-3 py-1.5 text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-[#F5F5F7] rounded-lg transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  5 min
                </button>
                <button
                  type="button"
                  onClick={() => extendSleepTimer(15)}
                  className="px-3 py-1.5 text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-[#F5F5F7] rounded-lg transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  15 min
                </button>
                <button
                  type="button"
                  onClick={cancelSleepTimer}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-colors"
                >
                  Turn off timer
                </button>
              </div>
            </div>
          ) : null}

          {/* Preset Buttons */}
          <div>
            <h3 className="text-xs font-semibold text-[#94949E] uppercase tracking-wider mb-2">
              {sleepTimerRemaining !== null ? 'Switch Timer Duration' : 'Stop Audio In'}
            </h3>
            <div className="space-y-1.5">
              {PRESET_OPTIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  type="button"
                  onClick={() => handleSetPreset(opt.minutes)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] text-[#F5F5F7] text-sm font-medium transition-colors border border-transparent hover:border-white/[0.08]"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-[#94949E]" />
                    <span>{opt.label}</span>
                  </div>
                  {sleepTimerRemaining !== null &&
                    sleepTimerTotal === opt.minutes * 60 &&
                    sleepTimerMode === 'duration' && (
                      <Check className="w-4 h-4 text-[#E25822]" />
                    )}
                </button>
              ))}

              {/* End of Track Option */}
              <button
                type="button"
                onClick={handleSetEndOfTrack}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] text-[#F5F5F7] text-sm font-medium transition-colors border ${
                  sleepTimerMode === 'end_of_track'
                    ? 'border-[#E25822]/40 bg-[#E25822]/10'
                    : 'border-transparent hover:border-white/[0.08]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Sparkles className="w-4 h-4 text-[#E25822] shrink-0" />
                  <div className="text-left min-w-0">
                    <p className="truncate">End of track</p>
                    <p className="text-[11px] text-[#94949E] truncate">
                      {currentTrack.title} ({formatTime(remainingTrackTime)} remaining)
                    </p>
                  </div>
                </div>
                {sleepTimerMode === 'end_of_track' && (
                  <Check className="w-4 h-4 text-[#E25822] shrink-0" />
                )}
              </button>
            </div>
          </div>

          {/* Custom Duration Input */}
          <div className="pt-2 border-t border-white/[0.06]">
            <h3 className="text-xs font-semibold text-[#94949E] uppercase tracking-wider mb-2">
              Custom Duration
            </h3>
            <form onSubmit={handleSetCustom} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="1"
                  max="720"
                  placeholder="Minutes (e.g. 20)"
                  value={customMinutes}
                  onChange={(e) => {
                    setCustomMinutes(e.target.value);
                    setCustomError(null);
                  }}
                  className="w-full bg-[#0A0A0C] border border-white/[0.1] rounded-xl px-3.5 py-2 text-sm text-[#F5F5F7] placeholder-[#666672] focus:outline-none focus:border-[#E25822] transition-colors"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#E25822] hover:bg-[#F06A35] text-white text-sm font-semibold transition-all active:scale-95 shrink-0"
              >
                Set
              </button>
            </form>
            {customError && (
              <p className="text-xs text-red-400 mt-1.5">{customError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
