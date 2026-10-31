import React from 'react';
import { Heart, ListPlus, Pause, Play, Plus, Trash2 } from 'lucide-react';
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
}

export const TrackRow: React.FC<TrackRowProps> = ({
  track,
  index,
  queueContext,
  onOpenPlaylistModal,
  onRemoveFromPlaylist,
}) => {
  const { currentTrack, isPlaying, playTrack, togglePlayPause, addToQueue } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();

  const isCurrent = currentTrack.id === track.id;
  const liked = isLiked(track.id);

  const handlePlayClick = () => {
    if (isCurrent) {
      togglePlayPause();
    } else {
      playTrack(track, queueContext);
    }
  };

  return (
    <div
      onClick={handlePlayClick}
      className={`group grid grid-cols-[auto_1fr_auto] md:grid-cols-[32px_4fr_3fr_auto] items-center gap-4 px-4 py-2 rounded-md transition-colors cursor-pointer ${
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
          className="w-10 h-10 rounded"
          isPlaying={false}
        />
        <div className="min-w-0">
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

      {/* Column 3: Album (Desktop) */}
      <div className="hidden md:block min-w-0">
        <p className="text-sm text-[#94949E] group-hover:text-[#F5F5F7]/80 truncate transition-colors">
          {track.album}
        </p>
      </div>

      {/* Column 4: Actions & Duration */}
      <div
        className="flex items-center justify-end gap-1 sm:gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => toggleLike(track)}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-opacity ${
            liked
              ? 'text-[#E25822] opacity-100'
              : 'text-[#94949E] hover:text-[#F5F5F7] opacity-0 group-hover:opacity-100'
          }`}
          title={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
          aria-label={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => onOpenPlaylistModal(track)}
          className="w-8 h-8 flex items-center justify-center rounded-full text-[#94949E] hover:text-[#F5F5F7] opacity-0 group-hover:opacity-100 transition-opacity"
          title="Add to playlist"
          aria-label="Add to playlist"
        >
          <Plus className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => addToQueue(track)}
          className="hidden sm:flex w-8 h-8 items-center justify-center rounded-full text-[#94949E] hover:text-[#F5F5F7] opacity-0 group-hover:opacity-100 transition-opacity"
          title="Add to queue"
          aria-label="Add to queue"
        >
          <ListPlus className="w-4 h-4" />
        </button>

        {onRemoveFromPlaylist && (
          <button
            type="button"
            onClick={() => onRemoveFromPlaylist(track.id)}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[#94949E] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove from playlist"
            aria-label="Remove from playlist"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        <span className="w-11 text-right text-xs font-mono-tabular text-[#94949E]">
          {formatTime(track.duration)}
        </span>
      </div>
    </div>
  );
};
