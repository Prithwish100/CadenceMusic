import 'dart:async';
import 'dart:convert';
import 'package:audio_service/audio_service.dart';
import 'package:audio_session/audio_session.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:just_audio/just_audio.dart';
import '../../config/test_config.dart';
import '../../models/track.dart';

/// Modular Playback Source abstraction so additional music backends (Spotify SDK,
/// Apple MusicKit, local FLAC/MP3 files, or custom CDN streams) can be plugged in
/// without rewriting the UI or player state machine.
enum PlaybackEngineMode {
  /// Primary background-capable engine: resolves AAC/M4A stream via YouTube
  /// Innertube `ANDROID_VR` `/youtubei/v1/player` or test API proxy and plays
  /// through native Android `MediaPlayer`/`ExoPlayer` (`just_audio` + `audio_service`)
  /// with lock-screen `MediaSession`, Bluetooth AVRCP, and headphone controls.
  directAudioStream,

  /// Official YouTube IFrame Player API embedded inside a WebView (`YT.Player`).
  /// Note: Official YouTube IFrame embeds are subject to YouTube's platform policy
  /// which pauses video embeds when the WebView is hidden/backgrounded unless
  /// paired with the foreground audio service.
  youtubeEmbeddedIframe,
}

class ResolvedAudioStream {
  final String? streamUrl;
  final int durationSeconds;
  final PlaybackEngineMode engineMode;

  const ResolvedAudioStream({
    required this.streamUrl,
    required this.durationSeconds,
    required this.engineMode,
  });
}

abstract class PlaybackSource {
  String get sourceId;
  Future<ResolvedAudioStream> resolveStream(Track track);
}

/// Reproduces the exact stream resolution strategy from the existing Cadence
/// application (`src/context/PlayerContext.tsx` & `MainActivity.java` / `server.ts`),
/// which does NOT use `yt-dlp`, and instead resolves direct audio streams from
/// YouTube Innertube (`ANDROID_VR` client) with embedded `YT.Player` IFrame fallback.
class CadenceHybridPlaybackSource implements PlaybackSource {
  final Map<String, ResolvedAudioStream> _cache = {};

  @override
  String get sourceId => 'cadence_hybrid_youtube_source';

  @override
  Future<ResolvedAudioStream> resolveStream(Track track) async {
    final cached = _cache[track.id];
    if (cached != null && cached.streamUrl != null) {
      return cached;
    }

    // 1. If a test backend URL is configured via --dart-define, query `/api/music/audio-stream`
    if (CadenceTestConfig.testApiBaseUrl.isNotEmpty) {
      try {
        final uri = Uri.parse(
          '${CadenceTestConfig.testApiBaseUrl}/api/music/audio-stream',
        ).replace(queryParameters: {
          'id': track.id,
          'title': track.title,
          'artist': track.artist,
          'duration': track.duration.toString(),
        });
        final resp = await http.get(uri).timeout(const Duration(seconds: 6));
        if (resp.statusCode == 200) {
          final data = jsonDecode(resp.body) as Map<String, dynamic>;
          final url = data['streamUrl']?.toString();
          final dur = (data['duration'] is num)
              ? (data['duration'] as num).round()
              : track.duration;
          if (url != null && url.isNotEmpty) {
            final result = ResolvedAudioStream(
              streamUrl: url,
              durationSeconds: dur > 0 ? dur : track.duration,
              engineMode: PlaybackEngineMode.directAudioStream,
            );
            _cache[track.id] = result;
            return result;
          }
        }
      } catch (_) {
        // Fall through to direct client-side Innertube resolution
      }
    }

    // 2. Direct YouTube Innertube ANDROID_VR `/youtubei/v1/player` resolution
    try {
      final uri = Uri.parse(
        'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      );
      final payload = jsonEncode({
        'videoId': track.id,
        'context': {
          'client': {
            'clientName': 'ANDROID_VR',
            'clientVersion': '1.60.19',
            'deviceMake': 'Oculus',
            'deviceModel': 'Quest 3',
            'androidSdkVersion': 32,
            'osName': 'Android',
            'osVersion': '12L',
            'hl': 'en',
            'gl': 'US',
          },
        },
        'contentCheckOk': true,
        'racyCheckOk': true,
      });

      final resp = await http
          .post(
            uri,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent':
                  'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
            },
            body: payload,
          )
          .timeout(const Duration(seconds: 6));

      if (resp.statusCode == 200) {
        final data = jsonDecode(resp.body) as Map<String, dynamic>;
        final streamingData = data['streamingData'] as Map<String, dynamic>?;
        final adaptiveFormats =
            streamingData?['adaptiveFormats'] as List<dynamic>? ?? [];

        String? bestAudioUrl;
        int bestBitrate = 0;

        for (final rawFmt in adaptiveFormats) {
          if (rawFmt is! Map) continue;
          final mime = (rawFmt['mimeType'] ?? '').toString();
          final url = rawFmt['url']?.toString();
          if (url == null || url.isEmpty || !mime.startsWith('audio/')) {
            continue;
          }
          final bitrate = (rawFmt['bitrate'] is num)
              ? (rawFmt['bitrate'] as num).toInt()
              : 0;
          // Prefer audio/mp4 (m4a) for broad Android & iOS hardware decoder support
          final bonus = mime.contains('audio/mp4') ? 50000 : 0;
          if (bitrate + bonus > bestBitrate) {
            bestBitrate = bitrate + bonus;
            bestAudioUrl = url;
          }
        }

        final videoDetails = data['videoDetails'] as Map<String, dynamic>?;
        final lengthSecs = int.tryParse(
              (videoDetails?['lengthSeconds'] ?? '').toString(),
            ) ??
            track.duration;

        if (bestAudioUrl != null && bestAudioUrl.isNotEmpty) {
          final result = ResolvedAudioStream(
            streamUrl: bestAudioUrl,
            durationSeconds: lengthSecs > 0 ? lengthSecs : track.duration,
            engineMode: PlaybackEngineMode.directAudioStream,
          );
          _cache[track.id] = result;
          return result;
        }
      }
    } catch (_) {
      // Fall back to embedded YouTube IFrame player mode
    }

    return ResolvedAudioStream(
      streamUrl: null,
      durationSeconds: track.duration,
      engineMode: PlaybackEngineMode.youtubeEmbeddedIframe,
    );
  }
}

