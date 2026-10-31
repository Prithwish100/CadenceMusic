import React, { useState } from 'react';
import { Check, FolderPlus, ListMusic, Plus, X } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { Track } from '../types/music';

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackToAdd?: Track | null;
  onCreatedPlaylist?: (playlistId: string) => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  onClose,
  trackToAdd = null,
  onCreatedPlaylist,
}) => {
  const { playlists, createPlaylist, addTrackToPlaylist } = useLibrary();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(!trackToAdd || playlists.length === 0);
  const [submitting, setSubmitting] = useState(false);
  const [addedPlaylistId, setAddedPlaylistId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    try {
      const newId = await createPlaylist(name.trim(), description.trim(), trackToAdd || undefined);
      setName('');
      setDescription('');
      if (onCreatedPlaylist) {
        onCreatedPlaylist(newId);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToExisting = async (playlistId: string) => {
    if (!trackToAdd || submitting) return;
    setSubmitting(true);
    try {
      await addTrackToPlaylist(playlistId, trackToAdd);
      setAddedPlaylistId(playlistId);
      setTimeout(() => {
        setAddedPlaylistId(null);
        onClose();
      }, 450);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#121216] border border-white/[0.09] rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.07]">
          <div>
            <h3 className="text-lg font-semibold text-[#F5F5F7] font-display">
              {trackToAdd ? 'Save to Playlist' : 'Create New Playlist'}
            </h3>
            {trackToAdd && (
              <p className="text-xs text-[#94949E] truncate max-w-[280px] mt-0.5">
                {trackToAdd.title} · {trackToAdd.artist}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#94949E] hover:text-[#F5F5F7] hover:bg-white/[0.05] transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {trackToAdd && playlists.length > 0 && !isCreatingNew ? (
          <div className="mt-4 space-y-3">
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {playlists.map((pl) => {
                const alreadyIn = pl.tracks.some((t) => t.id === trackToAdd.id);
                const justAdded = addedPlaylistId === pl.id;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    disabled={alreadyIn || submitting}
                    onClick={() => handleAddToExisting(pl.id)}
                    className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-[#18181E] hover:bg-white/[0.06] border border-white/[0.05] transition-colors text-left disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#E25822]/15 flex items-center justify-center text-[#E25822] shrink-0">
                        <ListMusic className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#F5F5F7] truncate">{pl.name}</p>
                        <p className="text-xs text-[#94949E]">
                          {pl.tracks.length} {pl.tracks.length === 1 ? 'song' : 'songs'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-[#E25822] shrink-0 ml-2 flex items-center gap-1">
                      {justAdded || alreadyIn ? (
                        <>
                          <Check className="w-4 h-4" />
                          Saved
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          Add
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setIsCreatingNew(true)}
              className="w-full py-2.5 px-4 rounded-xl border border-white/[0.1] hover:border-[#E25822]/60 text-xs font-medium text-[#F5F5F7] flex items-center justify-center gap-2 transition-colors"
            >
              <FolderPlus className="w-4 h-4 text-[#E25822]" />
              Create New Playlist Instead
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#94949E] mb-1.5">
                Playlist Name
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Late Night Sunset Drive"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0A0A0C] border border-white/[0.1] text-sm text-[#F5F5F7] placeholder-[#94949E]/50 focus:outline-none focus:border-[#E25822]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#94949E] mb-1.5">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Warm grooves and atmospheric tracks..."
                className="w-full px-3.5 py-2 rounded-xl bg-[#0A0A0C] border border-white/[0.1] text-sm text-[#F5F5F7] placeholder-[#94949E]/50 focus:outline-none focus:border-[#E25822] resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              {trackToAdd && playlists.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-[#94949E] hover:text-[#F5F5F7] transition-colors"
                >
                  Back to List
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[#94949E] hover:text-[#F5F5F7] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || submitting}
                className="px-5 py-2 rounded-lg bg-[#E25822] hover:bg-[#F06A35] text-white text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {submitting ? 'Saving...' : 'Create Playlist'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
