import React from 'react';
import {
  ChevronRight,
  Disc3,
  Download,
  Heart,
  Home,
  Info,
  ListMusic,
  LogIn,
  LogOut,
  Moon,
  Plus,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { ActiveView } from '../types/music';
import { isRunningInNativeApk } from '../utils/nativeStreamResolver';
import { TrackArtwork } from './TrackArtwork';

interface SideMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  onSelectPlaylist: (playlistId: string) => void;
  onCreatePlaylist: () => void;
  onImportPlaylist: () => void;
  onOpenDownloadApk?: () => void;
}

export const SideMenuDrawer: React.FC<SideMenuDrawerProps> = ({
  isOpen,
  onClose,
  activeView,
  onNavigate,
  onSelectPlaylist,
  onCreatePlaylist,
  onImportPlaylist,
  onOpenDownloadApk,
}) => {
  const {
    user,
    profileName,
    profileAvatar,
    likedTracks,
    playlists,
    signInWithGoogle,
    signOutUser,
  } = useLibrary();
  const {
    sleepTimerRemaining,
    setIsSleepTimerOpen,
  } = usePlayer();

  if (!isOpen) return null;

  const handleSelectView = (view: ActiveView) => {
    onNavigate(view);
    onClose();
  };

  const userInitial = user
    ? (profileName || user.displayName || user.email || 'L')[0].toUpperCase()
    : 'G';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-start bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <aside
        className="w-[82vw] max-w-[320px] bg-[#121216] border-r border-white/[0.08] h-full flex flex-col justify-between shadow-2xl overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Brand Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#E25822] flex items-center justify-center text-white shadow-[0_0_15px_rgba(226,88,34,0.4)]">
              <Disc3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F5F5F7] font-display leading-none">
                Cadence
              </h2>
              <p className="text-[11px] font-medium text-[#94949E] mt-1">
                Made by Prithwish
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-[#94949E] hover:text-[#F5F5F7] flex items-center justify-center transition-colors"
            aria-label="Close side menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {/* User Profile Card */}
          <div
            onClick={() => handleSelectView(ActiveView.PROFILE)}
            className="mx-1 p-3.5 rounded-2xl bg-gradient-to-br from-[#1C1C24] to-[#14141A] border border-white/[0.08] hover:border-[#E25822]/40 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              {user && profileAvatar ? (
                <img
                  src={profileAvatar}
                  alt={profileName || user.displayName || 'Profile'}
                  className="w-11 h-11 rounded-full object-cover border border-[#E25822]/40 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-white/[0.06] border border-white/[0.1] text-[#94949E] group-hover:text-[#E25822] group-hover:border-[#E25822]/30 flex items-center justify-center font-bold text-base shrink-0 transition-colors">
                  {user ? (
                    userInitial
                  ) : (
                    <UserIcon className="w-5 h-5 text-[#94949E]" />
                  )}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#F5F5F7] group-hover:text-[#E25822] transition-colors truncate">
                  {user ? (profileName || user.displayName || 'Listener') : 'Guest'}
                </p>
                <p className="text-xs text-[#94949E] truncate">
                  {user ? (user.email || 'Synced account') : 'Not signed in'}
                </p>
              </div>

              <ChevronRight className="w-4 h-4 text-[#94949E] group-hover:text-[#E25822] shrink-0 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>

          {/* Primary Menu Links */}
          <nav className="space-y-1">
            <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#94949E]">
              Menu
            </p>

            {/* Profile */}
            <button
              type="button"
              onClick={() => handleSelectView(ActiveView.PROFILE)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeView === ActiveView.PROFILE
                  ? 'bg-[#E25822] text-white shadow-lg shadow-[#E25822]/20'
                  : 'text-[#F5F5F7] hover:bg-white/[0.06]'
              }`}
            >
              <span className="flex items-center gap-3">
                <UserIcon className="w-4 h-4" />
                <span>Profile</span>
              </span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full ${
                  activeView === ActiveView.PROFILE
                    ? 'bg-black/25 text-white'
                    : 'bg-white/[0.06] text-[#94949E]'
                }`}
              >
                {user ? 'Synced' : 'Guest'}
              </span>
            </button>

            {/* Liked Songs */}
            <button
              type="button"
              onClick={() => handleSelectView(ActiveView.LIKED)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeView === ActiveView.LIKED
                  ? 'bg-[#E25822] text-white shadow-lg shadow-[#E25822]/20'
                  : 'text-[#F5F5F7] hover:bg-white/[0.06]'
              }`}
            >
              <span className="flex items-center gap-3">
                <Heart className="w-4 h-4" />
                <span>Liked Songs</span>
              </span>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                  activeView === ActiveView.LIKED
                    ? 'bg-black/25 text-white'
                    : 'bg-white/[0.06] text-[#94949E]'
                }`}
              >
                {likedTracks.length}
              </span>
            </button>

            {/* Playlists */}
            <button
              type="button"
              onClick={() => handleSelectView(ActiveView.PLAYLISTS)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeView === ActiveView.PLAYLISTS
                  ? 'bg-[#E25822] text-white shadow-lg shadow-[#E25822]/20'
                  : 'text-[#F5F5F7] hover:bg-white/[0.06]'
              }`}
            >
              <span className="flex items-center gap-3">
                <ListMusic className="w-4 h-4" />
                <span>Playlists</span>
              </span>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                  activeView === ActiveView.PLAYLISTS
                    ? 'bg-black/25 text-white'
                    : 'bg-white/[0.06] text-[#94949E]'
                }`}
              >
                {playlists.length}
              </span>
            </button>

            {/* Import Playlist */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onImportPlaylist();
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold text-[#F5F5F7] hover:bg-white/[0.06] transition-all"
            >
              <span className="flex items-center gap-3">
                <Download className="w-4 h-4 text-[#E25822]" />
                <span>Import Playlist</span>
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#E25822]/15 text-[#E25822] font-bold">
                URL / List
              </span>
            </button>

            {/* Home */}
            <button
              type="button"
              onClick={() => handleSelectView(ActiveView.HOME)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeView === ActiveView.HOME
                  ? 'bg-[#E25822] text-white shadow-lg shadow-[#E25822]/20'
                  : 'text-[#F5F5F7] hover:bg-white/[0.06]'
              }`}
            >
              <span className="flex items-center gap-3">
                <Home className="w-4 h-4" />
                <span>Home</span>
              </span>
            </button>

            {/* About */}
            <button
              type="button"
              onClick={() => handleSelectView(ActiveView.ABOUT)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeView === ActiveView.ABOUT
                  ? 'bg-[#E25822] text-white shadow-lg shadow-[#E25822]/20'
                  : 'text-[#F5F5F7] hover:bg-white/[0.06]'
              }`}
            >
              <span className="flex items-center gap-3">
                <Info className="w-4 h-4" />
                <span>About</span>
              </span>
            </button>
          </nav>

          {/* Quick Playlists Section */}
          <div className="pt-2 border-t border-white/[0.07] space-y-1.5">
            <div className="flex items-center justify-between px-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#94949E]">
                Your Playlists
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onImportPlaylist();
                  }}
                  className="text-xs font-semibold text-[#94949E] hover:text-[#F5F5F7] flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Import</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onCreatePlaylist();
                  }}
                  className="text-xs font-semibold text-[#E25822] hover:text-[#F06A35] flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>
              </div>
            </div>

            {playlists.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#94949E]">
                No custom playlists yet. Tap New to create one.
              </p>
            ) : (
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => {
                      onSelectPlaylist(pl.id);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.06] text-left transition-colors"
                  >
                    <TrackArtwork
                      src={pl.tracks[0]?.thumbnailUrl || ''}
                      alt={pl.name}
                      className="w-8 h-8 rounded-md shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#F5F5F7] truncate">{pl.name}</p>
                      <p className="text-[10px] text-[#94949E] truncate">
                        {pl.tracks.length} {pl.tracks.length === 1 ? 'song' : 'songs'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Audio Tools Shortcuts */}
          <div className="pt-2 border-t border-white/[0.07] space-y-1">
            <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#94949E]">
              Playback Settings
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                setIsSleepTimerOpen(true);
              }}
              className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold text-[#F5F5F7] hover:bg-white/[0.06] transition-colors"
            >
              <span className="flex items-center gap-3">
                <Moon className="w-4 h-4 text-[#E25822]" />
                <span>Sleep Timer</span>
              </span>
              <span className="text-[11px] font-mono text-[#94949E]">
                {sleepTimerRemaining !== null
                  ? `${Math.ceil(sleepTimerRemaining / 60)}m left`
                  : 'Off'}
              </span>
            </button>

            {/* Download Android APK Modal Trigger (only shown on website, hidden inside native APK) */}
            {!isRunningInNativeApk() && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDownloadApk?.();
                }}
                className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold text-[#F5F5F7] hover:bg-white/[0.06] transition-colors group cursor-pointer text-left"
              >
                <span className="flex items-center gap-3">
                  <Download className="w-4 h-4 text-[#E25822] group-hover:scale-110 transition-transform shrink-0" />
                  <span className="flex flex-col text-left">
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-[#F5F5F7]">Download APK</span>
                      <span className="text-[10px] font-medium text-[#94949E]">v1.4</span>
                    </span>
                    <span className="text-[10px] font-normal text-[#94949E]">(Flutter Android app)</span>
                  </span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E25822]/15 text-[#E25822] font-semibold border border-[#E25822]/20">
                  v1.4
                </span>
              </button>
            )}
          </div>
        </div>


        {/* Bottom Auth Action Footer */}
        <div className="p-4 border-t border-white/[0.07] bg-[#0E0E12]">
          {user ? (
            <button
              type="button"
              onClick={() => {
                signOutUser();
                onClose();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-red-500/15 text-[#F5F5F7] hover:text-red-400 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                signInWithGoogle();
                onClose();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-[#E25822] hover:bg-[#F06A35] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#E25822]/25 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign in with Google</span>
            </button>
          )}
        </div>
      </aside>
    </div>
  );
};
