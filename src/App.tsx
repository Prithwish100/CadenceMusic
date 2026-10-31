/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Disc3,
  Heart,
  Home,
  Library,
  ListMusic,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Pause,
  Play,
  Plus,
  Search,
  Shuffle,
  Trash2,
  Upload,
  User as UserIcon,
  X,
} from 'lucide-react';
import { ImportPlaylistModal } from './components/ImportPlaylistModal';
import { MaximizedPlayer } from './components/MaximizedPlayer';
import { DownloadApkModal } from './components/DownloadApkModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PlayerBar } from './components/PlayerBar';
import { PlaylistModal } from './components/PlaylistModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { QueueDrawer } from './components/QueueDrawer';
import { SideMenuDrawer } from './components/SideMenuDrawer';
import { SleepTimerModal } from './components/SleepTimerModal';
import { TrackArtwork } from './components/TrackArtwork';
import { TrackRow } from './components/TrackRow';
import { LibraryProvider, useLibrary } from './context/LibraryContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { CURATED_TRACKS } from './data/curatedCatalog';
import { ActiveView, Track } from './types/music';

const GENRE_TILES = [
  { name: 'November Rain', color: 'from-[#E25822] to-[#451A03]' },
  { name: "Sweet Child O' Mine", color: 'from-[#E25822] to-[#7C2D12]' },
  { name: 'Breaking the Habit', color: 'from-[#9A3412] to-[#431407]' },
  { name: 'Waiting for the End', color: 'from-[#C2410C] to-[#3F1D14]' },
  { name: 'Hasnuhana', color: 'from-[#D94E1F] to-[#451A03]' },
  { name: 'Bring Me to Life', color: 'from-[#EA580C] to-[#571E09]' },
  { name: 'Lose Yourself', color: 'from-[#B45309] to-[#291509]' },
  { name: 'Linkin Park', color: 'from-[#78350F] to-[#1C1917]' },
  { name: "Guns N' Roses", color: 'from-[#E25822]/80 to-[#27272A]' },
];

const POPULAR_SUGGESTIONS = [
  'November Rain',
  "Sweet Child O' Mine",
  'Breaking the Habit',
  'Waiting for the End',
  'Hasnuhana',
  'Bring Me to Life',
  'Lose Yourself',
  'Linkin Park',
  "Guns N' Roses",
];

