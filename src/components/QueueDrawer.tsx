import React from 'react';
import { ListMusic, Play, Trash2, X } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { formatTime } from '../utils/formatTime';
import { TrackArtwork } from './TrackArtwork';

export const QueueDrawer: React.FC = () => {
  const {
    queue,
    currentTrack,
    isPlaying,
    isQueueOpen,
    setIsQueueOpen,
    playTrack,
    removeFromQueue,
  } = usePlayer();

  if (!isQueueOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-[#121216] border-l border-white/[0.08] h-full flex flex-col pb-24 lg:pb-24">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            <ListMusic className="w-4 h-4 text-[#E25822]" />
            <h3 className="text-base font-semibold text-[#F5F5F7] font-display">Up Next Queue</h3>
          </div>
          <button
            type="button"
            onClick={() => setIsQueueOpen(false)}
            className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-[#94949E] hover:text-[#F5F5F7] hover:bg-white/[0.05] transition-colors"
            aria-label="Close Queue"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {queue.map((track) => {
            const isCurrent = track.id === currentTrack.id;
            return (
              <div
                key={track.id}
                onClick={() => playTrack(track)}
                className={`group flex items-center justify-between gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                  isCurrent
                    ? 'bg-[#E25822]/12 border-[#E25822]/35'
                    : 'bg-[#18181E]/60 border-white/[0.04] hover:bg-[#18181E]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TrackArtwork
                    src={track.thumbnailUrl}
                    alt={track.title}
                    className="w-10 h-10 rounded-lg"
                    isPlaying={isCurrent && isPlaying}
                  />
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        isCurrent ? 'text-[#E25822]' : 'text-[#F5F5F7]'
                      }`}
                    >
                      {track.title}
                    </p>
                    <p className="text-xs text-[#94949E] truncate">{track.artist}</p>
                  </div>
                </div>

                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs font-mono-tabular text-[#94949E]">
                    {formatTime(track.duration)}
                  </span>
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => removeFromQueue(track.id)}
                      className="p-1.5 rounded-lg text-[#94949E] hover:text-red-400 hover:bg-white/[0.05] transition-colors"
                      title="Remove from Queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isCurrent && (
                    <span className="p-1.5 text-[#E25822]">
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
