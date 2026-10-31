import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CURATED_TRACKS, FEATURED_TRACK, PRESET_SYNCED_LYRICS } from '../data/curatedCatalog';
import { LyricLine, RepeatMode, Track } from '../types/music';
import {
  isRunningInNativeApk,
  nativePlayerGetStatus,
  nativePlayerLoadAndPlay,
  nativePlayerPreloadTrack,
  nativePlayerSeekTo,
  nativePlayerSetPlaying,
  nativePlayerSetVolume,
  resolveLyricsInApk,
  resolveStreamInApk,
  syncNativeNotificationInApk,
} from '../utils/nativeStreamResolver';

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        options: {
          height?: string | number;
          width?: string | number;
          videoId?: string;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
            onError?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayerInstance;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerInstance {
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

interface PlayerContextValue {
  currentTrack: Track;
  queue: Track[];
  originalQueue: Track[];
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  isMaximized: boolean;
  showVideoInMaximized: boolean;
  isQueueOpen: boolean;
  lyrics: LyricLine[];
  lyricsSource: string;
  isLoadingLyrics: boolean;
  activeLyricIndex: number;
  playTrack: (track: Track, newQueue?: Track[]) => void;
  shufflePlay: (tracks: Track[]) => void;
  togglePlayPause: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  setIsMaximized: (val: boolean) => void;
  setShowVideoInMaximized: (val: boolean) => void;
  setIsQueueOpen: (val: boolean) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (trackId: string) => void;
  sleepTimerRemaining: number | null;
  sleepTimerTotal: number | null;
  sleepTimerMode: 'duration' | 'end_of_track' | null;
  isSleepTimerOpen: boolean;
  setIsSleepTimerOpen: (val: boolean) => void;
  setSleepTimer: (option: number | 'end_of_track') => void;
  cancelSleepTimer: () => void;
  extendSleepTimer: (minutes: number) => void;
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

// Pure Fisher-Yates shuffle algorithm
function shuffleArray<T>(items: T[]): T[] {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getInitialSharedTrack(): Track | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const trackId = params.get('track');
  if (!trackId) return null;

  const curatedMatch = CURATED_TRACKS.find((t) => t.id === trackId);
  if (curatedMatch) return curatedMatch;

  const title = params.get('title') || 'Shared Track';
  const artist = params.get('artist') || 'Unknown Artist';
  const album = params.get('album') || 'Single';
  const duration = Number(params.get('duration')) || 210;
  const thumbnailUrl =
    params.get('thumb') || `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg`;

  return {
    id: trackId,
    title,
    artist,
    album,
    duration,
    thumbnailUrl,
  };
}

// Generate a 10-second silent WAV blob URL (>5s Chromium threshold for Persistent MediaSession notifications)
function createSilentWavUrl(): string {
  const sampleRate = 8000;
  const numSamples = sampleRate * 10; // 10 seconds (must be >= 5s for Android Chrome MediaNotification)
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // Byte rate
  view.setUint16(32, 1, true); // Block align
  view.setUint16(34, 8, true); // 8-bit PCM
  writeString(36, 'data');
  view.setUint32(40, numSamples, true);

  // 128 is silence (zero-crossing) in unsigned 8-bit PCM
  const samples = new Uint8Array(buffer, 44, numSamples);
  samples.fill(128);

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialSharedTrack = useRef<Track | null>(getInitialSharedTrack()).current;
  const [currentTrack, setCurrentTrack] = useState<Track>(initialSharedTrack || FEATURED_TRACK);
  const [originalQueue, setOriginalQueue] = useState<Track[]>(() => {
    if (initialSharedTrack && !CURATED_TRACKS.some((t) => t.id === initialSharedTrack.id)) {
      return [initialSharedTrack, ...CURATED_TRACKS];
    }
    return CURATED_TRACKS;
  });
  const [queue, setQueue] = useState<Track[]>(() => {
    if (initialSharedTrack && !CURATED_TRACKS.some((t) => t.id === initialSharedTrack.id)) {
      return [initialSharedTrack, ...CURATED_TRACKS];
    }
    return CURATED_TRACKS;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(
    (initialSharedTrack || FEATURED_TRACK).duration
  );
  const [volume, setVolumeState] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(RepeatMode.OFF);
  const [isMaximized, setIsMaximized] = useState<boolean>(Boolean(initialSharedTrack));
  const [showVideoInMaximized, setShowVideoInMaximized] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  // Sleep Timer state
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);
  const [sleepTimerTotal, setSleepTimerTotal] = useState<number | null>(null);
  const [sleepTimerMode, setSleepTimerMode] = useState<'duration' | 'end_of_track' | null>(null);
  const [isSleepTimerOpen, setIsSleepTimerOpen] = useState(false);
  const sleepTimerModeRef = useRef<'duration' | 'end_of_track' | null>(null);
  const sleepTimerRemainingRef = useRef<number | null>(null);

  const [lyrics, setLyrics] = useState<LyricLine[]>(
    PRESET_SYNCED_LYRICS[FEATURED_TRACK.id] || []
  );
  const [lyricsSource, setLyricsSource] = useState<string>('Synced');
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);

  // Track Notification permission for installed Android 13+ PWAs (WebAPKs block MediaSession notifications until granted)
  const [notificationPermission, setNotificationPermission] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'granted';
  });
  const [dismissedNotifBanner, setDismissedNotifBanner] = useState(false);

  // Primary Native HTML5 Audio Engine + Next-Track Prebuffer + Fallback YouTube IFrame Engine
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null);
  const preloadNextAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeEngineRef = useRef<'native' | 'youtube'>('native');
  const resolvedStreamsRef = useRef<Map<string, { streamUrl: string | null; duration: number }>>(
    new Map()
  );
  const inFlightStreamsRef = useRef<
    Map<string, Promise<{ streamUrl: string | null; duration: number }>>
  >(new Map());
  const silentWavUrlRef = useRef<string>('');

  const playerRef = useRef<YTPlayerInstance | null>(null);
  const isPlayerReadyRef = useRef(false);
  const autoPlayOnLoadRef = useRef(false);
  const intendedPlayingRef = useRef(false);
  const lastVisibilityTimestampRef = useRef<number>(0);
  const handleTrackEndRef = useRef<() => void>(() => {});
  const fetchedForTrackDurationRef = useRef<string>('');
  const nativeTrackLoadedRef = useRef<string>('');

  const originalQueueRef = useRef<Track[]>(CURATED_TRACKS);
  const shuffleRef = useRef<boolean>(false);
  const queueRef = useRef<Track[]>(CURATED_TRACKS);
  const currentTrackRef = useRef(currentTrack);
  const durationRef = useRef(duration);
  const currentTimeRef = useRef(currentTime);
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);

  const requestPwaNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      setNotificationPermission('granted');
      return;
    }
    if (Notification.permission === 'default') {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
      } catch {
        // ignore
      }
    } else {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !silentWavUrlRef.current) {
      silentWavUrlRef.current = createSilentWavUrl();
    }
  }, []);

  useEffect(() => {
    sleepTimerModeRef.current = sleepTimerMode;
  }, [sleepTimerMode]);

  useEffect(() => {
    sleepTimerRemainingRef.current = sleepTimerRemaining;
  }, [sleepTimerRemaining]);

  useEffect(() => {
    originalQueueRef.current = originalQueue;
  }, [originalQueue]);

  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Resolve direct 320kbps audio/mp4 stream URL with caching & deduplication
  const resolveTrackAudioStream = useCallback(
    async (track: Track): Promise<{ streamUrl: string | null; duration: number }> => {
      const cached = resolvedStreamsRef.current.get(track.id);
      if (cached !== undefined) {
        return cached;
      }

      const existingPromise = inFlightStreamsRef.current.get(track.id);
      if (existingPromise) {
        return existingPromise;
      }

      const promise = (async () => {
        try {
          if (isRunningInNativeApk()) {
            const apkResolved = await resolveStreamInApk(track);
            if (apkResolved.streamUrl) {
              resolvedStreamsRef.current.set(track.id, apkResolved);
              return apkResolved;
            }
          }

          const params = new URLSearchParams({
            id: track.id,
            title: track.title,
            artist: track.artist,
            duration: String(track.duration || 210),
          });
          const res = await fetch(`/api/music/audio-stream?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            const result = {
              streamUrl: typeof data.streamUrl === 'string' && data.streamUrl ? data.streamUrl : null,
              duration: Number(data.duration) || track.duration || 210,
            };
            resolvedStreamsRef.current.set(track.id, result);
            return result;
          }
        } catch {
          // ignore network error and fall back
        }
        const fallback = { streamUrl: null, duration: track.duration || 210 };
        return fallback;
      })();

      inFlightStreamsRef.current.set(track.id, promise);
      try {
        return await promise;
      } finally {
        inFlightStreamsRef.current.delete(track.id);
      }
    },
    []
  );

  // Pre-resolve current track and upcoming/neighboring queue tracks so background track transitions are instant
  useEffect(() => {
    let isCancelled = false;

    const preloadStreams = async () => {
      const current = currentTrack;
      const resolved = await resolveTrackAudioStream(current);

      // If not playing yet and nativeAudio has no real stream loaded for the initial track, pre-set src (Web only)
      if (
        !isCancelled &&
        !isRunningInNativeApk() &&
        currentTrackRef.current.id === current.id &&
        resolved.streamUrl &&
        nativeAudioRef.current &&
        (!nativeAudioRef.current.src || nativeAudioRef.current.src === silentWavUrlRef.current)
      ) {
        activeEngineRef.current = 'native';
        nativeAudioRef.current.src = resolved.streamUrl;
        nativeAudioRef.current.load();
      }

      // Pre-resolve next 3 tracks and previous track in queue
      const idx = queue.findIndex((t) => t.id === current.id);
      if (idx !== -1 && queue.length > 1) {
        if (isRunningInNativeApk()) {
          await new Promise((r) => setTimeout(r, 800));
          if (isCancelled) return;
        }
        const neighbors: Track[] = [];
        for (let offset = 1; offset <= 3; offset++) {
          neighbors.push(queue[(idx + offset) % queue.length]);
        }
        const prevIdx = idx > 0 ? idx - 1 : queue.length - 1;
        neighbors.push(queue[prevIdx]);

        for (let i = 0; i < neighbors.length; i++) {
          if (isCancelled) break;
          const neighborResolved = await resolveTrackAudioStream(neighbors[i]);
          if (isRunningInNativeApk()) {
            // In Native APK, pre-download the next 2 tracks onto local disk cache in CadenceAudioService
            if (!isCancelled && i < 2 && neighborResolved.streamUrl) {
              nativePlayerPreloadTrack(neighbors[i].id, neighborResolved.streamUrl);
            }
          } else if (
            i === 0 &&
            !isCancelled &&
            neighborResolved.streamUrl &&
            preloadNextAudioRef.current &&
            preloadNextAudioRef.current.src !== neighborResolved.streamUrl
          ) {
            // Web: Pre-buffer the immediate next track's audio stream in background so transitions are 0ms
            preloadNextAudioRef.current.src = neighborResolved.streamUrl;
            preloadNextAudioRef.current.load();
          }
        }
      }
    };

    preloadStreams();
    return () => {
      isCancelled = true;
    };
  }, [currentTrack, queue, resolveTrackAudioStream]);

  // Unified track launcher that uses Native HTML5 <audio> first (for rock-solid background playback)
  // and falls back to YouTube IFrame only when a direct stream is unavailable
  const startTrackPlayback = useCallback(
    (track: Track) => {
      // Request Android 13+ WebAPK notification permission if not yet granted so OS Notification Bar shows MediaSession
      requestPwaNotificationPermission();

      fetchedForTrackDurationRef.current = '';
      setCurrentTrack(track);
      currentTrackRef.current = track;
      setCurrentTime(0);
      currentTimeRef.current = 0;
      setDuration(track.duration || 210);
      durationRef.current = track.duration || 210;

      if (PRESET_SYNCED_LYRICS[track.id]) {
        setLyrics(PRESET_SYNCED_LYRICS[track.id]);
      } else {
        setLyrics([]);
      }

      autoPlayOnLoadRef.current = true;
      intendedPlayingRef.current = true;
      setIsPlaying(true);

      // In Native Android APK: delegate audio playback 100% to native Android MediaPlayer in CadenceAudioService
      if (isRunningInNativeApk()) {
        activeEngineRef.current = 'native';
        nativeAudioRef.current?.pause();
        if (isPlayerReadyRef.current && playerRef.current) {
          try {
            playerRef.current.pauseVideo();
          } catch {
            // ignore
          }
        }

        const cached = resolvedStreamsRef.current.get(track.id);
        if (cached && cached.streamUrl) {
          if (cached.duration > 0) {
            setDuration(cached.duration);
            durationRef.current = cached.duration;
          }
          nativeTrackLoadedRef.current = track.id;
          setIsBuffering(true);
          nativePlayerLoadAndPlay(
            { ...track, duration: cached.duration || track.duration || 210 },
            cached.streamUrl,
            isMutedRef.current ? 0 : volumeRef.current
          );
          return;
        }

        setIsBuffering(true);
        syncNativeNotificationInApk(
          track.title,
          track.artist,
          track.album || 'Cadence',
          track.thumbnailUrl || '',
          true,
          0,
          (track.duration || 210) * 1000
        );

        resolveTrackAudioStream(track).then((resolved) => {
          if (currentTrackRef.current.id !== track.id) return;
          if (resolved.duration > 0) {
            setDuration(resolved.duration);
            durationRef.current = resolved.duration;
          }
          if (resolved.streamUrl) {
            nativeTrackLoadedRef.current = track.id;
            nativePlayerLoadAndPlay(
              { ...track, duration: resolved.duration || track.duration || 210 },
              resolved.streamUrl,
              isMutedRef.current ? 0 : volumeRef.current
            ).then(() => {
              if (!intendedPlayingRef.current) {
                nativePlayerSetPlaying(false);
              }
            });
          } else {
            setIsBuffering(false);
          }
        });
        return;
      }

      const audioEl = nativeAudioRef.current;
      const cached = resolvedStreamsRef.current.get(track.id);

      if (cached && cached.streamUrl && audioEl) {
        activeEngineRef.current = 'native';
        if (isPlayerReadyRef.current && playerRef.current) {
          try {
            playerRef.current.pauseVideo();
          } catch {
            // ignore
          }
        }
        if (audioEl.src !== cached.streamUrl) {
          setIsBuffering(true);
          audioEl.src = cached.streamUrl;
        } else {
          setIsBuffering(false);
        }
        audioEl.currentTime = 0;
        audioEl.volume = isMutedRef.current ? 0 : volumeRef.current / 100;
        audioEl.play().catch(() => {
          // If native play fails unexpectedly, fall back to YouTube
          activeEngineRef.current = 'youtube';
          if (isPlayerReadyRef.current && playerRef.current) {
            playerRef.current.unMute();
            playerRef.current.loadVideoById(track.id, 0);
            playerRef.current.playVideo();
          }
        });
        return;
      }

      // If stream is not cached yet, unlock nativeAudio synchronously inside user gesture with silent WAV
      if (audioEl && silentWavUrlRef.current) {
        try {
          audioEl.src = silentWavUrlRef.current;
          audioEl.volume = isMutedRef.current ? 0 : volumeRef.current / 100;
          audioEl.play().catch(() => {});
        } catch {
          // ignore
        }
      }

      setIsBuffering(true);

      resolveTrackAudioStream(track).then((resolved) => {
        if (currentTrackRef.current.id !== track.id) return;

        if (resolved.streamUrl && nativeAudioRef.current) {
          activeEngineRef.current = 'native';
          if (isPlayerReadyRef.current && playerRef.current) {
            try {
              playerRef.current.pauseVideo();
            } catch {
              // ignore
            }
          }
          if (resolved.duration > 0) {
            setDuration(resolved.duration);
            durationRef.current = resolved.duration;
          }
          nativeAudioRef.current.src = resolved.streamUrl;
          nativeAudioRef.current.currentTime = 0;
          nativeAudioRef.current.volume = isMutedRef.current ? 0 : volumeRef.current / 100;
          if (intendedPlayingRef.current) {
            nativeAudioRef.current.play().catch(() => {
              activeEngineRef.current = 'youtube';
              if (isPlayerReadyRef.current && playerRef.current) {
                playerRef.current.unMute();
                playerRef.current.loadVideoById(track.id, 0);
                playerRef.current.playVideo();
              }
            });
          }
        } else {
          // Fallback to YouTube IFrame engine
          activeEngineRef.current = 'youtube';
          if (nativeAudioRef.current) {
            nativeAudioRef.current.pause();
          }
          if (isPlayerReadyRef.current && playerRef.current) {
            if (!isMutedRef.current) {
              playerRef.current.unMute();
              playerRef.current.setVolume(volumeRef.current);
            }
            playerRef.current.loadVideoById(track.id, 0);
            if (intendedPlayingRef.current) {
              playerRef.current.playVideo();
            }
          }
        }
      });
    },
    [requestPwaNotificationPermission, resolveTrackAudioStream]
  );

  // Sync muted YouTube video when user opens Video view in MaximizedPlayer while native audio is playing
  useEffect(() => {
    if (!isPlayerReadyRef.current || !playerRef.current) return;
    if (activeEngineRef.current !== 'native') return;

    try {
      if (showVideoInMaximized && isMaximized && isPlaying) {
        playerRef.current.mute();
        playerRef.current.loadVideoById(currentTrack.id, currentTimeRef.current);
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }
    } catch {
      // ignore
    }
  }, [showVideoInMaximized, isMaximized, isPlaying, currentTrack.id]);

  // Fetch accurate duration-matched synced lyrics
  useEffect(() => {
    let isCancelled = false;
    const effectiveDuration = duration || currentTrack.duration || 200;
    const cacheKey = `${currentTrack.id}:${Math.round(effectiveDuration / 5) * 5}`;

    if (fetchedForTrackDurationRef.current === cacheKey && lyrics.length > 0) {
      return;
    }

    const loadLyrics = async () => {
      if (PRESET_SYNCED_LYRICS[currentTrack.id]) {
        setLyrics(PRESET_SYNCED_LYRICS[currentTrack.id]);
        fetchedForTrackDurationRef.current = cacheKey;
        return;
      }

      setIsLoadingLyrics(true);

      try {
        if (isRunningInNativeApk()) {
          const apkLyrics = await resolveLyricsInApk(
            currentTrack.title,
            currentTrack.artist,
            effectiveDuration
          );
          if (!isCancelled && apkLyrics.lines.length > 0) {
            setLyrics(apkLyrics.lines);
            setLyricsSource(apkLyrics.source || 'Synced');
            fetchedForTrackDurationRef.current = cacheKey;
            return;
          }
        }

        const params = new URLSearchParams({
          title: currentTrack.title,
          artist: currentTrack.artist,
          duration: String(effectiveDuration),
        });
        const res = await fetch(`/api/lyrics?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch lyrics');
        const data = await res.json();
        if (!isCancelled && Array.isArray(data.lines) && data.lines.length > 0) {
          setLyrics(data.lines);
          setLyricsSource(data.source || 'Synced');
          fetchedForTrackDurationRef.current = cacheKey;
        }
      } catch (e) {
        console.error('Lyrics fetch error:', e);
      } finally {
        if (!isCancelled) {
          setIsLoadingLyrics(false);
        }
      }
    };

    loadLyrics();
    return () => {
      isCancelled = true;
    };
  }, [currentTrack.id, currentTrack.title, currentTrack.artist, duration]);

  // High-precision active lyric line matching
  const activeLyricIndex = React.useMemo(() => {
    if (!lyrics || lyrics.length === 0) return -1;

    // Small 0.15s lead for human visual reaction
    const syncTime = currentTime + 0.15;

    // If playback is before the first sung line (instrumental intro)
    if (syncTime < lyrics[0].time) {
      return -1;
    }

    let activeIdx = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (syncTime >= lyrics[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }
    return activeIdx;
  }, [lyrics, currentTime]);

  const playTrack = useCallback(
    (track: Track, newQueue?: Track[]) => {
      let baseContext = originalQueueRef.current;
      if (newQueue && newQueue.length > 0) {
        baseContext = newQueue;
        setOriginalQueue(newQueue);
        originalQueueRef.current = newQueue;
      } else if (!baseContext.some((t) => t.id === track.id)) {
        baseContext = [track, ...baseContext];
        setOriginalQueue(baseContext);
        originalQueueRef.current = baseContext;
      }

      if (shuffleRef.current) {
        const otherTracks = baseContext.filter((t) => t.id !== track.id);
        const shuffledList = [track, ...shuffleArray(otherTracks)];
        setQueue(shuffledList);
        queueRef.current = shuffledList;
      } else {
        setQueue(baseContext);
        queueRef.current = baseContext;
      }

      startTrackPlayback(track);
    },
    [startTrackPlayback]
  );

  const shufflePlay = useCallback(
    (tracks: Track[]) => {
      if (!tracks || tracks.length === 0) return;

      setOriginalQueue(tracks);
      originalQueueRef.current = tracks;

      setShuffle(true);
      shuffleRef.current = true;

      const shuffledList = shuffleArray(tracks);
      setQueue(shuffledList);
      queueRef.current = shuffledList;

      const firstTrack = shuffledList[0];
      startTrackPlayback(firstTrack);
    },
    [startTrackPlayback]
  );

  const nextTrack = useCallback(() => {
    const activeQueue = queueRef.current;
    if (activeQueue.length === 0) return;

    const current = currentTrackRef.current;
    const currentIdx = activeQueue.findIndex((t) => t.id === current.id);
    let nextIdx = currentIdx + 1;

    if (nextIdx >= activeQueue.length) {
      if (repeatMode === RepeatMode.OFF) {
        intendedPlayingRef.current = false;
        setIsPlaying(false);
        if (isRunningInNativeApk()) {
          nativePlayerSetPlaying(false);
        }
        nativeAudioRef.current?.pause();
        if (isPlayerReadyRef.current && playerRef.current) {
          playerRef.current.pauseVideo();
        }
        return;
      }
      nextIdx = 0;
    }

    const next = activeQueue[nextIdx];
    if (next) {
      startTrackPlayback(next);
    }
  }, [repeatMode, startTrackPlayback]);

  const prevTrack = useCallback(() => {
    if (currentTimeRef.current > 4) {
      if (isRunningInNativeApk()) {
        nativePlayerSeekTo(0);
      } else if (activeEngineRef.current === 'native' && nativeAudioRef.current) {
        nativeAudioRef.current.currentTime = 0;
      } else if (playerRef.current && isPlayerReadyRef.current) {
        playerRef.current.seekTo(0, true);
      }
      setCurrentTime(0);
      currentTimeRef.current = 0;
      return;
    }

    const activeQueue = queueRef.current;
    if (activeQueue.length === 0) return;

    const current = currentTrackRef.current;
    const currentIdx = activeQueue.findIndex((t) => t.id === current.id);
    const prevIdx = currentIdx > 0 ? currentIdx - 1 : activeQueue.length - 1;
    const prev = activeQueue[prevIdx];
    if (prev) {
      startTrackPlayback(prev);
    }
  }, [startTrackPlayback]);

  useEffect(() => {
    handleTrackEndRef.current = () => {
      if (sleepTimerModeRef.current === 'end_of_track') {
        intendedPlayingRef.current = false;
        if (isRunningInNativeApk()) {
          nativePlayerSetPlaying(false);
        }
        nativeAudioRef.current?.pause();
        if (playerRef.current && isPlayerReadyRef.current) {
          playerRef.current.pauseVideo();
        }
        setIsPlaying(false);
        setSleepTimerRemaining(null);
        setSleepTimerTotal(null);
        setSleepTimerMode(null);
        sleepTimerRemainingRef.current = null;
        sleepTimerModeRef.current = null;
        return;
      }

      if (repeatMode === RepeatMode.ONE) {
        intendedPlayingRef.current = true;
        setCurrentTime(0);
        currentTimeRef.current = 0;
        if (isRunningInNativeApk()) {
          nativePlayerSeekTo(0);
          nativePlayerSetPlaying(true);
        } else if (activeEngineRef.current === 'native' && nativeAudioRef.current) {
          nativeAudioRef.current.currentTime = 0;
          nativeAudioRef.current.play().catch(() => {});
        } else if (playerRef.current && isPlayerReadyRef.current) {
          playerRef.current.seekTo(0, true);
          playerRef.current.playVideo();
        }
      } else {
        nextTrack();
      }
    };
  }, [repeatMode, nextTrack]);

  const triedFallbackIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let initPollTimer: ReturnType<typeof setInterval> | null = null;

    const createPlayer = () => {
      if (!window.YT || !window.YT.Player || playerRef.current) return;
      const mountEl = document.getElementById('cadence-yt-player');
      if (!mountEl) return;

      if (initPollTimer) {
        clearInterval(initPollTimer);
        initPollTimer = null;
      }

      playerRef.current = new window.YT.Player('cadence-yt-player', {
        height: '200',
        width: '200',
        videoId: currentTrackRef.current.id,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            isPlayerReadyRef.current = true;
            const iframeEl = document.getElementById('cadence-yt-player');
            if (iframeEl && iframeEl.tagName === 'IFRAME') {
              iframeEl.setAttribute(
                'allow',
                'autoplay; encrypted-media; picture-in-picture; fullscreen'
              );
            }
            event.target.setVolume(volumeRef.current);
            if (activeEngineRef.current === 'youtube') {
              const dur = event.target.getDuration();
              if (dur && dur > 0) {
                setDuration(Math.round(dur));
              }
              if (autoPlayOnLoadRef.current || intendedPlayingRef.current) {
                event.target.loadVideoById(currentTrackRef.current.id, 0);
                event.target.playVideo();
              }
            }
          },
          onStateChange: (event) => {
            // Ignore YouTube state changes when native HTML5 <audio> is the active engine
            if (activeEngineRef.current === 'native') return;

            const YTState = window.YT?.PlayerState;
            if (!YTState) return;

            if (event.data === YTState.PLAYING) {
              intendedPlayingRef.current = true;
              setIsPlaying(true);
              setIsBuffering(false);
              const dur = event.target.getDuration();
              if (dur && dur > 0) {
                setDuration(Math.round(dur));
              }
            } else if (event.data === YTState.PAUSED) {
              if (intendedPlayingRef.current) {
                try {
                  event.target.playVideo();
                  return;
                } catch {
                  // ignore
                }
              }
              setIsPlaying(false);
              setIsBuffering(false);
            } else if (event.data === YTState.BUFFERING) {
              setIsBuffering(true);
            } else if (event.data === YTState.ENDED) {
              handleTrackEndRef.current();
            }
          },
          onError: async () => {
            if (activeEngineRef.current === 'native') return;

            const failedTrack = currentTrackRef.current;
            triedFallbackIdsRef.current.add(failedTrack.id);

            try {
              const fallbackQuery = `${failedTrack.title} ${failedTrack.artist} lyrics`;
              const res = await fetch(`/api/music/search?q=${encodeURIComponent(fallbackQuery)}`);
              if (res.ok) {
                const data = await res.json();
                const candidates: Track[] = Array.isArray(data.tracks) ? data.tracks : [];
                const alt = candidates.find(
                  (c) => c.id && !triedFallbackIdsRef.current.has(c.id)
                );
                if (alt && playerRef.current && isPlayerReadyRef.current) {
                  triedFallbackIdsRef.current.add(alt.id);
                  playerRef.current.loadVideoById(alt.id, 0);
                  playerRef.current.playVideo();
                  return;
                }
              }
            } catch {
              // ignore fallback fetch error
            }
            setIsBuffering(false);
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const existingScript = document.getElementById('youtube-iframe-js');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-js';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        createPlayer();
      };
      initPollTimer = setInterval(() => {
        if (window.YT && window.YT.Player) {
          createPlayer();
        }
      }, 200);
    }

    return () => {
      if (initPollTimer) clearInterval(initPollTimer);
    };
  }, []);

  // Ensure playback continues uninterrupted across visibility changes / app minimize
  useEffect(() => {
    const handleVisibilityChange = () => {
      lastVisibilityTimestampRef.current = Date.now();
      if (isRunningInNativeApk()) {
        if (typeof document !== 'undefined' && !document.hidden) {
          nativePlayerGetStatus().then((status) => {
            if (!status) return;
            if (status.trackId && status.trackId === currentTrackRef.current.id) {
              setIsBuffering(Boolean(status.buffering));
              const posSec = Math.max(0, status.pos / 1000);
              setCurrentTime(posSec);
              currentTimeRef.current = posSec;
              if (status.dur > 0) {
                const durSec = Math.round(status.dur / 1000);
                if (durSec > 0 && durSec !== durationRef.current) {
                  setDuration(durSec);
                  durationRef.current = durSec;
                }
              }
            }
          });
        }
        return;
      }

      if (!intendedPlayingRef.current) return;

      if (activeEngineRef.current === 'native' && nativeAudioRef.current) {
        if (nativeAudioRef.current.paused) {
          nativeAudioRef.current.play().catch(() => {});
        }
      } else if (
        activeEngineRef.current === 'youtube' &&
        playerRef.current &&
        isPlayerReadyRef.current
      ) {
        try {
          playerRef.current.playVideo();
        } catch {
          // ignore
        }
      }

      // If app becomes visible again, immediately sync currentTime so UI progress and lyrics snap to position
      if (typeof document !== 'undefined' && !document.hidden && activeEngineRef.current === 'native' && nativeAudioRef.current) {
        const t = nativeAudioRef.current.currentTime;
        if (typeof t === 'number' && !isNaN(t)) {
          setCurrentTime(t);
          currentTimeRef.current = t;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleVisibilityChange);
    };
  }, []);

  // High-frequency lyric synchronization & playback progress polling
  // When visible: polls at 75ms (Web) or 180ms (Native APK) for silky-smooth lyric line highlighting & progress bar
  // When hidden (multitasking in other apps): completely pauses polling to prevent
  // mobile OS timer clustering, main thread contention, and audio buffer underruns.
  useEffect(() => {
    if (!isPlaying) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const isApk = isRunningInNativeApk();

    const startPolling = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (timer) clearInterval(timer);

      timer = setInterval(
        () => {
          if (typeof document !== 'undefined' && document.hidden) return;

          if (isApk) {
            nativePlayerGetStatus().then((status) => {
              if (!status) return;
              if (status.trackId && status.trackId === currentTrackRef.current.id) {
                setIsBuffering(Boolean(status.buffering));
                if (status.pos >= 0) {
                  const posSec = status.pos / 1000;
                  setCurrentTime(posSec);
                  currentTimeRef.current = posSec;
                }
                if (status.dur > 0) {
                  const durSec = Math.round(status.dur / 1000);
                  if (durSec > 0 && durSec !== durationRef.current) {
                    setDuration(durSec);
                    durationRef.current = durSec;
                  }
                }
              }
            });
            return;
          }

          if (activeEngineRef.current === 'native' && nativeAudioRef.current) {
            const audio = nativeAudioRef.current;
            if (audio.src && audio.src !== silentWavUrlRef.current) {
              const t = audio.currentTime;
              if (typeof t === 'number' && !isNaN(t)) {
                setCurrentTime(t);
                currentTimeRef.current = t;
              }
              const d = audio.duration;
              if (typeof d === 'number' && d > 0 && !isNaN(d) && isFinite(d)) {
                const roundedD = Math.round(d);
                if (roundedD !== durationRef.current) {
                  setDuration(roundedD);
                  durationRef.current = roundedD;
                }
              }
            }
          } else if (
            activeEngineRef.current === 'youtube' &&
            playerRef.current &&
            isPlayerReadyRef.current
          ) {
            try {
              const state = playerRef.current.getPlayerState();
              if (intendedPlayingRef.current && state === 2) {
                playerRef.current.playVideo();
              } else if (state === 0) {
                handleTrackEndRef.current();
                return;
              }
              const t = playerRef.current.getCurrentTime();
              if (typeof t === 'number' && !isNaN(t)) {
                setCurrentTime(t);
                currentTimeRef.current = t;
              }
              const d = playerRef.current.getDuration();
              if (typeof d === 'number' && d > 0 && !isNaN(d)) {
                const roundedD = Math.round(d);
                if (roundedD !== durationRef.current) {
                  setDuration(roundedD);
                  durationRef.current = roundedD;
                }
              }
            } catch {
              // ignore
            }
          }
        },
        isApk ? 180 : 75
      );
    };

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      } else {
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isPlaying]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      intendedPlayingRef.current = false;
      setIsPlaying(false);
      setIsBuffering(false);
      if (isRunningInNativeApk()) {
        nativePlayerSetPlaying(false);
        return;
      }
      nativeAudioRef.current?.pause();
      if (isPlayerReadyRef.current && playerRef.current) {
        try {
          playerRef.current.pauseVideo();
        } catch {
          // ignore
        }
      }
    } else {
      requestPwaNotificationPermission();
      intendedPlayingRef.current = true;
      setIsPlaying(true);

      if (isRunningInNativeApk()) {
        if (nativeTrackLoadedRef.current === currentTrackRef.current.id) {
          nativePlayerSetPlaying(true);
        } else {
          startTrackPlayback(currentTrackRef.current);
        }
        return;
      }

      const audioEl = nativeAudioRef.current;
      if (
        activeEngineRef.current === 'native' &&
        audioEl &&
        audioEl.src &&
        audioEl.src !== silentWavUrlRef.current
      ) {
        audioEl.volume = isMutedRef.current ? 0 : volumeRef.current / 100;
        audioEl.play().catch(() => {
          startTrackPlayback(currentTrackRef.current);
        });
      } else {
        startTrackPlayback(currentTrackRef.current);
      }
    }
  }, [isPlaying, requestPwaNotificationPermission, startTrackPlayback]);

  const seekTo = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, Math.min(durationRef.current || 300, seconds));
      setCurrentTime(clamped);
      currentTimeRef.current = clamped;

      if (isRunningInNativeApk()) {
        nativePlayerSeekTo(clamped);
        if (!isPlaying) {
          intendedPlayingRef.current = true;
          setIsPlaying(true);
          if (nativeTrackLoadedRef.current === currentTrackRef.current.id) {
            nativePlayerSetPlaying(true);
          } else {
            startTrackPlayback(currentTrackRef.current);
          }
        }
        return;
      }

      if (
        activeEngineRef.current === 'native' &&
        nativeAudioRef.current &&
        nativeAudioRef.current.src &&
        nativeAudioRef.current.src !== silentWavUrlRef.current
      ) {
        nativeAudioRef.current.currentTime = clamped;
        if (!isPlaying) {
          intendedPlayingRef.current = true;
          setIsPlaying(true);
          nativeAudioRef.current.play().catch(() => {});
        }
        if (showVideoInMaximized && isPlayerReadyRef.current && playerRef.current) {
          try {
            playerRef.current.seekTo(clamped, true);
          } catch {
            // ignore
          }
        }
      } else if (isPlayerReadyRef.current && playerRef.current) {
        playerRef.current.seekTo(clamped, true);
        if (!isPlaying) {
          intendedPlayingRef.current = true;
          playerRef.current.playVideo();
          setIsPlaying(true);
        }
      }
    },
    [isPlaying, showVideoInMaximized, startTrackPlayback]
  );

  // Configure & re-bind OS Notification Bar & Lock-Screen MediaSession Controls
  const syncMediaSessionState = useCallback(
    (track: Track, playing: boolean, pos?: number, dur?: number) => {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const thumbUrl = track.thumbnailUrl
        ? track.thumbnailUrl.startsWith('http')
          ? track.thumbnailUrl
          : `${origin}${track.thumbnailUrl}`
        : `${origin}/pwa-512x512.png`;

      // Synchronize with Native Android APK Notification Bar Mini Player (MediaSession + MediaStyle)
      const safeDurSec = Math.max(1, dur ?? durationRef.current ?? track.duration ?? 210);
      const safePosSec = Math.max(0, Math.min(safeDurSec, pos ?? currentTimeRef.current ?? 0));
      syncNativeNotificationInApk(
        track.title || 'Cadence Music',
        track.artist || 'Unknown Artist',
        track.album || 'Cadence',
        thumbUrl,
        playing,
        Math.round(safePosSec * 1000),
        Math.round(safeDurSec * 1000)
      );

      if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

      const ms = navigator.mediaSession;

      try {
        ms.metadata = new MediaMetadata({
          title: track.title || 'Unknown Title',
          artist: track.artist || 'Unknown Artist',
          album: track.album || 'Cadence',
          artwork: [
            { src: thumbUrl, sizes: '96x96', type: 'image/jpeg' },
            { src: thumbUrl, sizes: '128x128', type: 'image/jpeg' },
            { src: thumbUrl, sizes: '192x192', type: 'image/jpeg' },
            { src: thumbUrl, sizes: '256x256', type: 'image/jpeg' },
            { src: thumbUrl, sizes: '384x384', type: 'image/jpeg' },
            { src: thumbUrl, sizes: '512x512', type: 'image/jpeg' },
            { src: `${origin}/pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
            { src: `${origin}/pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
          ],
        });
      } catch {
        // ignore metadata construction error
      }

      try {
        ms.playbackState = playing ? 'playing' : 'paused';
      } catch {
        // ignore
      }

      const actionHandlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
        [
          'play',
          () => {
            intendedPlayingRef.current = true;
            setIsPlaying(true);
            if (
              activeEngineRef.current === 'native' &&
              nativeAudioRef.current &&
              nativeAudioRef.current.src &&
              nativeAudioRef.current.src !== silentWavUrlRef.current
            ) {
              nativeAudioRef.current.play().catch(() => {});
            } else if (isPlayerReadyRef.current && playerRef.current) {
              playerRef.current.playVideo();
            } else {
              startTrackPlayback(currentTrackRef.current);
            }
          },
        ],
        [
          'pause',
          () => {
            intendedPlayingRef.current = false;
            setIsPlaying(false);
            nativeAudioRef.current?.pause();
            if (isPlayerReadyRef.current && playerRef.current) {
              playerRef.current.pauseVideo();
            }
          },
        ],
        [
          'previoustrack',
          () => {
            prevTrack();
          },
        ],
        [
          'nexttrack',
          () => {
            nextTrack();
          },
        ],
        [
          'seekto',
          (details) => {
            if (typeof details.seekTime === 'number') {
              seekTo(details.seekTime);
            }
          },
        ],
        [
          'seekbackward',
          (details) => {
            const offset = details.seekOffset || 10;
            seekTo(Math.max(0, currentTimeRef.current - offset));
          },
        ],
        [
          'seekforward',
          (details) => {
            const offset = details.seekOffset || 10;
            seekTo(Math.min(durationRef.current || 300, currentTimeRef.current + offset));
          },
        ],
      ];

      for (const [action, handler] of actionHandlers) {
        try {
          ms.setActionHandler(action, handler);
        } catch {
          // ignore unsupported action handler
        }
      }

      if (ms.setPositionState) {
        try {
          const safeDuration = Math.max(
            1,
            dur ?? durationRef.current ?? track.duration ?? 210
          );
          const safePosition = Math.max(
            0,
            Math.min(safeDuration, pos ?? currentTimeRef.current ?? 0)
          );
          ms.setPositionState({
            duration: safeDuration,
            playbackRate: 1,
            position: safePosition,
          });
        } catch {
          // ignore position state errors
        }
      }
    },
    [nextTrack, prevTrack, seekTo, startTrackPlayback]
  );

  useEffect(() => {
    syncMediaSessionState(currentTrack, isPlaying, currentTime, duration);
  }, [currentTrack, isPlaying, notificationPermission, syncMediaSessionState]);

  // Listen for transport actions from the Native Android Notification Bar Mini Player & Native MediaPlayer
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__cadenceNativeMediaAction = (action: string, seekMs?: number) => {
      if (action === 'play') {
        intendedPlayingRef.current = true;
        setIsPlaying(true);
        if (isRunningInNativeApk()) {
          if (nativeTrackLoadedRef.current !== currentTrackRef.current.id) {
            startTrackPlayback(currentTrackRef.current);
          }
        } else if (!isPlaying) {
          togglePlayPause();
        }
      } else if (action === 'pause') {
        intendedPlayingRef.current = false;
        setIsPlaying(false);
        setIsBuffering(false);
        if (!isRunningInNativeApk() && isPlaying) {
          togglePlayPause();
        }
      } else if (action === 'toggle') {
        togglePlayPause();
      } else if (action === 'next') {
        nextTrack();
      } else if (action === 'prev') {
        prevTrack();
      } else if (action === 'seek' && typeof seekMs === 'number') {
        seekTo(seekMs / 1000);
      } else if (action === 'ended') {
        handleTrackEndRef.current();
      }
    };
    return () => {
      delete window.__cadenceNativeMediaAction;
    };
  }, [isPlaying, togglePlayPause, nextTrack, prevTrack, seekTo, startTrackPlayback]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (!navigator.mediaSession.setPositionState) return;

    try {
      const safeDuration = Math.max(1, duration || currentTrack.duration || 210);
      const safePosition = Math.max(0, Math.min(safeDuration, currentTime));
      navigator.mediaSession.setPositionState({
        duration: safeDuration,
        playbackRate: 1,
        position: safePosition,
      });
    } catch {
      // ignore position state errors
    }
  }, [Math.floor(currentTime), duration, currentTrack.duration]);

  const setVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(100, vol));
    setVolumeState(clamped);
    volumeRef.current = clamped;
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
      isMutedRef.current = false;
      playerRef.current?.unMute();
    }
    if (isRunningInNativeApk()) {
      nativePlayerSetVolume(clamped);
    }
    if (nativeAudioRef.current) {
      nativeAudioRef.current.volume = clamped / 100;
    }
    if (isPlayerReadyRef.current && playerRef.current) {
      playerRef.current.setVolume(clamped);
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;
    if (isRunningInNativeApk()) {
      nativePlayerSetVolume(nextMuted ? 0 : volumeRef.current || 70);
    }
    if (nativeAudioRef.current) {
      nativeAudioRef.current.volume = nextMuted ? 0 : (volumeRef.current || 70) / 100;
    }
    if (isPlayerReadyRef.current && playerRef.current) {
      if (nextMuted) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
        playerRef.current.setVolume(volumeRef.current || 70);
      }
    }
  };

  const toggleShuffle = useCallback(() => {
    setShuffle((prevShuffle) => {
      const nextShuffle = !prevShuffle;
      shuffleRef.current = nextShuffle;
      const current = currentTrackRef.current;
      let baseContext = originalQueueRef.current.length > 0 ? originalQueueRef.current : [current];

      if (!baseContext.some((t) => t.id === current.id)) {
        baseContext = [current, ...baseContext];
        setOriginalQueue(baseContext);
        originalQueueRef.current = baseContext;
      }

      if (nextShuffle) {
        const others = baseContext.filter((t) => t.id !== current.id);
        const shuffledList = [current, ...shuffleArray(others)];
        setQueue(shuffledList);
        queueRef.current = shuffledList;
      } else {
        setQueue(baseContext);
        queueRef.current = baseContext;
      }

      return nextShuffle;
    });
  }, []);

  const cycleRepeatMode = () => {
    setRepeatMode((prev) => {
      if (prev === RepeatMode.OFF) return RepeatMode.ALL;
      if (prev === RepeatMode.ALL) return RepeatMode.ONE;
      return RepeatMode.OFF;
    });
  };

  const addToQueue = (track: Track) => {
    setQueue((prev) => {
      const updated = prev.some((t) => t.id === track.id) ? prev : [...prev, track];
      queueRef.current = updated;
      return updated;
    });
    setOriginalQueue((prev) => {
      const updated = prev.some((t) => t.id === track.id) ? prev : [...prev, track];
      originalQueueRef.current = updated;
      return updated;
    });
  };

  const removeFromQueue = (trackId: string) => {
    setQueue((prev) => {
      const updated = prev.filter((t) => t.id !== trackId);
      queueRef.current = updated;
      return updated;
    });
    setOriginalQueue((prev) => {
      const updated = prev.filter((t) => t.id !== trackId);
      originalQueueRef.current = updated;
      return updated;
    });
  };

  // Sleep Timer countdown interval
  useEffect(() => {
    if (sleepTimerRemaining === null) return;

    const interval = setInterval(() => {
      if (sleepTimerModeRef.current === 'end_of_track') {
        const left = Math.max(0, Math.round((duration || 200) - currentTime));
        setSleepTimerRemaining(left);
        sleepTimerRemainingRef.current = left;
        if (left <= 0) {
          intendedPlayingRef.current = false;
          if (isRunningInNativeApk()) {
            nativePlayerSetPlaying(false);
          }
          nativeAudioRef.current?.pause();
          if (playerRef.current && isPlayerReadyRef.current) {
            playerRef.current.pauseVideo();
          }
          setIsPlaying(false);
          setSleepTimerRemaining(null);
          setSleepTimerTotal(null);
          setSleepTimerMode(null);
          sleepTimerRemainingRef.current = null;
          sleepTimerModeRef.current = null;
        }
        return;
      }

      setSleepTimerRemaining((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          intendedPlayingRef.current = false;
          if (isRunningInNativeApk()) {
            nativePlayerSetPlaying(false);
          }
          nativeAudioRef.current?.pause();
          if (playerRef.current && isPlayerReadyRef.current) {
            playerRef.current.pauseVideo();
          }
          setIsPlaying(false);
          setSleepTimerMode(null);
          setSleepTimerTotal(null);
          sleepTimerRemainingRef.current = null;
          sleepTimerModeRef.current = null;
          return null;
        }
        const updated = prev - 1;
        sleepTimerRemainingRef.current = updated;
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepTimerRemaining, duration, currentTime]);

  const setSleepTimer = useCallback((option: number | 'end_of_track') => {
    if (option === 'end_of_track') {
      const remainingSecs = Math.max(1, Math.round((duration || 200) - currentTime));
      setSleepTimerMode('end_of_track');
      sleepTimerModeRef.current = 'end_of_track';
      setSleepTimerRemaining(remainingSecs);
      sleepTimerRemainingRef.current = remainingSecs;
      setSleepTimerTotal(remainingSecs);
    } else {
      const secs = Math.max(1, Math.round(option * 60));
      setSleepTimerMode('duration');
      sleepTimerModeRef.current = 'duration';
      setSleepTimerRemaining(secs);
      sleepTimerRemainingRef.current = secs;
      setSleepTimerTotal(secs);
    }
  }, [duration, currentTime]);

  const cancelSleepTimer = useCallback(() => {
    setSleepTimerRemaining(null);
    setSleepTimerTotal(null);
    setSleepTimerMode(null);
    sleepTimerRemainingRef.current = null;
    sleepTimerModeRef.current = null;
  }, []);

  const extendSleepTimer = useCallback((minutes: number) => {
    const addSecs = Math.round(minutes * 60);
    setSleepTimerMode('duration');
    sleepTimerModeRef.current = 'duration';
    setSleepTimerRemaining((prev) => {
      const updated = (prev ?? 0) + addSecs;
      sleepTimerRemainingRef.current = updated;
      return updated;
    });
    setSleepTimerTotal((prev) => (prev ?? 0) + addSecs);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        queue,
        originalQueue,
        isPlaying,
        isBuffering,
        currentTime,
        duration,
        volume,
        isMuted,
        shuffle,
        repeatMode,
        isMaximized,
        showVideoInMaximized,
        isQueueOpen,
        lyrics,
        lyricsSource,
        isLoadingLyrics,
        activeLyricIndex,
        playTrack,
        shufflePlay,
        togglePlayPause,
        nextTrack,
        prevTrack,
        seekTo,
        setVolume,
        toggleMute,
        toggleShuffle,
        cycleRepeatMode,
        setIsMaximized,
        setShowVideoInMaximized,
        setIsQueueOpen,
        addToQueue,
        removeFromQueue,
        sleepTimerRemaining,
        sleepTimerTotal,
        sleepTimerMode,
        isSleepTimerOpen,
        setIsSleepTimerOpen,
        setSleepTimer,
        cancelSleepTimer,
        extendSleepTimer,
      }}
    >
      {children}
      {/* Installed PWA Notification Permission Prompt (Android 13+ blocks WebAPK MediaSession until granted) */}
      {isPlaying &&
        !isRunningInNativeApk() &&
        !dismissedNotifBanner &&
        notificationPermission !== 'granted' &&
        typeof window !== 'undefined' &&
        'Notification' in window && (
          <div className="fixed bottom-[148px] md:bottom-[96px] left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md px-3.5 py-2.5 rounded-xl bg-[#16161B]/95 border border-[#E25822]/40 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#F5F5F7] truncate">
                Show Player in Notification Bar
              </p>
              <p className="text-[11px] text-[#A0A0AB] leading-tight mt-0.5">
                {notificationPermission === 'denied'
                  ? 'Enable Notifications in App Info → Notifications for Cadence'
                  : 'Allow notifications so controls appear when minimized'}
              </p>
            </div>
            {notificationPermission === 'default' && (
              <button
                type="button"
                onClick={async () => {
                  await requestPwaNotificationPermission();
                  syncMediaSessionState(
                    currentTrackRef.current,
                    true,
                    currentTimeRef.current,
                    durationRef.current
                  );
                }}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-[#E25822] hover:bg-[#f0642d] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Allow
              </button>
            )}
            <button
              type="button"
              onClick={() => setDismissedNotifBanner(true)}
              className="shrink-0 text-[#A0A0AB] hover:text-white text-xs px-1.5 py-1 cursor-pointer"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
      {/* Secondary Pre-Buffer Audio Engine for 0ms Next-Track Transitions */}
      <audio
        ref={preloadNextAudioRef}
        preload="auto"
        muted
        playsInline
        className="hidden"
        aria-hidden="true"
      />
      {/* Primary Native HTML5 Audio Engine (rendered off-screen with controls so Android/iOS OS Notification Bar binds MediaSession) */}
      <audio
        ref={nativeAudioRef}
        preload="auto"
        playsInline
        controls
        title={`${currentTrack.title} — ${currentTrack.artist}`}
        className="fixed -bottom-24 left-0 w-1 h-1 opacity-[0.001] pointer-events-none -z-50"
        onCanPlay={(e) => {
          if (
            activeEngineRef.current === 'native' &&
            e.currentTarget.src !== silentWavUrlRef.current
          ) {
            setIsBuffering(false);
          }
        }}
        onCanPlayThrough={(e) => {
          if (
            activeEngineRef.current === 'native' &&
            e.currentTarget.src !== silentWavUrlRef.current
          ) {
            setIsBuffering(false);
          }
        }}
        onLoadedData={(e) => {
          if (
            activeEngineRef.current === 'native' &&
            e.currentTarget.src !== silentWavUrlRef.current
          ) {
            setIsBuffering(false);
          }
        }}
        onPlaying={(e) => {
          if (
            activeEngineRef.current === 'native' &&
            e.currentTarget.src !== silentWavUrlRef.current
          ) {
            setIsPlaying(true);
            setIsBuffering(false);
            const d = e.currentTarget.duration;
            const validDur =
              typeof d === 'number' && d > 0 && isFinite(d)
                ? Math.round(d)
                : durationRef.current;
            syncMediaSessionState(
              currentTrackRef.current,
              true,
              e.currentTarget.currentTime,
              validDur
            );
          }
        }}
        onPause={(e) => {
          if (
            activeEngineRef.current === 'native' &&
            e.currentTarget.src !== silentWavUrlRef.current &&
            !intendedPlayingRef.current
          ) {
            syncMediaSessionState(
              currentTrackRef.current,
              false,
              e.currentTarget.currentTime,
              durationRef.current
            );
          }
        }}
        onWaiting={() => {
          if (
            activeEngineRef.current === 'native' &&
            nativeAudioRef.current?.src !== silentWavUrlRef.current
          ) {
            setIsBuffering(true);
          }
        }}
        onTimeUpdate={(e) => {
          if (
            activeEngineRef.current === 'native' &&
            e.currentTarget.src !== silentWavUrlRef.current
          ) {
            if (!e.currentTarget.paused && e.currentTarget.currentTime > 0) {
              setIsBuffering(false);
            }
            setCurrentTime(e.currentTarget.currentTime);
            currentTimeRef.current = e.currentTarget.currentTime;
          }
        }}
        onLoadedMetadata={(e) => {
          if (
            activeEngineRef.current === 'native' &&
            e.currentTarget.src !== silentWavUrlRef.current
          ) {
            const d = e.currentTarget.duration;
            if (typeof d === 'number' && d > 0 && isFinite(d)) {
              const rounded = Math.round(d);
              setDuration(rounded);
              durationRef.current = rounded;
              syncMediaSessionState(
                currentTrackRef.current,
                intendedPlayingRef.current,
                e.currentTarget.currentTime,
                rounded
              );
            }
          }
        }}
        onEnded={() => {
          if (
            activeEngineRef.current === 'native' &&
            nativeAudioRef.current?.src !== silentWavUrlRef.current
          ) {
            handleTrackEndRef.current();
          }
        }}
        onError={() => {
          // If direct stream ever fails to load, seamlessly switch to YouTube IFrame engine
          if (
            activeEngineRef.current === 'native' &&
            nativeAudioRef.current?.src !== silentWavUrlRef.current
          ) {
            const track = currentTrackRef.current;
            resolvedStreamsRef.current.set(track.id, {
              streamUrl: null,
              duration: durationRef.current || track.duration || 210,
            });
            activeEngineRef.current = 'youtube';
            if (isPlayerReadyRef.current && playerRef.current) {
              if (!isMutedRef.current) {
                playerRef.current.unMute();
                playerRef.current.setVolume(volumeRef.current);
              }
              playerRef.current.loadVideoById(track.id, currentTimeRef.current);
              if (intendedPlayingRef.current) {
                playerRef.current.playVideo();
              }
            }
          }
        }}
      />
      {/* Fallback / Video-Mode YouTube IFrame Engine Mount Point */}
      <div
        className="fixed bottom-0 left-0 w-[200px] h-[200px] opacity-[0.001] pointer-events-none overflow-hidden -z-50"
        aria-hidden="true"
      >
        <div id="cadence-yt-player" />
      </div>
    </PlayerContext.Provider>
  );
};

export const usePlayer = (): PlayerContextValue => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
};
