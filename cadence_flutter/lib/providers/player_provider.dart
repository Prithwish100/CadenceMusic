import 'dart:async';
import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/curated_catalog.dart';
import '../models/lyric_line.dart';
import '../models/track.dart';
import '../services/lyrics_service.dart';
import '../services/playback/playback_source.dart';

class PlayerState {
  final Track currentTrack;
  final List<Track> queue;
  final List<Track> originalQueue;
  final bool isPlaying;
  final bool isBuffering;
  final double currentTime;
  final int duration;
  final double volume;
  final bool isMuted;
  final bool shuffle;
  final RepeatMode repeatMode;
  final PlaybackEngineMode activeEngine;
  final List<LyricLine> lyrics;
  final bool isLoadingLyrics;
  final int? sleepTimerRemainingSeconds;
  final int? sleepTimerTotalSeconds;
  final String? sleepTimerMode; // 'duration' | 'end_of_track'

  const PlayerState({
    required this.currentTrack,
    required this.queue,
    required this.originalQueue,
    this.isPlaying = false,
    this.isBuffering = false,
    this.currentTime = 0.0,
    required this.duration,
    this.volume = 0.8,
    this.isMuted = false,
    this.shuffle = false,
    this.repeatMode = RepeatMode.off,
    this.activeEngine = PlaybackEngineMode.directAudioStream,
    this.lyrics = const [],
    this.isLoadingLyrics = false,
    this.sleepTimerRemainingSeconds,
    this.sleepTimerTotalSeconds,
    this.sleepTimerMode,
  });