const CadenceWorkspace: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    shuffle,
    playTrack,
    shufflePlay,
    togglePlayPause,
    sleepTimerRemaining,
    setIsSleepTimerOpen,
  } = usePlayer();

  const {
    user,
    profileName,
    profileAvatar,
    likedTracks,
    playlists,
    signInWithGoogle,
    signOutUser,
    updateProfileAvatar,
    updateProfileName,
    deletePlaylist,
    removeTrackFromPlaylist,
  } = useLibrary();

  const [activeView, setActiveView] = useState<ActiveView>(ActiveView.HOME);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'playlists' | 'liked'>('all');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Search Predictions and Dropdown Autocomplete
  const [predictions, setPredictions] = useState<string[]>([]);
  const [matchingCatalogTracks, setMatchingCatalogTracks] = useState<Track[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [importPlaylistModalOpen, setImportPlaylistModalOpen] = useState(false);
  const [downloadApkModalOpen, setDownloadApkModalOpen] = useState(false);
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
    setIsDropdownOpen(false);

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

  // Live autocomplete predictions as the user types
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setPredictions([]);
      setMatchingCatalogTracks([]);
      return;
    }

    // Instant local catalog matches (0ms response)
    const lower = trimmed.toLowerCase();
    const localMatches = CURATED_TRACKS.filter(
      (t) =>
        t.title.toLowerCase().includes(lower) ||
        t.artist.toLowerCase().includes(lower) ||
        t.album.toLowerCase().includes(lower)
    ).slice(0, 3);
    setMatchingCatalogTracks(localMatches);

    // Live search predictions from backend
    let isCancelled = false;
    const fetchPredictions = async () => {
      try {
        const res = await fetch(`/api/music/suggestions?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && Array.isArray(data.suggestions)) {
            setPredictions(data.suggestions);
          }
        }
      } catch {
        // ignore network error
      }
    };

    const timer = setTimeout(fetchPredictions, 90);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  // Click outside to close prediction dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced auto-search when user pauses typing
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setHasSearched(false);
      return;
    }
    const timer = setTimeout(() => {
      executeMusicSearch(trimmed);
    }, 600);
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

  // Live time-of-day greeting that updates automatically throughout the day
  const [currentHour, setCurrentHour] = useState<number>(() => new Date().getHours());
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const greeting =
    currentHour >= 5 && currentHour < 12
      ? 'Good morning'
      : currentHour >= 12 && currentHour < 17
        ? 'Good afternoon'
        : currentHour >= 17 && currentHour < 21
          ? 'Good evening'
          : 'Good night';

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          const size = 256;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Center-crop square
            const minSide = Math.min(img.width, img.height);
            const sx = (img.width - minSide) / 2;
            const sy = (img.height - minSide) / 2;
            ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            await updateProfileAvatar(compressedDataUrl);
          }
        } finally {
          setIsUploadingAvatar(false);
          if (avatarInputRef.current) {
            avatarInputRef.current.value = '';
          }
        }
      };
      img.onerror = () => setIsUploadingAvatar(false);
      img.src = String(reader.result);
    };
    reader.onerror = () => setIsUploadingAvatar(false);
    reader.readAsDataURL(file);
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0A0A0C] text-[#F5F5F7] flex flex-col lg:p-2 lg:gap-2">
      <OfflineIndicator />
      {/* SPOTIFY TOP HEADER BAR */}
      <header className="px-2.5 sm:px-5 pt-3.5 pb-2 md:pt-4 md:pb-2.5 lg:py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 md:gap-3 shrink-0 bg-[#0A0A0C]">
        {/* Top Row on Mobile / Left+Right Wrapper */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-2 w-full md:w-auto min-w-0">
          {/* Left: 3-Line Hamburger Menu Button + Cadence Brand */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsSideMenuOpen(true)}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#16161C] hover:bg-[#24242C] border border-white/[0.08] text-[#F5F5F7] hover:text-[#E25822] flex items-center justify-center shrink-0 active:scale-95 transition-all"
              title="Open Menu"
              aria-label="Open Menu"
            >
              <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <button
              type="button"
              onClick={() => setActiveView(ActiveView.HOME)}
              className="flex items-center gap-2 sm:gap-3 text-left focus:outline-none min-w-0"
              title="Cadence Home"
              aria-label="Cadence Home"
            >
              <div className="w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-full bg-[#E25822] flex items-center justify-center text-white shrink-0 shadow-[0_0_18px_rgba(226,88,34,0.45)]">
                <Disc3 className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-lg sm:text-2xl md:text-2xl font-black leading-none tracking-tight text-[#F5F5F7] font-display truncate">
                  Cadence
                </span>
                <span className="text-[10px] sm:text-[11px] font-medium text-[#94949E] mt-0.5 whitespace-nowrap">
                  Made by Prithwish
                </span>
              </div>
            </button>
          </div>

          {/* Mobile Sign In / Profile / Install Buttons */}
          <div className="flex md:hidden items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
            <PWAInstallButton
              variant="compact"
              onOpenDownloadApk={() => setDownloadApkModalOpen(true)}
            />
            {user ? (
              <div className="flex items-center gap-1 bg-[#121216] rounded-full pl-1.5 pr-1 py-1 border border-white/[0.07] shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveView(ActiveView.PROFILE)}
                  className="flex items-center gap-1"
                >
                  {profileAvatar ? (
                    <img
                      src={profileAvatar}
                      alt={profileName || 'Profile'}
                      className="w-5 h-5 rounded-full object-cover border border-[#E25822]/40 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <span className="text-[11px] font-semibold text-[#F5F5F7] max-w-[55px] sm:max-w-[70px] truncate">
                    {profileName || user.displayName || user.email}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={signOutUser}
                  className="w-5 h-5 rounded-full bg-[#18181E] hover:bg-[#E25822] text-[#94949E] hover:text-white flex items-center justify-center transition-colors shrink-0"
                  title="Log out"
                  aria-label="Log out"
                >
                  <LogOut className="w-2.5 h-2.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="h-8 px-2.5 sm:px-3 rounded-full bg-[#F5F5F7] text-[#0A0A0C] text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 transition-transform"
              >
                <LogIn className="w-3 h-3 shrink-0" />
                <span>Log in</span>
              </button>
            )}
          </div>
        </div>

        {/* Center: Home Circle Button + Wide Expandable Spotify Pill Search Bar with Autocomplete Prediction Dropdown */}
        <div
          ref={searchContainerRef}
          className={`relative flex items-center justify-center gap-2.5 w-full md:flex-1 transition-all duration-200 ${
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

          <div className="w-full flex-1 relative">
            <form onSubmit={handleSearchSubmit} className="w-full">
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
                    setIsDropdownOpen(true);
                    if (activeView !== ActiveView.SEARCH) {
                      setActiveView(ActiveView.SEARCH);
                    }
                  }}
                  onFocus={() => {
                    setIsSearchFocused(true);
                    setIsDropdownOpen(true);
                    if (activeView !== ActiveView.SEARCH) {
                      setActiveView(ActiveView.SEARCH);
                    }
                  }}
                  onBlur={() => {
                    setIsSearchFocused(false);
                  }}
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
                      setPredictions([]);
                    }}
                    className="text-[#94949E] hover:text-white p-1.5 ml-1 shrink-0"
                    aria-label="Clear search"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </form>

            {/* PREDICTION / AUTOCOMPLETE DROPDOWN */}
            {isDropdownOpen && (
              <div
                onMouseDown={(e) => e.preventDefault()}
                className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#16161E] border border-white/[0.12] rounded-2xl shadow-2xl overflow-hidden p-2 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150 max-h-[420px] overflow-y-auto"
              >
                {/* 1. Direct Song Matches */}
                {matchingCatalogTracks.length > 0 && (
                  <div className="mb-2">
                    <p className="px-3 py-1 text-[11px] font-bold text-[#E25822] uppercase tracking-wider">
                      Songs
                    </p>
                    <div className="space-y-0.5">
                      {matchingCatalogTracks.map((track) => (
                        <div
                          key={track.id}
                          onClick={() => {
                            playTrack(track, CURATED_TRACKS);
                            setSearchQuery(track.title);
                            setIsDropdownOpen(false);
                          }}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.08] cursor-pointer transition-colors group"
                        >
                          <TrackArtwork
                            src={track.thumbnailUrl}
                            alt={track.title}
                            className="w-10 h-10 rounded-lg shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white group-hover:text-[#E25822] truncate transition-colors">
                              {track.title}
                            </p>
                            <p className="text-xs text-[#94949E] truncate">{track.artist}</p>
                          </div>
                          <span className="text-xs text-[#E25822] opacity-0 group-hover:opacity-100 flex items-center gap-1 font-medium pr-2 shrink-0 transition-opacity">
                            <Play className="w-3.5 h-3.5 fill-current" />
                            Play
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Live Search Predictions */}
                {predictions.length > 0 && (
                  <div>
                    <p className="px-3 py-1 text-[11px] font-bold text-[#94949E] uppercase tracking-wider">
                      Search Predictions
                    </p>
                    <div className="space-y-0.5">
                      {predictions.map((pred, i) => (
                        <button
                          key={`${pred}-${i}`}
                          type="button"
                          onClick={() => {
                            setSearchQuery(pred);
                            executeMusicSearch(pred);
                            setIsDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.08] text-left transition-colors group"
                        >
                          <Search className="w-4 h-4 text-[#94949E] group-hover:text-[#E25822] shrink-0 transition-colors" />
                          <span className="text-sm text-white group-hover:text-[#F5F5F7] truncate font-medium">
                            {pred}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Popular Suggestions when input is empty */}
                {searchQuery.trim().length === 0 && (
                  <div>
                    <p className="px-3 py-1 text-[11px] font-bold text-[#94949E] uppercase tracking-wider">
                      Trending Searches
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-1">
                      {POPULAR_SUGGESTIONS.map((term) => (
                        <button
                          key={term}
                          type="button"
                          onClick={() => {
                            setSearchQuery(term);
                            executeMusicSearch(term);
                            setIsDropdownOpen(false);
                          }}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.08] text-left transition-colors group"
                        >
                          <Search className="w-3.5 h-3.5 text-[#E25822] shrink-0" />
                          <span className="text-xs sm:text-sm text-[#F5F5F7] group-hover:text-[#E25822] truncate font-medium">
                            {term}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Desktop Right: Install App + Sign In / Profile Button */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <PWAInstallButton
            variant="pill"
            onOpenDownloadApk={() => setDownloadApkModalOpen(true)}
          />
          {user ? (
            <div className="flex items-center gap-2 bg-[#121216] rounded-full pl-2 pr-2 py-1.5 border border-white/[0.07]">
              <button
                type="button"
                onClick={() => setActiveView(ActiveView.PROFILE)}
                className="flex items-center gap-2 hover:opacity-90"
              >
                {profileAvatar ? (
                  <img
                    src={profileAvatar}
                    alt={profileName || 'Profile'}
                    className="w-7 h-7 rounded-full object-cover border border-[#E25822]/40 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <span className="text-xs font-semibold text-[#F5F5F7] max-w-[110px] truncate">
                  {profileName || user.displayName || user.email}
                </span>
              </button>
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
              onClick={() => void signInWithGoogle()}
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
                    {user && profileName ? `, ${String(profileName).trim().split(/\s+/)[0]}` : ''}
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
                          hideShareAndDuration
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
                            hideShareAndDuration
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
                      title="Play Liked Songs"
                      aria-label="Play Liked Songs"
                    >
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => shufflePlay(likedTracks)}
                      className={`h-11 px-4 rounded-full border flex items-center gap-2 text-sm font-bold transition-all active:scale-95 ${
                        shuffle
                          ? 'bg-[#E25822]/15 border-[#E25822]/50 text-[#E25822] hover:bg-[#E25822]/25'
                          : 'bg-[#18181E] hover:bg-white/[0.1] border-white/[0.1] text-[#F5F5F7]'
                      }`}
                      title="Shuffle play Liked Songs"
                      aria-label="Shuffle play Liked Songs"
                    >
                      <Shuffle className="w-4 h-4" />
                      <span>Shuffle</span>
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
                    <div className="grid grid-cols-[auto_1fr_auto] gap-3 sm:gap-4 px-3 sm:px-4 py-2 border-b border-white/[0.08] text-xs text-[#94949E] mb-2">
                      <span className="w-6 text-center">#</span>
                      <span>Title</span>
                      <span />
                    </div>
                    <div className="space-y-0.5">
                      {likedTracks.map((track, idx) => (
                        <TrackRow
                          key={track.id}
                          track={track}
                          index={idx}
                          queueContext={likedTracks}
                          onOpenPlaylistModal={openPlaylistModalForTrack}
                          hideShareAndDuration
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
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          playTrack(selectedPlaylist.tracks[0], selectedPlaylist.tracks)
                        }
                        className="w-14 h-14 rounded-full bg-[#E25822] hover:bg-[#F06A35] hover:scale-105 text-white flex items-center justify-center shadow-xl transition-transform"
                        title="Play playlist"
                        aria-label="Play playlist"
                      >
                        <Play className="w-6 h-6 fill-current ml-0.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => shufflePlay(selectedPlaylist.tracks)}
                        className={`h-11 px-4 rounded-full border flex items-center gap-2 text-sm font-bold transition-all active:scale-95 ${
                          shuffle
                            ? 'bg-[#E25822]/15 border-[#E25822]/50 text-[#E25822] hover:bg-[#E25822]/25'
                            : 'bg-[#18181E] hover:bg-white/[0.1] border-white/[0.1] text-[#F5F5F7]'
                        }`}
                        title="Shuffle play playlist"
                        aria-label="Shuffle play playlist"
                      >
                        <Shuffle className="w-4 h-4" />
                        <span>Shuffle</span>
                      </button>
                    </>
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
                    <div className="grid grid-cols-[auto_1fr_auto] gap-3 sm:gap-4 px-3 sm:px-4 py-2 border-b border-white/[0.08] text-xs text-[#94949E] mb-2">
                      <span className="w-6 text-center">#</span>
                      <span>Title</span>
                      <span />
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
                          hideShareAndDuration
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* VIEW 6: USER PROFILE */}
            {activeView === ActiveView.PROFILE && (
              <section className="space-y-6 max-w-3xl">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />

                <div className="flex flex-col sm:flex-row sm:items-center gap-6 p-6 rounded-2xl bg-[#18181E]/80 border border-white/[0.08]">
                  {/* Profile Picture with Upload Overlay */}
                  <div className="flex flex-col items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="group relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-[#E25822] shadow-xl focus:outline-none"
                      title="Upload custom profile picture"
                    >
                      {user && profileAvatar ? (
                        <img
                          src={profileAvatar}
                          alt={profileName || user.displayName || 'Profile'}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#1C1C24] to-[#121216] border border-white/[0.08] flex items-center justify-center text-[#94949E] font-display font-bold text-3xl">
                          {user ? (
                            (profileName || user.displayName || user.email || 'L')[0].toUpperCase()
                          ) : (
                            <UserIcon className="w-12 h-12 text-[#94949E]" />
                          )}
                        </div>
                      )}
                      {user && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 text-white transition-opacity">
                          <Camera className="w-5 h-5 text-[#E25822]" />
                          <span className="text-[10px] font-bold">Change Photo</span>
                        </div>
                      )}
                    </button>

                    {user ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={isUploadingAvatar}
                          className="px-3 py-1.5 rounded-full bg-[#E25822]/15 hover:bg-[#E25822]/25 text-[#E25822] border border-[#E25822]/30 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{isUploadingAvatar ? 'Uploading...' : 'Upload Photo'}</span>
                        </button>

                        {profileAvatar && profileAvatar !== user.photoURL && (
                          <button
                            type="button"
                            onClick={() => updateProfileAvatar('')}
                            className="px-2.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-red-500/20 text-[#94949E] hover:text-red-400 text-xs font-semibold transition-colors cursor-pointer"
                            title="Reset to default photo"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void signInWithGoogle()}
                        className="px-3 py-1.5 rounded-full bg-[#E25822] hover:bg-[#F06A35] text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#E25822]/20 transition-colors cursor-pointer"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Sign in to customize</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E25822]/15 text-[#E25822] border border-[#E25822]/30">
                      <UserIcon className="w-3 h-3" />
                      {user ? 'Cloud Synced Profile' : 'Guest Session'}
                    </span>

                    {user && isEditingName ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (nameInput.trim()) {
                            await updateProfileName(nameInput.trim());
                          }
                          setIsEditingName(false);
                        }}
                        className="flex items-center gap-2 pt-1"
                      >
                        <input
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          placeholder="Your name"
                          maxLength={40}
                          className="px-3 py-1.5 rounded-xl bg-[#121216] border border-[#E25822] text-sm font-bold text-[#F5F5F7] focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-xl bg-[#E25822] text-white text-xs font-bold"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingName(false)}
                          className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] text-[#94949E] text-xs font-semibold"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <h1 className="text-2xl sm:text-4xl font-bold text-[#F5F5F7] font-display truncate">
                          {user ? (profileName || user.displayName || 'Listener') : 'Guest'}
                        </h1>
                        {user ? (
                          <button
                            type="button"
                            onClick={() => {
                              setNameInput(profileName || user.displayName || '');
                              setIsEditingName(true);
                            }}
                            className="px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-semibold text-[#94949E] hover:text-[#F5F5F7] transition-colors shrink-0 cursor-pointer"
                          >
                            Edit Name
                          </button>
                        ) : null}
                      </div>
                    )}

                    <p className="text-sm text-[#94949E] truncate">
                      {user
                        ? user.email
                        : 'Sign in with Google to sync your liked songs, playlists, and profile across devices.'}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {user ? (
                      <button
                        type="button"
                        onClick={signOutUser}
                        className="px-5 py-2.5 rounded-full bg-white/[0.08] hover:bg-red-500/20 text-[#F5F5F7] hover:text-red-400 text-xs font-bold flex items-center gap-2 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void signInWithGoogle()}
                        className="px-5 py-2.5 rounded-full bg-[#E25822] hover:bg-[#F06A35] text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#E25822]/25 transition-colors"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Sign in with Google</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div
                    onClick={() => setActiveView(ActiveView.LIKED)}
                    className="p-5 rounded-2xl bg-[#18181E]/60 hover:bg-[#22222A] border border-white/[0.07] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-[#94949E]">Liked Songs</span>
                      <Heart className="w-4 h-4 text-[#E25822]" />
                    </div>
                    <p className="text-3xl font-bold text-[#F5F5F7] font-display">
                      {likedTracks.length}
                    </p>
                  </div>

                  <div
                    onClick={() => setActiveView(ActiveView.PLAYLISTS)}
                    className="p-5 rounded-2xl bg-[#18181E]/60 hover:bg-[#22222A] border border-white/[0.07] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-[#94949E]">Custom Playlists</span>
                      <ListMusic className="w-4 h-4 text-[#E25822]" />
                    </div>
                    <p className="text-3xl font-bold text-[#F5F5F7] font-display">
                      {playlists.length}
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-[#18181E]/60 border border-white/[0.07]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-[#94949E]">Sleep Timer</span>
                      <Moon className="w-4 h-4 text-[#E25822]" />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setIsSleepTimerOpen(true)}
                        className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-[#F5F5F7] flex items-center gap-1.5 transition-colors"
                      >
                        <Moon className="w-3.5 h-3.5 text-[#E25822]" />
                        <span>
                          {sleepTimerRemaining !== null
                            ? `${Math.ceil(sleepTimerRemaining / 60)}m`
                            : 'Sleep Timer'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* VIEW 7: ABOUT CADENCE */}
            {activeView === ActiveView.ABOUT && (
              <section className="max-w-2xl">
                <div className="p-8 rounded-2xl bg-[#18181E]/80 border border-white/[0.08] space-y-4">
                  <p className="text-lg sm:text-xl font-semibold text-[#F5F5F7] font-display">
                    Made this out of boredom, hope it to be working :-!
                  </p>
                  <p className="text-xs sm:text-sm text-[#94949E]">
                    feedback/contact us:{' '}
                    <a
                      href="mailto:prithwishdey.100@gmail.com"
                      className="text-[#E25822] hover:underline"
                    >
                      prithwishdey.100@gmail.com
                    </a>
                  </p>
                  <p className="text-sm font-bold italic text-[#F5F5F7]">
                    Made by Prithwish Dey
                  </p>
                  <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-[#94949E]">
                    <span>App Version</span>
                    <span className="font-mono font-semibold text-[#F5F5F7]">
                      v1.4.0 (Build 5)
                    </span>
                  </div>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      {/* Left Slide-Out Side Menu (Triggered by top-left Cadence logo) */}
      <SideMenuDrawer
        isOpen={isSideMenuOpen}
        onClose={() => setIsSideMenuOpen(false)}
        activeView={activeView}
        onNavigate={(view) => setActiveView(view)}
        onSelectPlaylist={(id) => {
          setSelectedPlaylistId(id);
          setActiveView(ActiveView.PLAYLIST_DETAIL);
        }}
        onCreatePlaylist={openCreatePlaylistModal}
        onImportPlaylist={() => setImportPlaylistModalOpen(true)}
        onOpenDownloadApk={() => setDownloadApkModalOpen(true)}
      />

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

      {/* Import Playlist Modal */}
      <ImportPlaylistModal
        isOpen={importPlaylistModalOpen}
        onClose={() => setImportPlaylistModalOpen(false)}
        onImportedPlaylist={(newId) => {
          setSelectedPlaylistId(newId);
          setActiveView(ActiveView.PLAYLIST_DETAIL);
        }}
      />

      {/* Sleep Timer Modal */}
      <SleepTimerModal />

      {/* Download APK Explanation Modal */}
      <DownloadApkModal
        isOpen={downloadApkModalOpen}
        onClose={() => setDownloadApkModalOpen(false)}
      />

      {/* External Browser -> Android APK Auth Handoff Overlay (?apk_auth=1) */}
      {typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('apk_auth') === '1' && (
          <div className="fixed inset-0 z-[200] bg-[#0A0A0C]/95 backdrop-blur-xl flex items-center justify-center p-5">
            <div className="w-full max-w-md rounded-2xl bg-[#14141A] border border-white/[0.1] p-6 shadow-2xl text-center space-y-5">
              <div className="w-14 h-14 rounded-full bg-[#E25822] flex items-center justify-center text-white mx-auto shadow-[0_0_25px_rgba(226,88,34,0.45)]">
                <Disc3 className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold text-[#F5F5F7] font-display">
                  Sign in to Cadence App
                </h2>
                <p className="text-xs text-[#94949E] leading-relaxed">
                  Tap below to authenticate with your Google account in your browser and return directly to the Cadence Android app.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="w-full py-3.5 px-5 rounded-xl bg-[#E25822] hover:bg-[#F06A35] text-white text-sm font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-[#E25822]/30 transition-all cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Continue with Google</span>
              </button>
            </div>
          </div>
        )}
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
