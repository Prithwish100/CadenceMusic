import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/test_config.dart';
import '../data/curated_catalog.dart';
import '../models/lyric_line.dart';
import '../models/track.dart';

/// Fetches and parses line-synchronized `[mm:ss.xx]` LRC lyrics from LRCLIB
/// (`https://lrclib.net/api/search`) with duration-aware candidate matching,
/// matching the exact behaviour of the existing Cadence application.
class LyricsService {
  final Map<String, List<LyricLine>> _cache = {};

  Future<List<LyricLine>> fetchLyricsForTrack(Track track) async {
    if (presetSyncedLyrics.containsKey(track.id)) {
      return presetSyncedLyrics[track.id]!;
    }

    final cacheKey = '${track.id}:${track.duration}';
    if (_cache.containsKey(cacheKey)) {
      return _cache[cacheKey]!;
    }

    try {
      final cleanTitle = track.title
          .replaceAll(RegExp(r'\(.*?\)|\[.*?\]', caseSensitive: false), '')
          .trim();
      final query = '$cleanTitle ${track.artist}'.trim();
      final uri = Uri.parse(
        '${CadenceTestConfig.lrclibSearchEndpoint}?q=${Uri.encodeQueryComponent(query)}',
      );

      final response = await http.get(
        uri,
        headers: const {
          'User-Agent':
              'CadenceFlutterExperimental/1.0.0 (https://cadence.run.place)',
        },
      ).timeout(const Duration(seconds: 6));

      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        if (decoded is List && decoded.isNotEmpty) {
          // Pick candidate with syncedLyrics whose duration is closest to track.duration
          Map<String, dynamic>? bestSynced;
          int bestDiff = 999999;

          for (final item in decoded) {
            if (item is! Map) continue;
            final map = Map<String, dynamic>.from(item);
            final synced = (map['syncedLyrics'] ?? '').toString().trim();
            if (synced.isEmpty) continue;
            final candDur = (map['duration'] is num)
                ? (map['duration'] as num).round()
                : track.duration;
            final diff = (candDur - track.duration).abs();
            if (diff < bestDiff) {
              bestDiff = diff;
              bestSynced = map;
            }
          }

          if (bestSynced != null) {
            final parsed = parseLrc((bestSynced['syncedLyrics'] ?? '').toString());
            if (parsed.isNotEmpty) {
              _cache[cacheKey] = parsed;
              return parsed;
            }
          }

          // Fallback to plainLyrics distributed evenly across track duration
          final firstPlain = decoded.firstWhere(
            (e) =>
                e is Map &&
                (e['plainLyrics'] ?? '').toString().trim().isNotEmpty,
            orElse: () => null,
          );
          if (firstPlain is Map) {
            final rawLines = (firstPlain['plainLyrics'] ?? '')
                .toString()
                .split(RegExp(r'\r?\n'))
                .map((l) => l.trim())
                .where((l) => l.isNotEmpty)
                .toList();
            if (rawLines.isNotEmpty) {
              final step =
                  (track.duration > 20 ? track.duration - 10 : 180) /
                      rawLines.length;
              final distributed = <LyricLine>[
                for (int i = 0; i < rawLines.length; i++)
                  LyricLine(time: i * step, text: rawLines[i]),
              ];
              _cache[cacheKey] = distributed;
              return distributed;
            }
          }
        }
      }
    } catch (_) {
      // Ignore network error and return fallback lines
    }

    return [
      LyricLine(time: 0, text: '♪ ${track.title} — ${track.artist}'),
      const LyricLine(time: 8, text: 'Listening in Cadence Studio Mode'),
    ];
  }

  /// Parses standard `[mm:ss.xx]` LRC timestamps into sorted [LyricLine] items.
  List<LyricLine> parseLrc(String rawLrc) {
    final lines = <LyricLine>[];
    final reg = RegExp(r'\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)');

    for (final rawLine in rawLrc.split(RegExp(r'\r?\n'))) {
      final match = reg.firstMatch(rawLine.trim());
      if (match == null) continue;

      final mins = int.tryParse(match.group(1) ?? '0') ?? 0;
      final secs = int.tryParse(match.group(2) ?? '0') ?? 0;
      final fracRaw = match.group(3) ?? '0';
      final frac = fracRaw.length == 3
          ? (int.tryParse(fracRaw) ?? 0) / 1000.0
          : (int.tryParse(fracRaw.padRight(2, '0')) ?? 0) / 100.0;
      final text = (match.group(4) ?? '').trim();
      if (text.isEmpty) continue;

      lines.add(LyricLine(time: mins * 60 + secs + frac, text: text));
    }

    lines.sort((a, b) => a.time.compareTo(b.time));
    return lines;
  }
}