/// Native Android / iOS Background Audio Handler (`audio_service` + `just_audio`
/// + platform `MediaSession` channel) supporting:
/// - Background playback & foreground notification
/// - Audio focus ducking & interruption recovery
/// - Lock-screen transport controls & scrubbing
/// - Bluetooth AVRCP & wired/wireless headphone media buttons
class CadenceAudioHandler extends BaseAudioHandler with SeekHandler {
  final AudioPlayer _audioPlayer = AudioPlayer();
  static const MethodChannel _nativeMediaChannel =
      MethodChannel('app.cadence.flutter.test/media');

  final void Function()? onSkipNextCallback;
  final void Function()? onSkipPreviousCallback;
  final void Function()? onTrackCompletedCallback;

  CadenceAudioHandler({
    this.onSkipNextCallback,
    this.onSkipPreviousCallback,
    this.onTrackCompletedCallback,
  }) {
    _initAudioSession();
  }

  AudioPlayer get player => _audioPlayer;

  Future<void> _initAudioSession() async {
    final session = await AudioSession.instance;
    await session.configure(const AudioSessionConfiguration.music());

    _audioPlayer.playbackEventStream.listen((event) {
      final playing = _audioPlayer.playing;
      playbackState.add(
        playbackState.value.copyWith(
          controls: [
            MediaControl.skipToPrevious,
            if (playing) MediaControl.pause else MediaControl.play,
            MediaControl.skipToNext,
          ],
          systemActions: const {
            MediaAction.seek,
            MediaAction.seekForward,
            MediaAction.seekBackward,
          },
          androidCompactActionIndices: const [0, 1, 2],
          processingState: const {
            ProcessingState.idle: AudioProcessingState.idle,
            ProcessingState.loading: AudioProcessingState.loading,
            ProcessingState.buffering: AudioProcessingState.buffering,
            ProcessingState.ready: AudioProcessingState.ready,
            ProcessingState.completed: AudioProcessingState.completed,
          }[_audioPlayer.processingState]!,
          playing: playing,
          updatePosition: _audioPlayer.position,
          bufferedPosition: _audioPlayer.bufferedPosition,
          speed: _audioPlayer.speed,
        ),
      );
    });

    _audioPlayer.playerStateStream.listen((state) {
      if (state.processingState == ProcessingState.completed) {
        onTrackCompletedCallback?.call();
      }
    });
  }

  Future<void> loadAndPlayTrack(
    Track track,
    String streamUrl, {
    double volume = 0.8,
  }) async {
    final item = MediaItem(
      id: track.id,
      album: track.album,
      title: track.title,
      artist: track.artist,
      duration: Duration(seconds: track.duration),
      artUri: Uri.tryParse(track.thumbnailUrl),
    );
    mediaItem.add(item);

    await _audioPlayer.setVolume(volume.clamp(0.0, 1.0));
    await _audioPlayer.setAudioSource(
      AudioSource.uri(
        Uri.parse(streamUrl),
        headers: const {
          'User-Agent':
              'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36',
        },
      ),
    );
    await _audioPlayer.play();

    // Sync with native Android Foreground MediaSession Service if available
    try {
      await _nativeMediaChannel.invokeMethod('updateMediaSession', {
        'id': track.id,
        'title': track.title,
        'artist': track.artist,
        'album': track.album,
        'artworkUrl': track.thumbnailUrl,
        'durationMs': track.duration * 1000,
        'isPlaying': true,
      });
    } catch (_) {}
  }

  @override
  Future<void> play() => _audioPlayer.play();

  @override
  Future<void> pause() => _audioPlayer.pause();

  @override
  Future<void> seek(Duration position) => _audioPlayer.seek(position);

  @override
  Future<void> skipToNext() async {
    onSkipNextCallback?.call();
  }

  @override
  Future<void> skipToPrevious() async {
    onSkipPreviousCallback?.call();
  }
}