  /// High-precision active lyric line index with 0.15s visual reaction lead
  /// (exact match with `activeLyricIndex` in `src/context/PlayerContext.tsx`).
  int get activeLyricIndex {
    if (lyrics.isEmpty) return -1;
    final syncTime = currentTime + 0.15;
    if (syncTime < lyrics.first.time) return -1;

    int activeIdx = -1;
    for (int i = 0; i < lyrics.length; i++) {
      if (syncTime >= lyrics[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }
    return activeIdx;
  }

  PlayerState copyWith({
    Track? currentTrack,
    List<Track>? queue,
    List<Track>? originalQueue,
    bool? isPlaying,
    bool? isBuffering,
    double? currentTime,
    int? duration,
    double? volume,
    bool? isMuted,
    bool? shuffle,
    RepeatMode? repeatMode,
    PlaybackEngineMode? activeEngine,
    List<LyricLine>? lyrics,
    bool? isLoadingLyrics,
    int? sleepTimerRemainingSeconds,
    int? sleepTimerTotalSeconds,
    String? sleepTimerMode,
    bool clearSleepTimer = false,
  }) {
    return PlayerState(
      currentTrack: currentTrack ?? this.currentTrack,
      queue: queue ?? this.queue,
      originalQueue: originalQueue ?? this.originalQueue,
      isPlaying: isPlaying ?? this.isPlaying,
      isBuffering: isBuffering ?? this.isBuffering,
      currentTime: currentTime ?? this.currentTime,
      duration: duration ?? this.duration,
      volume: volume ?? this.volume,
      isMuted: isMuted ?? this.isMuted,
      shuffle: shuffle ?? this.shuffle,
      repeatMode: repeatMode ?? this.repeatMode,
      activeEngine: activeEngine ?? this.activeEngine,
      lyrics: lyrics ?? this.lyrics,
      isLoadingLyrics: isLoadingLyrics ?? this.isLoadingLyrics,
      sleepTimerRemainingSeconds: clearSleepTimer
          ? null
          : (sleepTimerRemainingSeconds ?? this.sleepTimerRemainingSeconds),
      sleepTimerTotalSeconds: clearSleepTimer
          ? null
          : (sleepTimerTotalSeconds ?? this.sleepTimerTotalSeconds),
      sleepTimerMode:
          clearSleepTimer ? null : (sleepTimerMode ?? this.sleepTimerMode),
    );
  }
}

class PlayerNotifier extends StateNotifier<PlayerState> {
  final PlaybackSource _playbackSource;
  final LyricsService _lyricsService;
  late final CadenceAudioHandler _audioHandler;

  Timer? _progressTimer;
  Timer? _sleepTimer;
  final void Function(Track track)? onTrackPlayed;

  PlayerNotifier({
    required PlaybackSource playbackSource,
    required LyricsService lyricsService,
    this.onTrackPlayed,
  })  : _playbackSource = playbackSource,
        _lyricsService = lyricsService,
        super(
          PlayerState(
            currentTrack: featuredTrack,
            queue: curatedTracks,
            originalQueue: curatedTracks,
            duration: featuredTrack.duration,
            lyrics: presetSyncedLyrics[featuredTrack.id] ?? const [],
          ),
        ) {
    _audioHandler = CadenceAudioHandler(
      onSkipNextCallback: nextTrack,
      onSkipPreviousCallback: prevTrack,
      onTrackCompletedCallback: _handleTrackEnded,
    );

    _audioHandler.player.positionStream.listen((pos) {
      if (state.activeEngine == PlaybackEngineMode.directAudioStream) {
        state = state.copyWith(currentTime: pos.inMilliseconds / 1000.0);
      }
    });

    _audioHandler.player.durationStream.listen((dur) {
      if (dur != null && dur.inSeconds > 0) {
        state = state.copyWith(duration: dur.inSeconds);
      }
    });
  }

  List<Track> _shuffleTracks(List<Track> items) {
    final copy = [...items];
    final rng = Random();
    for (int i = copy.length - 1; i > 0; i--) {
      final j = rng.nextInt(i + 1);
      final tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  Future<void> playTrack(Track track, {List<Track>? newQueue}) async {
    var baseQueue = state.originalQueue;
    if (newQueue != null && newQueue.isNotEmpty) {
      baseQueue = newQueue;
    } else if (!baseQueue.any((t) => t.id == track.id)) {
      baseQueue = [track, ...baseQueue];
    }

    final effectiveQueue = state.shuffle
        ? [
            track,
            ..._shuffleTracks(
              baseQueue.where((t) => t.id != track.id).toList(),
            ),
          ]
        : baseQueue;

    state = state.copyWith(
      currentTrack: track,
      originalQueue: baseQueue,
      queue: effectiveQueue,
      currentTime: 0,
      duration: track.duration,
      isPlaying: true,
      isBuffering: true,
      lyrics: presetSyncedLyrics[track.id] ?? const [],
    );

    onTrackPlayed?.call(track);
    unawaited(_loadLyrics(track));

    final resolved = await _playbackSource.resolveStream(track);
    if (state.currentTrack.id != track.id) return;

    state = state.copyWith(
      duration: resolved.durationSeconds,
      activeEngine: resolved.engineMode,
      isBuffering: false,
    );

    if (resolved.streamUrl != null &&
        resolved.engineMode == PlaybackEngineMode.directAudioStream) {
      await _audioHandler.loadAndPlayTrack(
        track.copyWith(duration: resolved.durationSeconds),
        resolved.streamUrl!,
        volume: state.isMuted ? 0.0 : state.volume,
      );
    } else {
      // Fallback progress ticker when using embedded YouTube IFrame player
      _startFallbackProgressTicker();
    }
  }

  void _startFallbackProgressTicker() {
    _progressTimer?.cancel();
    _progressTimer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (!state.isPlaying) return;
      if (state.activeEngine == PlaybackEngineMode.youtubeEmbeddedIframe) {
        final nextTime = state.currentTime + 0.25;
        if (nextTime >= state.duration) {
          _handleTrackEnded();
        } else {
          state = state.copyWith(currentTime: nextTime);
        }
      }
    });
  }

  Future<void> _loadLyrics(Track track) async {
    state = state.copyWith(isLoadingLyrics: true);
    final lines = await _lyricsService.fetchLyricsForTrack(track);
    if (state.currentTrack.id == track.id) {
      state = state.copyWith(lyrics: lines, isLoadingLyrics: false);
    }
  }

  void shufflePlay(List<Track> tracks) {
    if (tracks.isEmpty) return;
    final shuffled = _shuffleTracks(tracks);
    state = state.copyWith(
      originalQueue: tracks,
      queue: shuffled,
      shuffle: true,
    );
    playTrack(shuffled.first, newQueue: tracks);
  }

  Future<void> togglePlayPause() async {
    final nextPlaying = !state.isPlaying;
    state = state.copyWith(isPlaying: nextPlaying);
    if (state.activeEngine == PlaybackEngineMode.directAudioStream) {
      if (nextPlaying) {
        await _audioHandler.play();
      } else {
        await _audioHandler.pause();
      }
    }
  }

  Future<void> seekTo(double seconds) async {
    final clamped = seconds.clamp(0.0, state.duration.toDouble());
    state = state.copyWith(currentTime: clamped);
    if (state.activeEngine == PlaybackEngineMode.directAudioStream) {
      await _audioHandler.seek(
        Duration(milliseconds: (clamped * 1000).round()),
      );
    }
  }

  Future<void> setVolume(double newVolume) async {
    final clamped = newVolume.clamp(0.0, 1.0);
    state = state.copyWith(volume: clamped, isMuted: clamped == 0.0);
    await _audioHandler.player.setVolume(clamped);
  }

  Future<void> toggleMute() async {
    final nextMute = !state.isMuted;
    state = state.copyWith(isMuted: nextMute);
    await _audioHandler.player.setVolume(nextMute ? 0.0 : state.volume);
  }

  void toggleShuffle() {
    final nextShuffle = !state.shuffle;
    if (nextShuffle) {
      final others = state.originalQueue
          .where((t) => t.id != state.currentTrack.id)
          .toList();
      state = state.copyWith(
        shuffle: true,
        queue: [state.currentTrack, ..._shuffleTracks(others)],
      );
    } else {
      state = state.copyWith(
        shuffle: false,
        queue: state.originalQueue,
      );
    }
  }

  void cycleRepeatMode() {
    final nextMode = switch (state.repeatMode) {
      RepeatMode.off => RepeatMode.all,
      RepeatMode.all => RepeatMode.one,
      RepeatMode.one => RepeatMode.off,
    };
    state = state.copyWith(repeatMode: nextMode);
  }

  void nextTrack() {
    if (state.queue.isEmpty) return;
    final idx = state.queue.indexWhere((t) => t.id == state.currentTrack.id);
    var nextIdx = idx + 1;
    if (nextIdx >= state.queue.length) {
      if (state.repeatMode == RepeatMode.off) {
        state = state.copyWith(isPlaying: false);
        _audioHandler.pause();
        return;
      }
      nextIdx = 0;
    }
    playTrack(state.queue[nextIdx]);
  }

  void prevTrack() {
    if (state.currentTime > 4.0) {
      seekTo(0);
      return;
    }
    if (state.queue.isEmpty) return;
    final idx = state.queue.indexWhere((t) => t.id == state.currentTrack.id);
    final prevIdx = idx > 0 ? idx - 1 : state.queue.length - 1;
    playTrack(state.queue[prevIdx]);
  }

  void addToQueue(Track track) {
    if (state.queue.any((t) => t.id == track.id)) return;
    state = state.copyWith(
      queue: [...state.queue, track],
      originalQueue: [...state.originalQueue, track],
    );
  }

  void removeFromQueue(String trackId) {
    if (trackId == state.currentTrack.id) return;
    state = state.copyWith(
      queue: state.queue.where((t) => t.id != trackId).toList(),
      originalQueue:
          state.originalQueue.where((t) => t.id != trackId).toList(),
    );
  }

  void _handleTrackEnded() {
    if (state.sleepTimerMode == 'end_of_track') {
      cancelSleepTimer();
      state = state.copyWith(isPlaying: false);
      _audioHandler.pause();
      return;
    }

    if (state.repeatMode == RepeatMode.one) {
      seekTo(0);
      _audioHandler.play();
    } else {
      nextTrack();
    }
  }

  void setSleepTimerMinutes(int minutes) {
    _sleepTimer?.cancel();
    final totalSecs = minutes * 60;
    state = state.copyWith(
      sleepTimerRemainingSeconds: totalSecs,
      sleepTimerTotalSeconds: totalSecs,
      sleepTimerMode: 'duration',
    );
    _sleepTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      final rem = (state.sleepTimerRemainingSeconds ?? 0) - 1;
      if (rem <= 0) {
        timer.cancel();
        state = state.copyWith(isPlaying: false, clearSleepTimer: true);
        _audioHandler.pause();
      } else {
        state = state.copyWith(sleepTimerRemainingSeconds: rem);
      }
    });
  }

