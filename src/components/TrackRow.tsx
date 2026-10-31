import React, { useState } from 'react';
import { Check, Heart, ListPlus, Pause, Play, Plus, Share2, Trash2 } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types/music';
import { formatTime } from '../utils/formatTime';
import { TrackArtwork } from './TrackArtwork';

interface TrackRowProps {
  track: Track;
  index?: number;
  queueContext?: Track[];
  onOpenPlaylistModal: (track: Track) => void;
  onRemoveFromPlaylist?: (trackId: string) => void;
  hideShareAndDuration?: boolean;
}

export const TrackRow: React.FC<TrackRowProps> = ({
  track,
  index,
  queueContext,
  onOpenPlaylistModal,
  onRemoveFromPlaylist,
  hideShareAndDuration = false,
}) => {
  const { currentTrack, isPlaying, playTrack, togglePlayPause, addToQueue } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const [copied, setCopied] = useState(false);

  const isCurrent = currentTrack.id === track.id;
  const liked = isLiked(track.id);

  const handlePlayClick = () => {
    if (isCurrent) {
      togglePlayPause();
    } else {
      playTrack(track, queueContext);
    }
  };

  const handleShareTrack = async () => {
    const shareParams = new URLSearchParams({
      track: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album || 'Single',
      duration: String(track.duration || 210),
      thumb: track.thumbnailUrl || '',
    });
    const shareUrl = `${window.location.origin}${window.location.pathname}?${shareParams.toString()}`;
    const shareTitle = `${track.title} — ${track.artist}`;
    const shareText = `Listen to "${track.title}" by ${track.artist} on Cadence`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      onClick={handlePlayClick}
      className={`group grid ${
        hideShareAndDuration
          ? 'grid-cols-[auto_1fr_auto]'
          : 'grid-cols-[auto_1fr_auto] md:grid-cols-[32px_4fr_3fr_auto]'
      } items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2 rounded-md transition-colors cursor-pointer ${
        isCurrent ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'
      }`}
    >
      {/* Column 1: Track Number / Play Icon */}
      <div className="w-6 flex items-center justify-center text-sm font-mono-tabular text-[#94949E]">
        {isCurrent && isPlaying ? (
          <div className="flex items-end gap-0.5 h-3.5">
            <span className="w-0.5 bg-[#E25822] h-2.5 animate-[bounce_0.8s_infinite]" />
            <span className="w-0.5 bg-[#E25822] h-3.5 animate-[bounce_0.6s_infinite]" />
            <span className="w-0.5 bg-[#E25822] h-2 animate-[bounce_0.9s_infinite]" />
          </div>
        ) : (
          <>
            <span className={`group-hover:hidden ${isCurrent ? 'text-[#E25822] font-semibold' : ''}`}>
              {typeof index === 'number' ? index + 1 : '·'}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePlayClick();
              }}
              className="hidden group-hover:flex items-center justify-center text-[#F5F5F7]"
              aria-label={isCurrent && isPlaying ? 'Pause' : 'Play'}
            >
              {isCurrent && isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
            </button>
          </>
        )}
      </div>

      {/* Column 2: Artwork + Title + Artist */}
      <div className="flex items-center gap-3 min-w-0">
        <TrackArtwork
          src={track.thumbnailUrl}
          alt={track.title}
          className="w-10 h-10 rounded shrink-0"
          isPlaying={false}
        />
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-medium truncate ${
              isCurrent ? 'text-[#E25822]' : 'text-[#F5F5F7]'
            }`}
          >
            {track.title}
          </p>
          <p className="text-xs text-[#94949E] group-hover:text-[#F5F5F7]/80 truncate transition-colors">
            {track.artist}
          </p>
        </div>
      </div>

      {/* Column 3: Album (Desktop, hidden when maximizing space for track names) */}
      {!hideShareAndDuration && (
        <div className="hidden md:block min-w-0">
          <p className="text-sm text-[#94949E] group-hover:text-[#F5F5F7]/80 truncate transition-colors">
            {track.album}
          </p>
        </div>
      )}

      {/* Column 4: Actions & Duration */}
      <div
        className="flex items-center justify-end gap-1 sm:gap-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => toggleLike(track)}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
            liked
              ? 'text-[#E25822] hover:text-[#F06A35]'
              : 'text-[#94949E] hover:text-[#F5F5F7] hover:bg-white/[0.08]'
          }`}
          title={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
          aria-label={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => onOpenPlaylistModal(track)}
          className="w-8 h-8 flex items-center justify-center rounded-full text-[#94949E] hover:text-[#F5F5F7] hover:bg-white/[0.08] transition-colors"
          title="Add to playlist"
          aria-label="Add to playlist"
        >
          <Plus className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => addToQueue(track)}
          className="hidden sm:flex w-8 h-8 items-center justify-center rounded-full text-[#94949E] hover:text-[#F5F5F7] hover:bg-white/[0.08] transition-colors"
          title="Add to queue"
          aria-label="Add to queue"
        >
          <ListPlus className="w-4 h-4" />
        </button>

        {!hideShareAndDuration && (
          <button
            type="button"
            onClick={handleShareTrack}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
              copied
                ? 'text-[#10B981]'
                : 'text-[#94949E] hover:text-[#F5F5F7] hover:bg-white/[0.08]'
            }`}
            title={copied ? 'Link copied!' : 'Share song'}
            aria-label="Share song"
          >
            {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
          </button>
        )}

        {onRemoveFromPlaylist && (
          <button
            type="button"
            onClick={() => onRemoveFromPlaylist(track.id)}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[#94949E] hover:text-red-400 hover:bg-white/[0.08] transition-colors"
            title="Remove from playlist"
            aria-label="Remove from playlist"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        {!hideShareAndDuration && (
          <span className="w-11 text-right text-xs font-mono-tabular text-[#94949E]">
            {formatTime(track.duration)}
          </span>
        )}
      </div>
    </div>
  );
};
