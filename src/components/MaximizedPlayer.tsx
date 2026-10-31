import React, { useEffect, useRef } from 'react';
import {
  ChevronDown,
  Heart,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { RepeatMode, Track } from '../types/music';
import { formatTime } from '../utils/formatTime';
import { TrackArtwork } from './TrackArtwork';

interface MaximizedPlayerProps {
  onOpenPlaylistModal: (track: Track) => void;
}

export const MaximizedPlayer: React.FC<MaximizedPlayerProps> = ({ onOpenPlaylistModal }) => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeatMode,
    isMaximized,
    lyrics,
    activeLyricIndex,
    togglePlayPause,
    nextTrack,
    prevTrack,
    seekTo,
    toggleShuffle,
    cycleRepeatMode,
    setIsMaximized,
  } = usePlayer();

  const { isLiked, toggleLike } = useLibrary();
  const liked = isLiked(currentTrack.id);

  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isMaximized || !activeLineRef.current || !lyricsContainerRef.current) return;
    activeLineRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [activeLyricIndex, isMaximized]);

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      className={`fixed inset-0 z-40 bg-gradient-to-b from-[#2A140B] via-[#121216] to-[#0A0A0C] flex flex-col transition-all duration-200 ${
        isMaximized
          ? 'opacity-100 pointer-events-auto translate-y-0'
          : 'opacity-0 pointer-events-none translate-y-6'
      }`}
      aria-hidden={!isMaximized}
    >
      {/* Top Minimal Spotify Overlay Bar */}
      <header className="flex items-center justify-between px-6 py-4 shrink-0">
        <button
          type="button"
          onClick={() => setIsMaximized(false)}
          className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-[#F5F5F7] transition-colors"
          aria-label="Close full screen"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        <div className="text-center min-w-0">
          <p className="text-xs font-semibold text-[#F5F5F7] truncate">{currentTrack.album}</p>
        </div>

        <div className="w-10" />
      </header>

      {/* Main Content Split: Artwork & Controls on Left, Pure Spotify Lyrics Stage on Right */}
      <div className="flex-1 overflow-y-auto lg:overflow-hidden px-6 sm:px-12 pb-8">
        <div className="max-w-7xl mx-auto h-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left: Album Art + Controls */}
          <div className="lg:col-span-5 flex flex-col items-center lg:items-start space-y-6">
            <div className="relative w-full max-w-[340px] sm:max-w-[400px] aspect-square rounded-xl overflow-hidden bg-[#121216] shadow-2xl">
              <div className="opacity-0 pointer-events-none absolute inset-0 w-1 h-1 overflow-hidden">
                <div id="cadence-yt-player" className="w-full h-full" />
              </div>

              <TrackArtwork
                src={currentTrack.thumbnailUrl}
                alt={currentTrack.title}
                className="w-full h-full rounded-none border-0"
                isPlaying={false}
              />
            </div>

            <div className="w-full max-w-[400px] flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-[#F5F5F7] font-display truncate">
                  {currentTrack.title}
                </h2>
                <p className="text-base text-[#94949E] truncate">{currentTrack.artist}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleLike(currentTrack)}
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                    liked ? 'text-[#E25822]' : 'text-[#94949E] hover:text-[#F5F5F7]'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${liked ? 'fill-current' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPlaylistModal(currentTrack)}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-[#94949E] hover:text-[#F5F5F7] transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrubber */}
            <div className="w-full max-w-[400px] space-y-2">
              <input
                type="range"
                min={0}
                max={duration || 200}
                step={0.5}
                value={Math.min(currentTime, duration || 200)}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full cadence-slider"
                style={{
                  background: `linear-gradient(to right, #E25822 ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%)`,
                  height: '4px',
                  borderRadius: '9999px',
                }}
                aria-label="Seek"
              />
              <div className="flex items-center justify-between text-xs font-mono-tabular text-[#94949E]">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Transport */}
            <div className="w-full max-w-[400px] flex items-center justify-between">
              <button
                type="button"
                onClick={toggleShuffle}
                className={`w-10 h-10 flex items-center justify-center transition-colors ${
                  shuffle ? 'text-[#E25822]' : 'text-[#94949E] hover:text-[#F5F5F7]'
                }`}
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={prevTrack}
                className="w-10 h-10 flex items-center justify-center text-[#F5F5F7] hover:text-[#E25822] transition-colors"
              >
                <SkipBack className="w-6 h-6 fill-current" />
              </button>

              <button
                type="button"
                onClick={togglePlayPause}
                className="w-14 h-14 rounded-full bg-[#F5F5F7] hover:scale-105 text-[#0A0A0C] flex items-center justify-center transition-transform active:scale-95"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 fill-current" />
                ) : (
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={nextTrack}
                className="w-10 h-10 flex items-center justify-center text-[#F5F5F7] hover:text-[#E25822] transition-colors"
              >
                <SkipForward className="w-6 h-6 fill-current" />
              </button>

              <button
                type="button"
                onClick={cycleRepeatMode}
                className={`w-10 h-10 flex items-center justify-center transition-colors ${
                  repeatMode !== RepeatMode.OFF
                    ? 'text-[#E25822]'
                    : 'text-[#94949E] hover:text-[#F5F5F7]'
                }`}
              >
                {repeatMode === RepeatMode.ONE ? (
                  <Repeat1 className="w-5 h-5" />
                ) : (
                  <Repeat className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Right: Pure Spotify Lyrics Stage */}
          <div
            ref={lyricsContainerRef}
            className="lg:col-span-7 h-[420px] lg:h-[76vh] overflow-y-auto px-2 sm:px-6 py-12 space-y-5 scroll-smooth"
          >
            {lyrics.map((line, idx) => {
              const isActive = idx === activeLyricIndex;
              const isPast = idx < activeLyricIndex;

              return (
                <button
                  key={`${line.time}-${idx}`}
                  ref={isActive ? activeLineRef : null}
                  type="button"
                  onClick={() => seekTo(line.time)}
                  className="block w-full text-left transition-all duration-200 focus:outline-none group"
                >
                  <span
                    className={`block text-xl sm:text-3xl font-bold font-display leading-snug transition-colors ${
                      isActive
                        ? 'text-[#F5F5F7]'
                        : isPast
                          ? 'text-white/25 group-hover:text-white/70'
                          : 'text-white/40 group-hover:text-white/80'
                    }`}
                  >
                    {line.text}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
