import React, { useRef, useState } from 'react';
import { Download, FileText, Link2, Loader2, Upload, X } from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { Track } from '../types/music';

interface ImportPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportedPlaylist?: (newPlaylistId: string) => void;
}

export const ImportPlaylistModal: React.FC<ImportPlaylistModalProps> = ({
  isOpen,
  onClose,
  onImportedPlaylist,
}) => {
  const { importPlaylist } = useLibrary();

  const [mode, setMode] = useState<'url' | 'text'>('url');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [songListText, setSongListText] = useState('');
  const [customName, setCustomName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const content = String(reader.result || '').trim();
      if (!content) return;

      // Check if JSON playlist file
      if (file.name.endsWith('.json') || content.startsWith('{') || content.startsWith('[')) {
        try {
          const parsed = JSON.parse(content);
          const rawTracks = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed.tracks)
              ? parsed.tracks
              : null;

          if (rawTracks && rawTracks.length > 0) {
            const validTracks: Track[] = rawTracks
              .filter((t: Record<string, unknown>) => t && typeof t.id === 'string' && typeof t.title === 'string')
              .map((t: Record<string, unknown>) => ({
                id: String(t.id),
                title: String(t.title),
                artist: String(t.artist || 'Unknown Artist'),
                album: String(t.album || 'Single'),
                duration: Number(t.duration) || 210,
                thumbnailUrl:
                  String(t.thumbnailUrl || '') ||
                  `https://i.ytimg.com/vi/${String(t.id)}/hqdefault.jpg`,
              }));

            if (validTracks.length > 0) {
              setIsImporting(true);
              try {
                const nameToUse =
                  customName.trim() ||
                  (typeof parsed.name === 'string' && parsed.name.trim()) ||
                  file.name.replace(/\.json$/i, '');
                const descToUse =
                  (typeof parsed.description === 'string' && parsed.description) ||
                  `Imported from ${file.name}`;
                const newId = await importPlaylist(nameToUse, descToUse, validTracks);
                if (onImportedPlaylist) onImportedPlaylist(newId);
                onClose();
                return;
              } finally {
                setIsImporting(false);
              }
            }
          }
        } catch {
          // fallback to text lines if not valid track JSON
        }
      }

      // Otherwise populate song list text area with lines from file
      setMode('text');
      if (!customName.trim()) {
        setCustomName(file.name.replace(/\.(txt|csv|m3u8?|json)$/i, ''));
      }
      setSongListText(content);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (mode === 'url' && !playlistUrl.trim()) {
      setErrorMsg('Please paste a YouTube or Spotify playlist link.');
      return;
    }

    if (mode === 'text' && !songListText.trim()) {
      setErrorMsg('Please enter at least one song name.');
      return;
    }

    setIsImporting(true);
    try {
      const payload =
        mode === 'url'
          ? { url: playlistUrl.trim(), customName: customName.trim() }
          : {
              songLines: songListText
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l.length > 0 && !l.startsWith('#')),
              customName: customName.trim(),
            };

      const res = await fetch('/api/playlist/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not import playlist. Check your link or song list.');
        return;
      }

      const tracks: Track[] = Array.isArray(data.tracks) ? data.tracks : [];
      if (tracks.length === 0) {
        setErrorMsg('No playable tracks were found in that playlist.');
        return;
      }

      const newId = await importPlaylist(
        customName.trim() || data.name || 'Imported Playlist',
        data.description || `Imported playlist (${tracks.length} songs)`,
        tracks
      );

      setPlaylistUrl('');
      setSongListText('');
      setCustomName('');
      if (onImportedPlaylist) onImportedPlaylist(newId);
      onClose();
    } catch {
      setErrorMsg('Network error while importing playlist. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#141418] border border-white/[0.1] p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#E25822]/15 border border-[#E25822]/30 flex items-center justify-center text-[#E25822]">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-display text-[#F5F5F7]">Import Playlist</h3>
              <p className="text-xs text-[#94949E]">
                Import from YouTube, Spotify, or a song list
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-[#94949E] hover:text-[#F5F5F7]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#0D0D10] border border-white/[0.07]">
          <button
            type="button"
            onClick={() => {
              setMode('url');
              setErrorMsg(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              mode === 'url'
                ? 'bg-[#E25822] text-white shadow'
                : 'text-[#94949E] hover:text-[#F5F5F7]'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Playlist Link</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('text');
              setErrorMsg(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              mode === 'text'
                ? 'bg-[#E25822] text-white shadow'
                : 'text-[#94949E] hover:text-[#F5F5F7]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Song List / File</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#94949E]">
              Playlist Name (Optional)
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Leave blank to auto-detect name"
              maxLength={100}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0D10] border border-white/[0.08] text-sm text-[#F5F5F7] placeholder-[#94949E]/50 focus:outline-none focus:border-[#E25822]"
            />
          </div>

          {mode === 'url' ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#94949E]">
                YouTube / YouTube Music / Spotify Playlist URL
              </label>
              <input
                type="url"
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                placeholder="https://www.youtube.com/playlist?list=... or Spotify link"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0D10] border border-white/[0.08] text-sm text-[#F5F5F7] placeholder-[#94949E]/50 focus:outline-none focus:border-[#E25822]"
              />
              <p className="text-[11px] text-[#94949E]">
                Supports public YouTube/YouTube Music playlists and public Spotify playlists.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#94949E]">
                  Songs (One per line: Title - Artist)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv,.json,.m3u,.m3u8"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-semibold text-[#E25822] hover:text-[#F06A35] flex items-center gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload .txt / .json</span>
                </button>
              </div>
              <textarea
                value={songListText}
                onChange={(e) => setSongListText(e.target.value)}
                placeholder={`November Rain - Guns N' Roses\nNumb - Linkin Park\nLose Yourself - Eminem`}
                rows={4}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0D10] border border-white/[0.08] text-sm text-[#F5F5F7] placeholder-[#94949E]/50 focus:outline-none focus:border-[#E25822] resize-none"
              />
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs font-medium text-red-300">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isImporting}
            className="w-full py-2.5 rounded-xl bg-[#E25822] hover:bg-[#F06A35] disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#E25822]/25"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Importing Songs...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Import Playlist</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
