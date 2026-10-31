import React from 'react';
import {
  ChevronUp,
  Heart,
  ListMusic,
  Maximize2,
  Mic2,
  Pause,
  Play,
  PlusCircle,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { RepeatMode, Track } from '../types/music';
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
    volume,
    isMuted,
    shuffle,
    repeatMode,
    isMaximized,
    isQueueOpen,
    togglePlayPause,
    nextTrack,
    prevTrack,
    seekTo,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeatMode,
    setIsMaximized,
    setIsQueueOpen,
  } = usePlayer();

  const { isLiked, toggleLike } = useLibrary();
  const liked = isLiked(currentTrack.id);

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <footer className="fixed bottom-14 lg:static left-0 right-0 z-30 bg-[#0A0A0C] border-t border-white/[0.06] lg:border-t-0 px-3 sm:px-4 h-[72px] lg:h-[84px] flex flex-col justify-center shrink-0 select-none">
      {/* Mobile progress bar strip */}
      <div className="lg:hidden w-full h-0.5 bg-white/[0.1] rounded-full overflow-hidden mb-1.5">
        <div
          className="h-full bg-[#E25822] transition-all duration-150"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="w-full flex items-center justify-between gap-4">
        {/* Left Zone (30%): Now Playing Artwork, Title, Artist, Like & Add */}
        <div className="flex items-center gap-3.5 min-w-0 w-[65%] sm:w-[30%]">
          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="group relative shrink-0 rounded-md overflow-hidden focus:outline-none"
          >
            <TrackArtwork
              src={currentTrack.thumbnailUrl}
              alt={currentTrack.title}
              className="w-12 h-12 lg:w-14 lg:h-14 rounded-md"
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
            className="min-w-0 cursor-pointer pr-1"
          >
            <p className="text-sm font-medium text-[#F5F5F7] hover:underline truncate">
              {currentTrack.title}
            </p>
            <p className="text-xs text-[#94949E] hover:text-[#F5F5F7] truncate transition-colors">
              {currentTrack.artist}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => toggleLike(currentTrack)}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                liked ? 'text-[#E25822]' : 'text-[#94949E] hover:text-[#F5F5F7]'
              }`}
              aria-label={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
            >
              <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => onOpenPlaylistModal(currentTrack)}
              className="hidden sm:flex w-8 h-8 items-center justify-center rounded-full text-[#94949E] hover:text-[#F5F5F7] transition-colors"
              aria-label="Add to Playlist"
            >
              <PlusCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Zone (40%): Spotify Transport & Scrubber */}
        <div className="flex flex-col items-end sm:items-center justify-center flex-1 max-w-[620px]">
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              type="button"
              onClick={toggleShuffle}
              className={`hidden sm:flex w-8 h-8 items-center justify-center transition-colors relative ${
                shuffle ? 'text-[#E25822]' : 'text-[#94949E] hover:text-[#F5F5F7]'
              }`}
              aria-label="Shuffle"
            >
              <Shuffle className="w-4 h-4" />
              {shuffle && (
                <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-[#E25822]" />
              )}
            </button>

            <button
              type="button"
              onClick={prevTrack}
              className="hidden sm:flex w-8 h-8 items-center justify-center text-[#94949E] hover:text-[#F5F5F7] transition-colors"
              aria-label="Previous"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={togglePlayPause}
              className="w-9 h-9 rounded-full bg-[#F5F5F7] hover:scale-105 text-[#0A0A0C] flex items-center justify-center transition-transform active:scale-95"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={nextTrack}
              className="w-8 h-8 flex items-center justify-center text-[#94949E] hover:text-[#F5F5F7] transition-colors"
              aria-label="Next"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={cycleRepeatMode}
              className={`hidden sm:flex w-8 h-8 items-center justify-center transition-colors relative ${
                repeatMode !== RepeatMode.OFF
                  ? 'text-[#E25822]'
                  : 'text-[#94949E] hover:text-[#F5F5F7]'
              }`}
              aria-label="Repeat"
            >
              {repeatMode === RepeatMode.ONE ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
              {repeatMode !== RepeatMode.OFF && (
                <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-[#E25822]" />
              )}
            </button>

            {/* Mobile Lyrics icon */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`lg:hidden w-8 h-8 flex items-center justify-center transition-colors ${
                isMaximized ? 'text-[#E25822]' : 'text-[#94949E] hover:text-[#F5F5F7]'
              }`}
              aria-label="Lyrics"
            >
              <Mic2 className="w-4 h-4" />
            </button>
          </div>

          {/* Scrubber Bar */}
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

        {/* Right Zone (30%): Spotify Utility Icons (Mic, Queue, Volume, Fullscreen) */}
        <div className="hidden lg:flex items-center justify-end gap-2 w-[30%]">
          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className={`w-8 h-8 flex items-center justify-center transition-colors relative ${
              isMaximized ? 'text-[#E25822]' : 'text-[#94949E] hover:text-[#F5F5F7]'
            }`}
            title="Lyrics"
            aria-label="Lyrics"
          >
            <Mic2 className="w-4 h-4" />
            {isMaximized && (
              <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[#E25822]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            className={`w-8 h-8 flex items-center justify-center transition-colors relative ${
              isQueueOpen ? 'text-[#E25822]' : 'text-[#94949E] hover:text-[#F5F5F7]'
            }`}
            title="Queue"
            aria-label="Queue"
          >
            <ListMusic className="w-4 h-4" />
            {isQueueOpen && (
              <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[#E25822]" />
            )}
          </button>

          <div className="flex items-center gap-2 w-28">
            <button
              type="button"
              onClick={toggleMute}
              className="w-8 h-8 flex items-center justify-center text-[#94949E] hover:text-[#F5F5F7] transition-colors"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-[#E25822]" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full cadence-slider"
              style={{
                background: `linear-gradient(to right, #E25822 ${isMuted ? 0 : volume}%, rgba(255,255,255,0.2) ${isMuted ? 0 : volume}%)`,
                height: '4px',
                borderRadius: '9999px',
              }}
              aria-label="Volume"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="w-8 h-8 flex items-center justify-center text-[#94949E] hover:text-[#F5F5F7] transition-colors"
            title="Full screen"
            aria-label="Full screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </footer>
  );
};
