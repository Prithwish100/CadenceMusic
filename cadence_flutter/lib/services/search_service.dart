import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/test_config.dart';
import '../data/curated_catalog.dart';
import '../models/track.dart';

/// Music Discovery, Autocomplete Predictions, and YouTube Track Search Service.
/// Reproduces the exact search & autocomplete behaviour of the existing Cadence web app.
class SearchService {
  Future<List<String>> fetchAutocompleteSuggestions(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) {
      return popularSearchSuggestions.take(7).toList();
    }

    final localMatches = popularSearchSuggestions
        .where((s) => s.toLowerCase().contains(trimmed.toLowerCase()))
        .toList();

    try {
      final uri = Uri.parse(
        '${CadenceTestConfig.youtubeSuggestEndpoint}${Uri.encodeQueryComponent(trimmed)}',
      );
      final response = await http
          .get(uri)
          .timeout(const Duration(milliseconds: 2500));
      if (response.statusCode == 200) {
        final decoded = jsonDecode(response.body);
        if (decoded is List && decoded.length >= 2 && decoded[1] is List) {
          final remoteList = (decoded[1] as List)
              .map((e) => e.toString())
              .where((s) => s.isNotEmpty)
              .toList();
          final merged = <String>{...localMatches, ...remoteList}.toList();
          return merged.take(8).toList();
        }
      }
    } catch (_) {
      // Fallback to local matches
    }

    return localMatches.take(8).toList();
  }

  Future<List<Track>> searchTracks(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) return curatedTracks;

    // 1. If a test backend URL is configured, query `/api/music/search`
    if (CadenceTestConfig.testApiBaseUrl.isNotEmpty) {
      try {
        final uri = Uri.parse(
          '${CadenceTestConfig.testApiBaseUrl}/api/music/search?q=${Uri.encodeQueryComponent(trimmed)}',
        );
        final resp = await http.get(uri).timeout(const Duration(seconds: 6));
        if (resp.statusCode == 200) {
          final data = jsonDecode(resp.body) as Map<String, dynamic>;
          final list = data['tracks'] as List<dynamic>? ?? [];
          if (list.isNotEmpty) {
            return list
                .whereType<Map>()
                .map((m) => Track.fromJson(Map<String, dynamic>.from(m)))
                .toList();
          }
        }
      } catch (_) {}
    }

    // 2. Direct YouTube search page `ytInitialData` extraction (same as MainActivity.java)
    try {
      final uri = Uri.parse(
        'https://www.youtube.com/results?search_query=${Uri.encodeQueryComponent('$trimmed official audio')}&sp=EgIQAQ%253D%253D',
      );
      final resp = await http.get(
        uri,
        headers: const {
          'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      ).timeout(const Duration(seconds: 6));

      if (resp.statusCode == 200) {
        final html = resp.body;
        final vidReg = RegExp(r'"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"');
        final titleReg = RegExp(
          r'"title"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]+)"\}\]',
        );
        final ownerReg = RegExp(
          r'"ownerText"\s*:\s*\{"runs"\s*:\s*\[\{"text"\s*:\s*"([^"]+)"\}\]',
        );

        final vids = vidReg.allMatches(html).toList();
        final titles = titleReg.allMatches(html).toList();
        final owners = ownerReg.allMatches(html).toList();

        final results = <Track>[];
        final seenIds = <String>{};
        final count = [vids.length, titles.length, owners.length]
            .reduce((a, b) => a < b ? a : b);

        for (int i = 0; i < count && results.length < 18; i++) {
          final id = vids[i].group(1) ?? '';
          if (id.isEmpty || seenIds.contains(id)) continue;
          seenIds.add(id);
          final rawTitle = titles[i].group(1) ?? 'Unknown Track';
          final rawArtist = owners[i]
                  .group(1)
                  ?.replaceAll(RegExp(r'\s*-\s*Topic$'), '') ??
              'Unknown Artist';

          results.add(
            Track(
              id: id,
              title: rawTitle,
              artist: rawArtist,
              album: 'Single',
              duration: 210,
              thumbnailUrl: 'https://i.ytimg.com/vi/$id/hqdefault.jpg',
            ),
          );
        }

        if (results.isNotEmpty) {
          return results;
        }
      }
    } catch (_) {}

    // 3. Fallback filter on curated catalog
    final qLower = trimmed.toLowerCase();
    final filtered = curatedTracks
        .where(
          (t) =>
              t.title.toLowerCase().contains(qLower) ||
              t.artist.toLowerCase().contains(qLower) ||
              t.album.toLowerCase().contains(qLower),
        )
        .toList();
    return filtered.isNotEmpty ? filtered : curatedTracks;
  }
}