  void setSleepTimerEndOfTrack() {
    _sleepTimer?.cancel();
    final rem = max(1, state.duration - state.currentTime.round());
    state = state.copyWith(
      sleepTimerRemainingSeconds: rem,
      sleepTimerTotalSeconds: rem,
      sleepTimerMode: 'end_of_track',
    );
  }

  void extendSleepTimer(int extraMinutes) {
    final currentRem = state.sleepTimerRemainingSeconds;
    if (currentRem == null) return;
    final added = extraMinutes * 60;
    state = state.copyWith(
      sleepTimerRemainingSeconds: currentRem + added,
      sleepTimerTotalSeconds: (state.sleepTimerTotalSeconds ?? currentRem) + added,
    );
  }

  void cancelSleepTimer() {
    _sleepTimer?.cancel();
    state = state.copyWith(clearSleepTimer: true);
  }

  @override
  void dispose() {
    _progressTimer?.cancel();
    _sleepTimer?.cancel();
    _audioHandler.player.dispose();
    super.dispose();
  }
}

final playbackSourceProvider = Provider<PlaybackSource>((ref) {
  return CadenceHybridPlaybackSource();
});

final lyricsServiceProvider = Provider<LyricsService>((ref) {
  return LyricsService();
});

final playerProvider = StateNotifierProvider<PlayerNotifier, PlayerState>((ref) {
  return PlayerNotifier(
    playbackSource: ref.watch(playbackSourceProvider),
    lyricsService: ref.watch(lyricsServiceProvider),
  );
});
