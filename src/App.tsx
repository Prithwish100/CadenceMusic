/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Clock,
  Disc3,
  Heart,
  Home,
  Library,
  ListMusic,
  LogIn,
  LogOut,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { MaximizedPlayer } from './components/MaximizedPlayer';
import { PlayerBar } from './components/PlayerBar';
import { PlaylistModal } from './components/PlaylistModal';
import { QueueDrawer } from './components/QueueDrawer';
import { TrackArtwork } from './components/TrackArtwork';
import { TrackRow } from './components/TrackRow';
import { LibraryProvider, useLibrary } from './context/LibraryContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { CURATED_TRACKS } from './data/curatedCatalog';
import { ActiveView, Track } from './types/music';

const GENRE_TILES = [
  { name: 'The Weeknd', color: 'from-[#E25822] to-[#7C2D12]' },
  { name: 'Daft Punk', color: 'from-[#9A3412] to-[#431407]' },
  { name: 'Arctic Monkeys', color: 'from-[#C2410C] to-[#3F1D14]' },
  { name: 'Tame Impala', color: 'from-[#D94E1F] to-[#451A03]' },
  { name: 'Dua Lipa', color: 'from-[#EA580C] to-[#571E09]' },
  { name: 'Coldplay', color: 'from-[#B45309] to-[#291509]' },
  { name: 'Linkin Park', color: 'from-[#78350F] to-[#1C1917]' },
  { name: 'Post Malone', color: 'from-[#E25822]/80 to-[#27272A]' },
];

