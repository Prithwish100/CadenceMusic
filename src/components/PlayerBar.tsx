import React from 'react';
import {
  ChevronUp,
  Heart,
  Pause,
  Play,
  PlusCircle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types/music';
import { formatTime } from '../utils/formatTime';
import { TrackArtwork } from './TrackArtwork';

interface PlayerBarProps {
  onOpenPlaylistModal: (track: Track) => void;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({ onOpenPlaylistModal }) => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    isMaximized,
    togglePlayPause,
    nextTrack,
    prevTrack,
    seekTo,
    setIsMaximized,
  } = usePlayer();

  const { isLiked, toggleLike } = useLibrary();
  const liked = isLiked(currentTrack.id);

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <footer className="fixed bottom-14 lg:static left-0 right-0 z-30 bg-[#0A0A0C] border-t border-white/[0.06] lg:border-t-0 px-3 sm:px-6 h-[72px] lg:h-[84px] flex flex-col justify-center shrink-0 select-none">
      {/* Mobile progress bar strip */}
      <div className="lg:hidden w-full h-0.5 bg-white/[0.1] rounded-full overflow-hidden mb-1.5">
        <div
          className="h-full bg-[#E25822] transition-all duration-150"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="w-full flex items-center justify-between gap-2 sm:gap-4">
        {/* Track Artwork + Song Name & Artist (expands to fill available width) */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="group relative shrink-0 rounded-md overflow-hidden focus:outline-none"
            aria-label={isMaximized ? 'Minimize player' : 'Expand player'}
          >
            <TrackArtwork
              src={currentTrack.thumbnailUrl}
              alt={currentTrack.title}
              className="w-11 h-11 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-md"
              isPlaying={false}
            />
            <span className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/75 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <ChevronUp
                className={`w-4 h-4 text-white transition-transform ${
                  isMaximized ? 'rotate-180' : ''
                }`}
              />
            </span>
          </button>

          <div
            onClick={() => setIsMaximized(true)}
            className="min-w-0 flex-1 cursor-pointer pr-1"
          >
            <p className="text-sm sm:text-base font-semibold text-[#F5F5F7] hover:underline truncate">
              {currentTrack.title}
            </p>
            <p className="text-xs text-[#94949E] hover:text-[#F5F5F7] truncate transition-colors">
              {currentTrack.artist}
            </p>
          </div>
        </div>

        {/* Minimized Controls: Like, Add to Playlist, Backward, Play/Pause, Forward */}
        <div className="flex flex-col items-end lg:items-center justify-center shrink-0 lg:flex-1 lg:max-w-[520px]">
          <div className="flex items-center gap-1 sm:gap-3">
            <button
              type="button"
              onClick={() => toggleLike(currentTrack)}
              className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-colors ${
                liked ? 'text-[#E25822]' : 'text-[#94949E] hover:text-[#F5F5F7]'
              }`}
              title={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
              aria-label={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
            >
              <Heart className={`w-4 h-4 sm:w-[18px] sm:h-[18px] ${liked ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => onOpenPlaylistModal(currentTrack)}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full text-[#94949E] hover:text-[#F5F5F7] transition-colors"
              title="Add to Playlist"
              aria-label="Add to Playlist"
            >
              <PlusCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>

            <button
              type="button"
              onClick={prevTrack}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-[#94949E] hover:text-[#F5F5F7] transition-colors active:scale-95"
              title="Previous"
              aria-label="Previous"
            >
              <SkipBack className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current" />
            </button>

            <button
              type="button"
              onClick={togglePlayPause}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#F5F5F7] hover:scale-105 text-[#0A0A0C] flex items-center justify-center transition-transform active:scale-95 shadow-md"
              title={isPlaying ? 'Pause' : 'Play'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current" />
              ) : (
                <Play className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={nextTrack}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-[#94949E] hover:text-[#F5F5F7] transition-colors active:scale-95"
              title="Next"
              aria-label="Next"
            >
              <SkipForward className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current" />
            </button>
          </div>

          {/* Desktop Scrubber Bar */}
          <div className="hidden lg:flex items-center gap-2.5 w-full mt-1.5">
            <span className="text-[11px] font-mono-tabular text-[#94949E] min-w-[32px] text-right">
              {formatTime(currentTime)}
            </span>
            <div className="relative flex-1 flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 200}
                step={0.5}
                value={Math.min(currentTime, duration || 200)}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full cadence-slider z-10"
                style={{
                  background: `linear-gradient(to right, #E25822 ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%)`,
                  height: '4px',
                  borderRadius: '9999px',
                }}
                aria-label="Seek"
              />
            </div>
            <span className="text-[11px] font-mono-tabular text-[#94949E] min-w-[32px]">
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

