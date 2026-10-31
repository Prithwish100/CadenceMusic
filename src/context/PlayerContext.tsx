import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CURATED_TRACKS, FEATURED_TRACK, PRESET_SYNCED_LYRICS } from '../data/curatedCatalog';
import { LyricLine, RepeatMode, Track } from '../types/music';

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
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<Track>(FEATURED_TRACK);
  const [queue, setQueue] = useState<Track[]>(CURATED_TRACKS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(FEATURED_TRACK.duration);
  const [volume, setVolumeState] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(RepeatMode.OFF);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showVideoInMaximized, setShowVideoInMaximized] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  const [lyrics, setLyrics] = useState<LyricLine[]>(
    PRESET_SYNCED_LYRICS[FEATURED_TRACK.id] || []
  );
  const [lyricsSource, setLyricsSource] = useState<string>('Synced');
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);

  const playerRef = useRef<YTPlayerInstance | null>(null);
  const isPlayerReadyRef = useRef(false);
  const autoPlayOnLoadRef = useRef(false);
  const handleTrackEndRef = useRef<() => void>(() => {});
  const fetchedForTrackDurationRef = useRef<string>('');

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

  // High-precision active lyric line matching (+0.25s visual lead so line highlights right on the beat)
  const activeLyricIndex = React.useMemo(() => {
    if (lyrics.length === 0) return -1;
    const syncTime = currentTime + 0.25;
    let activeIdx = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (syncTime >= lyrics[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }
    return activeIdx;
  }, [lyrics, currentTime]);

  const playTrack = useCallback((track: Track, newQueue?: Track[]) => {
    if (newQueue && newQueue.length > 0) {
      setQueue(newQueue);
    } else {
      setQueue((prev) => (prev.some((t) => t.id === track.id) ? prev : [track, ...prev]));
    }

    fetchedForTrackDurationRef.current = '';
    setCurrentTrack(track);
    setCurrentTime(0);
    setDuration(track.duration || 210);
    if (PRESET_SYNCED_LYRICS[track.id]) {
      setLyrics(PRESET_SYNCED_LYRICS[track.id]);
    } else {
      setLyrics([]);
    }
    autoPlayOnLoadRef.current = true;
    setIsPlaying(true);

    if (isPlayerReadyRef.current && playerRef.current) {
      playerRef.current.loadVideoById(track.id, 0);
      playerRef.current.playVideo();
    }
  }, []);

  const nextTrack = useCallback(() => {
    if (queue.length === 0) return;

    const currentIdx = queue.findIndex((t) => t.id === currentTrack.id);
    let nextIdx = 0;

    if (shuffle && queue.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * queue.length);
      } while (nextIdx === currentIdx);
    } else {
      nextIdx = currentIdx + 1;
      if (nextIdx >= queue.length) {
        if (repeatMode === RepeatMode.OFF) {
          setIsPlaying(false);
          return;
        }
        nextIdx = 0;
      }
    }

    const next = queue[nextIdx];
    if (next) {
      playTrack(next);
    }
  }, [queue, currentTrack.id, shuffle, repeatMode, playTrack]);

  const prevTrack = useCallback(() => {
    if (currentTime > 4 && playerRef.current && isPlayerReadyRef.current) {
      playerRef.current.seekTo(0, true);
      setCurrentTime(0);
      return;
    }

    if (queue.length === 0) return;
    const currentIdx = queue.findIndex((t) => t.id === currentTrack.id);
    const prevIdx = currentIdx > 0 ? currentIdx - 1 : queue.length - 1;
    const prev = queue[prevIdx];
    if (prev) {
      playTrack(prev);
    }
  }, [currentTime, queue, currentTrack.id, playTrack]);

  useEffect(() => {
    handleTrackEndRef.current = () => {
      if (repeatMode === RepeatMode.ONE && playerRef.current) {
        playerRef.current.seekTo(0, true);
        playerRef.current.playVideo();
        setCurrentTime(0);
      } else {
        nextTrack();
      }
    };
  }, [repeatMode, nextTrack]);

  useEffect(() => {
    const createPlayer = () => {
      if (!window.YT || !window.YT.Player || playerRef.current) return;

      playerRef.current = new window.YT.Player('cadence-yt-player', {
        height: '100%',
        width: '100%',
        videoId: FEATURED_TRACK.id,
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
            event.target.setVolume(volume);
            const dur = event.target.getDuration();
            if (dur && dur > 0) {
              setDuration(Math.round(dur));
            }
            if (autoPlayOnLoadRef.current) {
              event.target.playVideo();
            }
          },
          onStateChange: (event) => {
            const YTState = window.YT?.PlayerState;
            if (!YTState) return;

            if (event.data === YTState.PLAYING) {
              setIsPlaying(true);
              setIsBuffering(false);
              const dur = event.target.getDuration();
              if (dur && dur > 0) {
                setDuration(Math.round(dur));
              }
            } else if (event.data === YTState.PAUSED) {
              setIsPlaying(false);
              setIsBuffering(false);
            } else if (event.data === YTState.BUFFERING) {
              setIsBuffering(true);
            } else if (event.data === YTState.ENDED) {
              handleTrackEndRef.current();
            }
          },
          onError: () => {
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
      window.onYouTubeIframeAPIReady = () => {
        createPlayer();
      };
    }
  }, []);

  // Poll playback current time every 100ms while playing for tight lyric synchronization
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (playerRef.current && isPlayerReadyRef.current) {
        try {
          const t = playerRef.current.getCurrentTime();
          if (typeof t === 'number' && !isNaN(t)) {
            setCurrentTime(t);
          }
          const d = playerRef.current.getDuration();
          if (typeof d === 'number' && d > 0 && !isNaN(d)) {
            setDuration(Math.round(d));
          }
        } catch {
          // ignore transient iframe errors
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const togglePlayPause = () => {
    if (!isPlayerReadyRef.current || !playerRef.current) {
      autoPlayOnLoadRef.current = !isPlaying;
      setIsPlaying(!isPlaying);
      return;
    }

    if (isPlaying) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      playerRef.current.playVideo();
      setIsPlaying(true);
    }
  };

  const seekTo = (seconds: number) => {
    const clamped = Math.max(0, Math.min(duration || 300, seconds));
    setCurrentTime(clamped);
    if (isPlayerReadyRef.current && playerRef.current) {
      playerRef.current.seekTo(clamped, true);
      if (!isPlaying) {
        playerRef.current.playVideo();
        setIsPlaying(true);
      }
    }
  };

  const setVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(100, vol));
    setVolumeState(clamped);
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
      playerRef.current?.unMute();
    }
    if (isPlayerReadyRef.current && playerRef.current) {
      playerRef.current.setVolume(clamped);
    }
  };

  const toggleMute = () => {
    if (!isPlayerReadyRef.current || !playerRef.current) {
      setIsMuted(!isMuted);
      return;
    }
    if (isMuted) {
      playerRef.current.unMute();
      playerRef.current.setVolume(volume || 70);
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  const toggleShuffle = () => setShuffle((prev) => !prev);

  const cycleRepeatMode = () => {
    setRepeatMode((prev) => {
      if (prev === RepeatMode.OFF) return RepeatMode.ALL;
      if (prev === RepeatMode.ALL) return RepeatMode.ONE;
      return RepeatMode.OFF;
    });
  };

  const addToQueue = (track: Track) => {
    setQueue((prev) => (prev.some((t) => t.id === track.id) ? prev : [...prev, track]));
  };

  const removeFromQueue = (trackId: string) => {
    setQueue((prev) => prev.filter((t) => t.id !== trackId));
  };

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        queue,
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
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = (): PlayerContextValue => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
};