const CadenceWorkspace: React.FC = () => {
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = usePlayer();

  const {
    user,
    likedTracks,
    playlists,
    signInWithGoogle,
    signOutUser,
    deletePlaylist,
    removeTrackFromPlaylist,
  } = useLibrary();

  const [activeView, setActiveView] = useState<ActiveView>(ActiveView.HOME);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'playlists' | 'liked'>('all');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [trackForPlaylistModal, setTrackForPlaylistModal] = useState<Track | null>(null);

  const openPlaylistModalForTrack = (track: Track) => {
    setTrackForPlaylistModal(track);
    setPlaylistModalOpen(true);
  };

  const openCreatePlaylistModal = () => {
    setTrackForPlaylistModal(null);
    setPlaylistModalOpen(true);
  };

  const executeMusicSearch = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed) return;

    setActiveView(ActiveView.SEARCH);
    setIsSearching(true);
    setHasSearched(true);

    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();

      if (Array.isArray(data.tracks) && data.tracks.length > 0) {
        setSearchResults(data.tracks);
      } else {
        const lower = trimmed.toLowerCase();
        const filtered = CURATED_TRACKS.filter(
          (t) =>
            t.title.toLowerCase().includes(lower) ||
            t.artist.toLowerCase().includes(lower) ||
            t.album.toLowerCase().includes(lower)
        );
        setSearchResults(filtered.length > 0 ? filtered : CURATED_TRACKS);
      }
    } catch {
      const lower = trimmed.toLowerCase();
      const filtered = CURATED_TRACKS.filter(
        (t) =>
          t.title.toLowerCase().includes(lower) ||
          t.artist.toLowerCase().includes(lower)
      );
      setSearchResults(filtered.length > 0 ? filtered : CURATED_TRACKS);
    } finally {
      setIsSearching(false);
    }
  };

  // Automatically trigger search after user types
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setHasSearched(false);
      return;
    }
    const timer = setTimeout(() => {
      executeMusicSearch(trimmed);
    }, 450);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeMusicSearch(searchQuery);
  };

  const selectedPlaylist =
    playlists.find((p) => p.id === selectedPlaylistId) || playlists[0] || null;

  useEffect(() => {
    if (activeView === ActiveView.PLAYLIST_DETAIL && !selectedPlaylist) {
      setActiveView(ActiveView.HOME);
    }
  }, [activeView, selectedPlaylist]);

  const topSixGrid = CURATED_TRACKS.slice(0, 6);
  const madeForYou = CURATED_TRACKS.slice(0, 6);
  const sunsetSessions = CURATED_TRACKS.slice(6, 12);
  const popularHits = CURATED_TRACKS.slice(3, 9);

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0A0A0C] text-[#F5F5F7] flex flex-col lg:p-2 lg:gap-2">
      {/* SPOTIFY TOP HEADER BAR */}
      <header className="px-3 sm:px-5 pt-2.5 pb-2 lg:py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 shrink-0 bg-[#0A0A0C]">
        {/* Top Row on Mobile / Left+Right Wrapper */}
        <div className="flex items-center justify-between gap-3 w-full md:w-auto">
          {/* Left: Cadence Brand + "Made by Prithwish" in small */}
          <button
            type="button"
            onClick={() => setActiveView(ActiveView.HOME)}
            className="flex items-center gap-2.5 text-left focus:outline-none shrink-0"
          >
            <div className="w-9 h-9 rounded-full bg-[#E25822] flex items-center justify-center text-white shrink-0">
              <Disc3 className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-bold leading-none tracking-tight text-[#F5F5F7] font-display">
                Cadence
              </span>
              <span className="text-[10px] font-medium text-[#94949E] mt-0.5 whitespace-nowrap">
                Made by Prithwish
              </span>
            </div>
          </button>

          {/* Mobile Sign In / Profile Button */}
          <div className="flex md:hidden items-center gap-2 shrink-0">
            {user ? (
              <div className="flex items-center gap-2 bg-[#121216] rounded-full pl-3 pr-2 py-1 border border-white/[0.07]">
                <span className="text-xs font-semibold text-[#F5F5F7] max-w-[90px] truncate">
                  {user.displayName || user.email}
                </span>
                <button
                  type="button"
                  onClick={signOutUser}
                  className="w-7 h-7 rounded-full bg-[#18181E] hover:bg-[#E25822] text-[#94949E] hover:text-white flex items-center justify-center transition-colors"
                  title="Log out"
                  aria-label="Log out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="h-9 px-4 rounded-full bg-[#F5F5F7] text-[#0A0A0C] text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Log in</span>
              </button>
            )}
          </div>
        </div>

        {/* Center: Home Circle Button + Wide Expandable Spotify Pill Search Bar */}
        <div
          className={`flex items-center justify-center gap-2.5 w-full md:flex-1 transition-all duration-200 ${
            isSearchFocused ? 'md:max-w-3xl' : 'md:max-w-xl lg:max-w-2xl'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveView(ActiveView.HOME)}
            className={`hidden md:flex w-12 h-12 rounded-full items-center justify-center shrink-0 transition-colors ${
              activeView === ActiveView.HOME
                ? 'bg-[#24242C] text-[#F5F5F7]'
                : 'bg-[#16161C] text-[#94949E] hover:text-[#F5F5F7] hover:bg-[#24242C]'
            }`}
            title="Home"
            aria-label="Home"
          >
            <Home className="w-5 h-5" />
          </button>

          <form onSubmit={handleSearchSubmit} className="w-full flex-1">
            <div
              className={`relative flex items-center w-full h-12 rounded-full transition-all px-4 ${
                isSearchFocused
                  ? 'bg-[#262630] border-2 border-[#E25822] shadow-lg shadow-[#E25822]/20'
                  : 'bg-[#1C1C24] hover:bg-[#24242E] border border-white/[0.15]'
              }`}
            >
              <Search className="w-5 h-5 text-[#E25822] shrink-0 mr-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (activeView !== ActiveView.SEARCH) {
                    setActiveView(ActiveView.SEARCH);
                  }
                }}
                onFocus={() => {
                  setIsSearchFocused(true);
                  if (activeView !== ActiveView.SEARCH) {
                    setActiveView(ActiveView.SEARCH);
                  }
                }}
                onBlur={() => setIsSearchFocused(false)}
                placeholder="What do you want to play?"
                style={{ color: '#FFFFFF', fontSize: '16px' }}
                className="w-full flex-1 min-w-0 bg-transparent text-white placeholder-[#94949E] font-medium caret-[#E25822] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSearchQuery('');
                    setHasSearched(false);
                  }}
                  className="text-[#94949E] hover:text-white p-1.5 ml-1 shrink-0"
                  aria-label="Clear search"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Desktop Right: Sign In / Profile Button */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {user ? (
            <div className="flex items-center gap-2 bg-[#121216] rounded-full pl-3 pr-2 py-1.5 border border-white/[0.07]">
              <span className="text-xs font-semibold text-[#F5F5F7] max-w-[110px] truncate">
                {user.displayName || user.email}
              </span>
              <button
                type="button"
                onClick={signOutUser}
                className="w-7 h-7 rounded-full bg-[#18181E] hover:bg-[#E25822] text-[#94949E] hover:text-white flex items-center justify-center transition-colors"
                title="Log out"
                aria-label="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="h-10 px-5 rounded-full bg-[#F5F5F7] hover:scale-105 text-[#0A0A0C] text-sm font-bold flex items-center gap-2 transition-transform whitespace-nowrap shrink-0"
            >
              <LogIn className="w-4 h-4" />
              <span>Log in</span>
            </button>
          )}
        </div>
      </header>

      {/* SPOTIFY MIDDLE SPLIT: LEFT "YOUR LIBRARY" PANEL + RIGHT MAIN STAGE */}
      <div className="flex-1 flex gap-2 min-h-0 overflow-hidden pb-[128px] lg:pb-0">
        {/* Left Panel: Spotify "Your Library" */}
        <aside className="hidden lg:flex flex-col w-[300px] xl:w-[340px] bg-[#121216] rounded-xl overflow-hidden shrink-0">
          {/* Library Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <button
              type="button"
              onClick={() => setActiveView(ActiveView.PLAYLISTS)}
              className="flex items-center gap-3 text-[#94949E] hover:text-[#F5F5F7] font-bold text-base transition-colors"
            >
              <Library className="w-6 h-6" />
              <span>Your Library</span>
            </button>

            <button
              type="button"
              onClick={openCreatePlaylistModal}
              className="w-8 h-8 rounded-full hover:bg-white/[0.08] text-[#94949E] hover:text-[#F5F5F7] flex items-center justify-center transition-colors"
              title="Create playlist"
              aria-label="Create playlist"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 px-4 py-2">
            <button
              type="button"
              onClick={() => setLibraryFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                libraryFilter === 'all'
                  ? 'bg-[#F5F5F7] text-[#0A0A0C]'
                  : 'bg-[#18181E] text-[#F5F5F7] hover:bg-white/[0.12]'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setLibraryFilter('playlists')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                libraryFilter === 'playlists'
                  ? 'bg-[#F5F5F7] text-[#0A0A0C]'
                  : 'bg-[#18181E] text-[#F5F5F7] hover:bg-white/[0.12]'
              }`}
            >
              Playlists
            </button>
            <button
              type="button"
              onClick={() => setLibraryFilter('liked')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                libraryFilter === 'liked'
                  ? 'bg-[#F5F5F7] text-[#0A0A0C]'
                  : 'bg-[#18181E] text-[#F5F5F7] hover:bg-white/[0.12]'
              }`}
            >
              Liked
            </button>
          </div>

          {/* Library Scrollable List */}
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
            {/* Pinned Liked Songs Row */}
            {(libraryFilter === 'all' || libraryFilter === 'liked') && (
              <button
                type="button"
                onClick={() => setActiveView(ActiveView.LIKED)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                  activeView === ActiveView.LIKED
                    ? 'bg-white/[0.09]'
                    : 'hover:bg-white/[0.05]'
                }`}
              >
                <div className="w-12 h-12 rounded-md bg-gradient-to-br from-[#E25822] via-[#C2410C] to-[#431407] flex items-center justify-center text-white shrink-0 shadow-md">
                  <Heart className="w-5 h-5 fill-current" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold truncate ${
                      activeView === ActiveView.LIKED ? 'text-[#E25822]' : 'text-[#F5F5F7]'
                    }`}
                  >
                    Liked Songs
                  </p>
                  <p className="text-xs text-[#94949E] truncate">
                    Playlist · {likedTracks.length} {likedTracks.length === 1 ? 'song' : 'songs'}
                  </p>
                </div>
              </button>
            )}

            {/* User Playlists */}
            {(libraryFilter === 'all' || libraryFilter === 'playlists') &&
              playlists.map((pl) => {
                const isSelected =
                  activeView === ActiveView.PLAYLIST_DETAIL && selectedPlaylistId === pl.id;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => {
                      setSelectedPlaylistId(pl.id);
                      setActiveView(ActiveView.PLAYLIST_DETAIL);
                    }}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                      isSelected ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
                    }`}
                  >
                    <TrackArtwork
                      src={pl.tracks[0]?.thumbnailUrl || ''}
                      alt={pl.name}
                      className="w-12 h-12 rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-semibold truncate ${
                          isSelected ? 'text-[#E25822]' : 'text-[#F5F5F7]'
                        }`}
                      >
                        {pl.name}
                      </p>
                      <p className="text-xs text-[#94949E] truncate">
                        Playlist · {pl.tracks.length} {pl.tracks.length === 1 ? 'song' : 'songs'}
                      </p>
                    </div>
                  </button>
                );
              })}
          </div>
        </aside>

        {/* Center Main Stage */}
        <main className="flex-1 bg-[#121216] lg:rounded-xl overflow-y-auto relative">
          {/* Ambient Sunset Top Gradient Wash */}
          <div
            className="absolute top-0 left-0 right-0 h-64 pointer-events-none"
            style={{
              background:
                'linear-gradient(180deg, rgba(226, 88, 34, 0.22) 0%, rgba(18, 18, 22, 0) 100%)',
            }}
          />

          <div className="relative z-10 p-4 sm:p-6 space-y-8">
            {/* VIEW 1: SPOTIFY HOME */}
            {activeView === ActiveView.HOME && (
              <>
                <div className="space-y-4">
                  <h1 className="text-2xl sm:text-3xl font-bold text-[#F5F5F7] font-display">
                    {greeting}
                  </h1>

                  {/* Spotify 6-Tile Quick Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {topSixGrid.map((track) => {
                      const isCurrent = currentTrack.id === track.id;
                      return (
                        <div
                          key={track.id}
                          onClick={() =>
                            isCurrent ? togglePlayPause() : playTrack(track, CURATED_TRACKS)
                          }
                          className="group h-14 sm:h-16 bg-white/[0.06] hover:bg-white/[0.14] rounded-md overflow-hidden flex items-center justify-between pr-3 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0 h-full">
                            <TrackArtwork
                              src={track.thumbnailUrl}
                              alt={track.title}
                              className="w-14 h-14 sm:w-16 sm:h-16 rounded-none border-0"
                            />
                            <span
                              className={`text-sm font-bold truncate ${
                                isCurrent ? 'text-[#E25822]' : 'text-[#F5F5F7]'
                              }`}
                            >
                              {track.title}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isCurrent) {
                                togglePlayPause();
                              } else {
                                playTrack(track, CURATED_TRACKS);
                              }
                            }}
                            className={`w-10 h-10 rounded-full bg-[#E25822] hover:bg-[#F06A35] text-white flex items-center justify-center shadow-xl transition-all shrink-0 ${
                              isCurrent && isPlaying
                                ? 'opacity-100 translate-y-0'
                                : 'opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0'
                            }`}
                            aria-label="Play"
                          >
                            {isCurrent && isPlaying ? (
                              <Pause className="w-4 h-4 fill-current" />
                            ) : (
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Shelf 1: Made For You */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-[#F5F5F7] font-display">Made For You</h2>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
                    {madeForYou.map((track) => {
                      const isCurrent = currentTrack.id === track.id;
                      return (
                        <div
                          key={track.id}
                          onClick={() =>
                            isCurrent ? togglePlayPause() : playTrack(track, madeForYou)
                          }
                          className="group p-3 rounded-lg bg-[#18181E]/60 hover:bg-[#22222A] transition-colors cursor-pointer flex flex-col"
                        >
                          <div className="relative aspect-square w-full mb-3 rounded-md overflow-hidden shadow-lg">
                            <TrackArtwork
                              src={track.thumbnailUrl}
                              alt={track.title}
                              className="w-full h-full rounded-md border-0"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isCurrent) {
                                  togglePlayPause();
                                } else {
                                  playTrack(track, madeForYou);
                                }
                              }}
                              className={`absolute bottom-2 right-2 w-11 h-11 rounded-full bg-[#E25822] hover:bg-[#F06A35] hover:scale-105 text-white flex items-center justify-center shadow-xl transition-all ${
                                isCurrent && isPlaying
                                  ? 'opacity-100 translate-y-0'
                                  : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
                              }`}
                              aria-label="Play"
                            >
                              {isCurrent && isPlaying ? (
                                <Pause className="w-5 h-5 fill-current" />
                              ) : (
                                <Play className="w-5 h-5 fill-current ml-0.5" />
                              )}
                            </button>
                          </div>
                          <p
                            className={`text-sm font-semibold truncate ${
                              isCurrent ? 'text-[#E25822]' : 'text-[#F5F5F7]'
                            }`}
                          >
                            {track.title}
                          </p>
                          <p className="text-xs text-[#94949E] truncate mt-1">{track.artist}</p>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Shelf 2: Sunset Sessions */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-[#F5F5F7] font-display">
                      Sunset Sessions
                    </h2>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
                    {sunsetSessions.map((track) => {
                      const isCurrent = currentTrack.id === track.id;
                      return (
                        <div
                          key={track.id}
                          onClick={() =>
                            isCurrent ? togglePlayPause() : playTrack(track, sunsetSessions)
                          }
                          className="group p-3 rounded-lg bg-[#18181E]/60 hover:bg-[#22222A] transition-colors cursor-pointer flex flex-col"
                        >
                          <div className="relative aspect-square w-full mb-3 rounded-md overflow-hidden shadow-lg">
                            <TrackArtwork
                              src={track.thumbnailUrl}
                              alt={track.title}
                              className="w-full h-full rounded-md border-0"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isCurrent) {
                                  togglePlayPause();
                                } else {
                                  playTrack(track, sunsetSessions);
                                }
                              }}
                              className={`absolute bottom-2 right-2 w-11 h-11 rounded-full bg-[#E25822] hover:bg-[#F06A35] hover:scale-105 text-white flex items-center justify-center shadow-xl transition-all ${
                                isCurrent && isPlaying
                                  ? 'opacity-100 translate-y-0'
                                  : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
                              }`}
                              aria-label="Play"
                            >
                              {isCurrent && isPlaying ? (
                                <Pause className="w-5 h-5 fill-current" />
                              ) : (
                                <Play className="w-5 h-5 fill-current ml-0.5" />
                              )}
                            </button>
                          </div>
                          <p
                            className={`text-sm font-semibold truncate ${
                              isCurrent ? 'text-[#E25822]' : 'text-[#F5F5F7]'
                            }`}
                          >
                            {track.title}
                          </p>
                          <p className="text-xs text-[#94949E] truncate mt-1">{track.artist}</p>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Popular Tracks Table */}
                <section className="space-y-3">
                  <h2 className="text-xl font-bold text-[#F5F5F7] font-display">Popular Tracks</h2>
                  <div className="space-y-0.5">
                    {popularHits.map((track, idx) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        index={idx}
                        queueContext={popularHits}
                        onOpenPlaylistModal={openPlaylistModalForTrack}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* VIEW 2: SPOTIFY SEARCH */}
            {activeView === ActiveView.SEARCH && (
              <section className="space-y-6">
                {isSearching ? (
                  <div className="space-y-2 pt-2">
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <div
                        key={n}
                        className="h-14 rounded-md bg-white/[0.04] animate-pulse"
                      />
                    ))}
                  </div>
                ) : hasSearched ? (
                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-[#F5F5F7] font-display">Songs</h2>
                    <div className="space-y-0.5">
                      {searchResults.map((track, idx) => (
                        <TrackRow
                          key={track.id}
                          track={track}
                          index={idx}
                          queueContext={searchResults}
                          onOpenPlaylistModal={openPlaylistModalForTrack}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <h2 className="text-xl font-bold text-[#F5F5F7] font-display">Browse all</h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {GENRE_TILES.map((tile) => (
                          <button
                            key={tile.name}
                            type="button"
                            onClick={() => {
                              setSearchQuery(tile.name);
                              executeMusicSearch(tile.name);
                            }}
                            className={`h-28 rounded-xl bg-gradient-to-br ${tile.color} p-4 text-left font-bold text-lg text-white font-display relative overflow-hidden hover:scale-[1.02] transition-transform`}
                          >
                            <span>{tile.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h2 className="text-xl font-bold text-[#F5F5F7] font-display">
                        Trending Songs
                      </h2>
                      <div className="space-y-0.5">
                        {CURATED_TRACKS.map((track, idx) => (
                          <TrackRow
                            key={track.id}
                            track={track}
                            index={idx}
                            queueContext={CURATED_TRACKS}
                            onOpenPlaylistModal={openPlaylistModalForTrack}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* VIEW 3: LIKED SONGS (SPOTIFY PLAYLIST BANNER STYLE) */}
            {activeView === ActiveView.LIKED && (
              <section className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-end gap-6 pb-4">
                  <div className="w-36 h-36 sm:w-48 sm:h-48 rounded-lg bg-gradient-to-br from-[#E25822] via-[#C2410C] to-[#431407] flex items-center justify-center text-white shadow-2xl shrink-0">
                    <Heart className="w-16 h-16 sm:w-20 sm:h-20 fill-current" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[#F5F5F7]">Playlist</p>
                    <h1 className="text-3xl sm:text-6xl font-bold text-[#F5F5F7] font-display tracking-tight">
                      Liked Songs
                    </h1>
                    <p className="text-xs sm:text-sm text-[#94949E]">
                      {likedTracks.length} {likedTracks.length === 1 ? 'song' : 'songs'}
                    </p>
                  </div>
                </div>

                {likedTracks.length > 0 && (
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => playTrack(likedTracks[0], likedTracks)}
                      className="w-14 h-14 rounded-full bg-[#E25822] hover:bg-[#F06A35] hover:scale-105 text-white flex items-center justify-center shadow-xl transition-transform"
                      aria-label="Play Liked Songs"
                    >
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    </button>
                  </div>
                )}

                {likedTracks.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <h3 className="text-lg font-bold text-[#F5F5F7] font-display">
                      Songs you like will appear here
                    </h3>
                    <p className="text-sm text-[#94949E]">
                      Save songs by tapping the heart icon.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveView(ActiveView.SEARCH)}
                      className="px-6 py-2.5 rounded-full bg-[#F5F5F7] text-[#0A0A0C] text-sm font-bold"
                    >
                      Find songs
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[32px_4fr_3fr_auto] gap-4 px-4 py-2 border-b border-white/[0.08] text-xs text-[#94949E] mb-2">
                      <span className="w-6 text-center">#</span>
                      <span>Title</span>
                      <span className="hidden md:block">Album</span>
                      <span className="flex justify-end pr-2">
                        <Clock className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {likedTracks.map((track, idx) => (
                        <TrackRow
                          key={track.id}
                          track={track}
                          index={idx}
                          queueContext={likedTracks}
                          onOpenPlaylistModal={openPlaylistModalForTrack}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* VIEW 4: PLAYLISTS GRID (MOBILE / OVERVIEW) */}
            {activeView === ActiveView.PLAYLISTS && (
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl sm:text-3xl font-bold text-[#F5F5F7] font-display">
                    Your Library
                  </h1>
                  <button
                    type="button"
                    onClick={openCreatePlaylistModal}
                    className="px-4 py-2 rounded-full bg-[#E25822] hover:bg-[#F06A35] text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                  {/* Liked Songs Card */}
                  <div
                    onClick={() => setActiveView(ActiveView.LIKED)}
                    className="group p-3 rounded-lg bg-[#18181E]/60 hover:bg-[#22222A] transition-colors cursor-pointer flex flex-col"
                  >
                    <div className="aspect-square w-full mb-3 rounded-md bg-gradient-to-br from-[#E25822] via-[#C2410C] to-[#431407] flex items-center justify-center text-white shadow-lg">
                      <Heart className="w-12 h-12 fill-current" />
                    </div>
                    <p className="text-sm font-semibold text-[#F5F5F7] truncate">Liked Songs</p>
                    <p className="text-xs text-[#94949E] mt-1">
                      Playlist · {likedTracks.length} songs
                    </p>
                  </div>

                  {playlists.map((pl) => (
                    <div
                      key={pl.id}
                      onClick={() => {
                        setSelectedPlaylistId(pl.id);
                        setActiveView(ActiveView.PLAYLIST_DETAIL);
                      }}
                      className="group p-3 rounded-lg bg-[#18181E]/60 hover:bg-[#22222A] transition-colors cursor-pointer flex flex-col"
                    >
                      <div className="aspect-square w-full mb-3 rounded-md overflow-hidden shadow-lg">
                        <TrackArtwork
                          src={pl.tracks[0]?.thumbnailUrl || ''}
                          alt={pl.name}
                          className="w-full h-full rounded-md border-0"
                        />
                      </div>
                      <p className="text-sm font-semibold text-[#F5F5F7] truncate">{pl.name}</p>
                      <p className="text-xs text-[#94949E] truncate mt-1">
                        Playlist · {pl.tracks.length} songs
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* VIEW 5: PLAYLIST DETAIL (SPOTIFY BANNER + TABLE) */}
            {activeView === ActiveView.PLAYLIST_DETAIL && selectedPlaylist && (
              <section className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-end gap-6 pb-4">
                  <TrackArtwork
                    src={selectedPlaylist.tracks[0]?.thumbnailUrl || ''}
                    alt={selectedPlaylist.name}
                    className="w-36 h-36 sm:w-48 sm:h-48 rounded-lg shadow-2xl border-0"
                  />
                  <div className="space-y-2 min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#F5F5F7]">Playlist</p>
                    <h1 className="text-3xl sm:text-6xl font-bold text-[#F5F5F7] font-display tracking-tight truncate">
                      {selectedPlaylist.name}
                    </h1>
                    {selectedPlaylist.description && (
                      <p className="text-sm text-[#94949E]">{selectedPlaylist.description}</p>
                    )}
                    <p className="text-xs sm:text-sm text-[#94949E]">
                      {selectedPlaylist.tracks.length}{' '}
                      {selectedPlaylist.tracks.length === 1 ? 'song' : 'songs'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {selectedPlaylist.tracks.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        playTrack(selectedPlaylist.tracks[0], selectedPlaylist.tracks)
                      }
                      className="w-14 h-14 rounded-full bg-[#E25822] hover:bg-[#F06A35] hover:scale-105 text-white flex items-center justify-center shadow-xl transition-transform"
                      aria-label="Play playlist"
                    >
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      await deletePlaylist(selectedPlaylist.id);
                      setActiveView(ActiveView.HOME);
                    }}
                    className="w-10 h-10 rounded-full hover:bg-white/[0.08] text-[#94949E] hover:text-red-400 flex items-center justify-center transition-colors"
                    title="Delete playlist"
                    aria-label="Delete playlist"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {selectedPlaylist.tracks.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <p className="text-base font-semibold text-[#F5F5F7]">
                      Let&apos;s find something for your playlist
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveView(ActiveView.SEARCH)}
                      className="px-6 py-2.5 rounded-full bg-[#F5F5F7] text-[#0A0A0C] text-sm font-bold"
                    >
                      Search for songs
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[32px_4fr_3fr_auto] gap-4 px-4 py-2 border-b border-white/[0.08] text-xs text-[#94949E] mb-2">
                      <span className="w-6 text-center">#</span>
                      <span>Title</span>
                      <span className="hidden md:block">Album</span>
                      <span className="flex justify-end pr-2">
                        <Clock className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {selectedPlaylist.tracks.map((track, idx) => (
                        <TrackRow
                          key={track.id}
                          track={track}
                          index={idx}
                          queueContext={selectedPlaylist.tracks}
                          onOpenPlaylistModal={openPlaylistModalForTrack}
                          onRemoveFromPlaylist={(trackId) =>
                            removeTrackFromPlaylist(selectedPlaylist.id, trackId)
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0A0A0C]/95 backdrop-blur-xl border-t border-white/[0.08] grid grid-cols-4 items-center h-14 px-2">
        <button
          type="button"
          onClick={() => setActiveView(ActiveView.HOME)}
          className={`flex flex-col items-center justify-center h-full transition-colors ${
            activeView === ActiveView.HOME ? 'text-[#F5F5F7]' : 'text-[#94949E]'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Home</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView(ActiveView.SEARCH)}
          className={`flex flex-col items-center justify-center h-full transition-colors ${
            activeView === ActiveView.SEARCH ? 'text-[#F5F5F7]' : 'text-[#94949E]'
          }`}
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Search</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView(ActiveView.PLAYLISTS)}
          className={`flex flex-col items-center justify-center h-full transition-colors ${
            activeView === ActiveView.PLAYLISTS || activeView === ActiveView.PLAYLIST_DETAIL
              ? 'text-[#F5F5F7]'
              : 'text-[#94949E]'
          }`}
        >
          <Library className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Your Library</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView(ActiveView.LIKED)}
          className={`flex flex-col items-center justify-center h-full transition-colors ${
            activeView === ActiveView.LIKED ? 'text-[#F5F5F7]' : 'text-[#94949E]'
          }`}
        >
          <Heart className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Liked</span>
        </button>
      </nav>

      {/* Spotify Bottom Player Bar */}
      <PlayerBar onOpenPlaylistModal={openPlaylistModalForTrack} />

      {/* Full-Screen Lyrics & Now Playing Overlay */}
      <MaximizedPlayer onOpenPlaylistModal={openPlaylistModalForTrack} />

      {/* Queue Drawer */}
      <QueueDrawer />

      {/* Playlist Modal */}
      <PlaylistModal
        isOpen={playlistModalOpen}
        onClose={() => setPlaylistModalOpen(false)}
        trackToAdd={trackForPlaylistModal}
        onCreatedPlaylist={(newId) => {
          setSelectedPlaylistId(newId);
          setActiveView(ActiveView.PLAYLIST_DETAIL);
        }}
      />
    </div>
  );
};

export default function App() {
  return (
    <LibraryProvider>
      <PlayerProvider>
        <CadenceWorkspace />
      </PlayerProvider>
    </LibraryProvider>
  );
}
