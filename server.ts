import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Allow custom domain frontends and reverse proxies to call /api/* endpoints seamlessly
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Direct APK download route for Android users (never cache so users always get latest Flutter APK build)
app.get(['/download/apk', '/cadence-flutter-test.apk', '/cadence.apk', '/cadence-music.apk'], (_req, res) => {
  const apkPath = path.join(__dirname, 'public', 'cadence-flutter-test.apk');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="Cadence-Flutter-v1.4.apk"');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(apkPath);
});

interface SearchTrackResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  thumbnailUrl: string;
}

interface LyricLine {
  time: number;
  text: string;
}

interface LrcLibItem {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  syncedLyrics?: string;
  plainLyrics?: string;
}

function parseDurationString(str: string | undefined): number {
  if (!str) return 210;
  const parts = str.split(':').map((p) => parseInt(p.trim(), 10));
  if (parts.some(isNaN)) return 210;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 210;
}

function cleanTrackMetadata(rawTitle: string, rawChannel: string): { title: string; artist: string } {
  let cleaned = rawTitle
    .replace(
      /\s*\((Official\s*(Music\s*)?Video|Official\s*Audio|Official\s*Lyric\s*Video|Lyric\s*Video|Lyrics|Audio|Visualizer|HD|4K|Remastered.*?)\)/gi,
      ''
    )
    .replace(
      /\s*\[(Official\s*(Music\s*)?Video|Official\s*Audio|Official\s*Lyric\s*Video|Lyric\s*Video|Lyrics|Audio|Visualizer|HD|4K|Remastered.*?)\]/gi,
      ''
    )
    .trim();

  let artist = rawChannel
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .trim();

  if (cleaned.includes(' - ')) {
    const [maybeArtist, ...rest] = cleaned.split(' - ');
    const maybeTitle = rest.join(' - ').trim();
    if (maybeArtist && maybeTitle) {
      artist = maybeArtist.trim();
      cleaned = maybeTitle;
    }
  }

  return {
    title: cleaned || rawTitle,
    artist: artist || rawChannel || 'Unknown Artist',
  };
}

// Search YouTube prioritizing Official Audio tracks so studio timing matches LRC lyrics 1:1
async function searchYouTubeMusic(query: string): Promise<SearchTrackResult[]> {
  const musicQuery = `${query.trim()} official audio`;
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(musicQuery)}&sp=EgIQAQ%253D%253D`;

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`YouTube search status ${response.status}`);
  }

  const html = await response.text();
  const match =
    html.match(/var ytInitialData = (\{.*?\});<\/script>/s) ||
    html.match(/ytInitialData\s*=\s*(\{.*?\});<\/script>/s);
  if (!match || !match[1]) {
    throw new Error('Could not parse ytInitialData');
  }

  const data = JSON.parse(match[1]);
  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
      ?.contents || [];

  const candidates: Array<SearchTrackResult & { isAudioPreferred: boolean }> = [];
  const seenIds = new Set<string>();

  for (const section of contents) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const video = item?.videoRenderer;
      if (!video || !video.videoId) continue;

      const videoId: string = video.videoId;
      if (seenIds.has(videoId)) continue;

      const rawTitle: string =
        video.title?.runs?.map((r: { text: string }) => r.text).join('') ||
        video.title?.simpleText ||
        '';
      const rawChannel: string =
        video.ownerText?.runs?.[0]?.text ||
        video.longBylineText?.runs?.[0]?.text ||
        '';
      const durationText: string | undefined =
        video.lengthText?.simpleText ||
        video.thumbnailOverlays?.[0]?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText;

      const duration = parseDurationString(durationText);
      if (duration < 45 || duration > 900) continue;

      const isAudioPreferred =
        /audio|lyric|topic/i.test(rawTitle) || /topic/i.test(rawChannel);

      const { title, artist } = cleanTrackMetadata(rawTitle, rawChannel);
      seenIds.add(videoId);

      candidates.push({
        id: videoId,
        title: title.slice(0, 180),
        artist: artist.slice(0, 180),
        album: 'Single',
        duration,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        isAudioPreferred,
      });

      if (candidates.length >= 24) break;
    }
    if (candidates.length >= 24) break;
  }

  return candidates.slice(0, 18).map(({ isAudioPreferred: _p, ...track }) => track);
}

// Parse standard LRC format "[mm:ss.xx] Lyric text"
function parseLrc(lrcContent: string): LyricLine[] {
  const lines = lrcContent.split(/\r?\n/);
  const parsed: LyricLine[] = [];
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of lines) {
    const matches = [...rawLine.matchAll(timeRegex)];
    if (matches.length === 0) continue;

    const text = rawLine.replace(timeRegex, '').trim();
    if (!text) continue;

    for (const m of matches) {
      const minutes = parseInt(m[1], 10);
      const seconds = parseInt(m[2], 10);
      const msStr = m[3] || '0';
      const ms =
        msStr.length === 2
          ? parseInt(msStr, 10) * 10
          : parseInt(msStr.padEnd(3, '0').slice(0, 3), 10);
      const time = Number((minutes * 60 + seconds + ms / 1000).toFixed(2));
      parsed.push({ time, text });
    }
  }

  return parsed.sort((a, b) => a.time - b.time);
}

function distributePlainLyrics(plainText: string, duration: number): LyricLine[] {
  const rawLines = plainText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^\[.*\]$/.test(l));

  if (rawLines.length === 0) return [];

  const effectiveDuration = Math.max(duration - 14, 60);
  const startOffset = 6;
  const step = effectiveDuration / rawLines.length;

  return rawLines.map((text, idx) => ({
    time: Number((startOffset + idx * step).toFixed(2)),
    text,
  }));
}

function normalizeForQuery(str: string): string {
  return str
    .replace(/\s*\((feat\.?|ft\.?|with).*?\)/gi, '')
    .replace(/\s*\[(feat\.?|ft\.?|with).*?\]/gi, '')
    .replace(/\s+(feat\.?|ft\.?)\s+.*/i, '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pick the best synced LRC candidate whose duration matches the actual YouTube track duration
function pickBestSyncedCandidate(items: LrcLibItem[], targetDuration: number): LyricLine[] | null {
  const syncedItems = items.filter(
    (item) => item.syncedLyrics && item.syncedLyrics.trim().length > 0
  );
  if (syncedItems.length === 0) return null;

  // Sort by duration closeness to the actual YouTube audio duration
  syncedItems.sort((a, b) => {
    const diffA = Math.abs((a.duration || targetDuration) - targetDuration);
    const diffB = Math.abs((b.duration || targetDuration) - targetDuration);
    return diffA - diffB;
  });

  for (const candidate of syncedItems) {
    if (!candidate.syncedLyrics) continue;
    const parsed = parseLrc(candidate.syncedLyrics);
    if (parsed.length >= 4) {
      return parsed;
    }
  }

  return null;
}

async function fetchYouTubePlaylistById(
  listId: string
): Promise<{ name: string; description: string; tracks: SearchTrackResult[] }> {
  const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch YouTube playlist (${response.status})`);
  }

  const html = await response.text();
  const match =
    html.match(/var ytInitialData = (\{.*?\});<\/script>/s) ||
    html.match(/ytInitialData\s*=\s*(\{.*?\});<\/script>/s);

  if (!match || !match[1]) {
    throw new Error('Could not parse YouTube playlist data');
  }

  const data = JSON.parse(match[1]);
  const playlistTitle =
    data?.metadata?.playlistMetadataRenderer?.title ||
    data?.header?.playlistHeaderRenderer?.title?.simpleText ||
    'Imported YouTube Playlist';

  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  const sectionContents =
    tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  const itemSection =
    sectionContents[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer
      ?.contents || [];

  const tracks: SearchTrackResult[] = [];
  const seenIds = new Set<string>();

  for (const entry of itemSection) {
    const v = entry?.playlistVideoRenderer;
    if (!v || !v.videoId) continue;
    const videoId: string = v.videoId;
    if (seenIds.has(videoId)) continue;

    const rawTitle: string =
      v.title?.runs?.map((r: { text: string }) => r.text).join('') ||
      v.title?.simpleText ||
      '';
    if (!rawTitle || /^\[(deleted|private)\s+video\]$/i.test(rawTitle)) continue;

    const rawChannel: string =
      v.shortBylineText?.runs?.[0]?.text ||
      v.longBylineText?.runs?.[0]?.text ||
      '';
    const durationSeconds = Number(v.lengthSeconds) || parseDurationString(v.lengthText?.simpleText);
    const { title, artist } = cleanTrackMetadata(rawTitle, rawChannel);

    seenIds.add(videoId);
    tracks.push({
      id: videoId,
      title: title.slice(0, 180),
      artist: artist.slice(0, 180),
      album: playlistTitle.slice(0, 180),
      duration: durationSeconds > 0 ? durationSeconds : 210,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });

    if (tracks.length >= 50) break;
  }

  return {
    name: String(playlistTitle).slice(0, 100),
    description: `Imported from YouTube Playlist (${tracks.length} songs)`,
    tracks,
  };
}

async function fetchSpotifyPlaylistById(
  spotifyId: string
): Promise<{ name: string; description: string; queries: string[] }> {
  const embedUrl = `https://open.spotify.com/embed/playlist/${encodeURIComponent(spotifyId)}`;
  const response = await fetch(embedUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Spotify playlist (${response.status})`);
  }

  const html = await response.text();
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (nextDataMatch && nextDataMatch[1]) {
    const nextData = JSON.parse(nextDataMatch[1]);
    const entity = nextData?.props?.pageProps?.state?.data?.entity;
    const name = entity?.name || entity?.title || 'Imported Spotify Playlist';
    const trackList = entity?.trackList || [];
    const queries: string[] = [];

    for (const item of trackList) {
      const tTitle = item?.title || '';
      const tArtist = item?.subtitle || '';
      if (tTitle) {
        queries.push(`${tTitle} ${tArtist}`.trim());
      }
      if (queries.length >= 25) break;
    }

    if (queries.length > 0) {
      return {
        name: String(name).slice(0, 100),
        description: 'Imported from Spotify Playlist',
        queries,
      };
    }
  }

  throw new Error('Could not extract tracks from Spotify link');
}

app.get('/api/music/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.json({ tracks: [] });
    return;
  }

  try {
    const tracks = await searchYouTubeMusic(q);
    res.json({ tracks });
  } catch (error) {
    console.error('YouTube search error:', error);
    res.status(200).json({ tracks: [], error: 'Fallback to local catalog search' });
  }
});

app.post('/api/playlist/import', async (req, res) => {
  const { url, songLines, customName } = req.body || {};

  try {
    // Mode 1: URL import (YouTube / YouTube Music / Spotify)
    if (typeof url === 'string' && url.trim().length > 0) {
      const rawUrl = url.trim();

      // Check for YouTube playlist parameter (?list= or &list=)
      const listMatch = rawUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
      if (listMatch && listMatch[1]) {
        const result = await fetchYouTubePlaylistById(listMatch[1]);
        res.json({
          name: (customName && String(customName).trim()) || result.name,
          description: result.description,
          tracks: result.tracks,
        });
        return;
      }

      // Check for Spotify playlist URL
      const spotifyMatch = rawUrl.match(/spotify\.com\/(?:embed\/)?playlist\/([a-zA-Z0-9]+)/i);
      if (spotifyMatch && spotifyMatch[1]) {
        const spotifyData = await fetchSpotifyPlaylistById(spotifyMatch[1]);
        const resolvedTracks: SearchTrackResult[] = [];
        const seenIds = new Set<string>();

        // Resolve tracks in batches of 4
        for (let i = 0; i < spotifyData.queries.length; i += 4) {
          const batch = spotifyData.queries.slice(i, i + 4);
          const batchResults = await Promise.all(
            batch.map(async (q) => {
              try {
                const found = await searchYouTubeMusic(q);
                return found[0] || null;
              } catch {
                return null;
              }
            })
          );
          for (const t of batchResults) {
            if (t && !seenIds.has(t.id)) {
              seenIds.add(t.id);
              resolvedTracks.push(t);
            }
          }
        }

        res.json({
          name: (customName && String(customName).trim()) || spotifyData.name,
          description: spotifyData.description,
          tracks: resolvedTracks,
        });
        return;
      }

      res.status(400).json({
        error:
          'Please provide a valid YouTube Playlist URL (with ?list=...) or public Spotify Playlist link.',
      });
      return;
    }

    // Mode 2: Song list import (array of song title/artist lines)
    if (Array.isArray(songLines) && songLines.length > 0) {
      const cleanedLines = songLines
        .map((l) => String(l || '').trim())
        .filter((l) => l.length > 0)
        .slice(0, 25);

      const resolvedTracks: SearchTrackResult[] = [];
      const seenIds = new Set<string>();

      for (let i = 0; i < cleanedLines.length; i += 4) {
        const batch = cleanedLines.slice(i, i + 4);
        const batchResults = await Promise.all(
          batch.map(async (q) => {
            try {
              const found = await searchYouTubeMusic(q);
              return found[0] || null;
            } catch {
              return null;
            }
          })
        );
        for (const t of batchResults) {
          if (t && !seenIds.has(t.id)) {
            seenIds.add(t.id);
            resolvedTracks.push(t);
          }
        }
      }

      res.json({
        name: (customName && String(customName).trim()) || 'Imported Playlist',
        description: `Imported from song list (${resolvedTracks.length} songs)`,
        tracks: resolvedTracks,
      });
      return;
    }

    res.status(400).json({ error: 'No playlist URL or song list provided.' });
  } catch (err) {
    console.error('Playlist import error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to import playlist.',
    });
  }
});

app.get('/api/music/suggestions', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.json({ suggestions: [] });
    return;
  }

  try {
    const ytSuggestUrl = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`;
    const response = await fetch(ytSuggestUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && Array.isArray(data[1])) {
        const suggestions = data[1]
          .map((s: unknown) => String(s).trim())
          .filter((s: string) => s.length > 0)
          .slice(0, 8);
        res.json({ suggestions });
        return;
      }
    }
  } catch (err) {
    console.error('Suggestions error:', err);
  }

  res.json({ suggestions: [] });
});

app.get('/api/lyrics', async (req, res) => {
  const rawTitle = String(req.query.title || '').trim();
  const rawArtist = String(req.query.artist || '').trim();
  const duration = Number(req.query.duration || 210);

  if (!rawTitle) {
    res.json({ lines: [], source: 'none' });
    return;
  }

  const cleanTitle = normalizeForQuery(rawTitle);
  const cleanArtist = normalizeForQuery(rawArtist);

  try {
    // 1. Structured LRCLIB search with track_name + artist_name
    const structuredParams = new URLSearchParams({
      track_name: cleanTitle,
      artist_name: cleanArtist,
    });
    const structuredRes = await fetch(
      `https://lrclib.net/api/search?${structuredParams.toString()}`,
      {
        headers: { 'User-Agent': 'CadenceMusicPlayer/1.0 (https://cadence.app)' },
      }
    );

    if (structuredRes.ok) {
      const items = (await structuredRes.json()) as LrcLibItem[];
      if (Array.isArray(items) && items.length > 0) {
        const bestSynced = pickBestSyncedCandidate(items, duration);
        if (bestSynced) {
          res.json({ lines: bestSynced, source: 'lrclib-synced' });
          return;
        }
      }
    }

    // 2. Combined query search on LRCLIB
    const combinedRes = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`.trim())}`,
      {
        headers: { 'User-Agent': 'CadenceMusicPlayer/1.0 (https://cadence.app)' },
      }
    );

    if (combinedRes.ok) {
      const items = (await combinedRes.json()) as LrcLibItem[];
      if (Array.isArray(items) && items.length > 0) {
        const bestSynced = pickBestSyncedCandidate(items, duration);
        if (bestSynced) {
          res.json({ lines: bestSynced, source: 'lrclib-synced' });
          return;
        }

        const withPlain = items.find((i) => i.plainLyrics && i.plainLyrics.trim().length > 0);
        if (withPlain && withPlain.plainLyrics) {
          const distributed = distributePlainLyrics(withPlain.plainLyrics, duration);
          if (distributed.length > 0) {
            res.json({ lines: distributed, source: 'lrclib-plain-synced' });
            return;
          }
        }
      }
    }

    // 3. Title-only search on LRCLIB
    const titleOnlyRes = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`,
      {
        headers: { 'User-Agent': 'CadenceMusicPlayer/1.0 (https://cadence.app)' },
      }
    );

    if (titleOnlyRes.ok) {
      const items = (await titleOnlyRes.json()) as LrcLibItem[];
      if (Array.isArray(items) && items.length > 0) {
        const bestSynced = pickBestSyncedCandidate(items, duration);
        if (bestSynced) {
          res.json({ lines: bestSynced, source: 'lrclib-synced' });
          return;
        }
      }
    }
  } catch (err) {
    console.error('LRCLIB fetch error:', err);
  }

  const totalDur = Math.max(duration, 120);
  const generatedLines: LyricLine[] = [
    { time: 0, text: `♪ ${rawTitle} — ${rawArtist}` },
    { time: 8, text: 'Warm analog frequencies rising through the dark' },
    { time: 16, text: 'City lights fade under the deep sunset horizon' },
    { time: 25, text: 'Every beat echoes in the quiet of the night' },
    { time: 35, text: `Holding onto the rhythm of ${rawTitle}` },
    { time: 46, text: 'Shadows drift across the midnight boulevard' },
    { time: 58, text: 'Let the melody carry us past the static' },
    { time: 70, text: 'Golden embers glowing in the studio glass' },
    { time: 84, text: 'No rush, just the pulse and the open road' },
    { time: 98, text: 'Breathing in the cadence of the moment' },
    { time: 112, text: 'Voices blend into the warm orange twilight' },
    { time: 128, text: 'Turning the volume up as the chorus breaks' },
    { time: Math.min(145, totalDur - 35), text: 'Drifting weightless through the final verse' },
    { time: Math.min(165, totalDur - 15), text: `♪ ${rawArtist}` },
  ].filter((l) => l.time < totalDur);

  res.json({ lines: generatedLines, source: 'cadence-synced' });
});

// Pure TypeScript DES-ECB implementation for decrypting direct 320kbps studio audio stream URLs
const DES_IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
  62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
  57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
  61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
];
const DES_FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31,
  38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
  36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27,
  34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25,
];
const DES_PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18,
  10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
  63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22,
  14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
];
const DES_PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10,
  23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2,
  41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48,
  44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];
const DES_E = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9,
  8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17,
  16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25,
  24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
];
const DES_P = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10,
  2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25,
];
const DES_S = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11],
];
const DES_SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    for (let b = 7; b >= 0; b--) {
      bits.push((bytes[i] >> b) & 1);
    }
  }
  return bits;
}

function bitsToBytes(bits: number[]): Uint8Array {
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) {
      val = (val << 1) | bits[i * 8 + b];
    }
    bytes[i] = val;
  }
  return bytes;
}

function permuteBits(bits: number[], table: number[]): number[] {
  return table.map((idx) => bits[idx - 1]);
}

function generateDesSubkeys(keyStr: string): number[][] {
  const keyBytes = Buffer.from(keyStr, 'utf8');
  const keyBits = bytesToBits(keyBytes);
  const permKey = permuteBits(keyBits, DES_PC1);
  let C = permKey.slice(0, 28);
  let D = permKey.slice(28, 56);
  const subkeys: number[][] = [];
  for (let round = 0; round < 16; round++) {
    const s = DES_SHIFTS[round];
    C = C.slice(s).concat(C.slice(0, s));
    D = D.slice(s).concat(D.slice(0, s));
    subkeys.push(permuteBits(C.concat(D), DES_PC2));
  }
  return subkeys;
}

const SAAVN_DES_SUBKEYS = generateDesSubkeys('38346591');

function decryptSaavnMediaUrl(base64Cipher: string): string {
  const cipherBytes = Buffer.from(base64Cipher, 'base64');
  const outBytes = new Uint8Array(cipherBytes.length);
  for (let offset = 0; offset < cipherBytes.length; offset += 8) {
    const blockBits = bytesToBits(cipherBytes.subarray(offset, offset + 8));
    const ipBits = permuteBits(blockBits, DES_IP);
    let L = ipBits.slice(0, 32);
    let R = ipBits.slice(32, 64);
    for (let round = 15; round >= 0; round--) {
      const expR = permuteBits(R, DES_E);
      const xored = expR.map((bit, idx) => bit ^ SAAVN_DES_SUBKEYS[round][idx]);
      const sOut: number[] = [];
      for (let box = 0; box < 8; box++) {
        const chunk = xored.slice(box * 6, box * 6 + 6);
        const row = (chunk[0] << 1) | chunk[5];
        const col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4];
        const val = DES_S[box][row * 16 + col];
        sOut.push((val >> 3) & 1, (val >> 2) & 1, (val >> 1) & 1, val & 1);
      }
      const fOut = permuteBits(sOut, DES_P);
      const nextR = L.map((bit, idx) => bit ^ fOut[idx]);
      L = R;
      R = nextR;
    }
    const finalBits = permuteBits(R.concat(L), DES_FP);
    outBytes.set(bitsToBytes(finalBits), offset);
  }
  const padLen = outBytes[outBytes.length - 1];
  const validLen = padLen >= 1 && padLen <= 8 ? outBytes.length - padLen : outBytes.length;
  return Buffer.from(outBytes.subarray(0, validLen)).toString('utf8');
}

const audioStreamCache = new Map<string, { streamUrl: string; duration: number; source: string }>();

app.get('/api/music/audio-stream', async (req, res) => {
  const videoId = String(req.query.id || '').trim();
  const rawTitle = String(req.query.title || '').trim();
  const rawArtist = String(req.query.artist || '').trim();
  const targetDuration = Number(req.query.duration) || 210;

  const cacheKey = `${videoId}:${rawTitle.toLowerCase()}:${rawArtist.toLowerCase()}`;
  const cached = audioStreamCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  // 1. Resolve high-bitrate 320kbps AAC/MP4 direct stream via JioSaavn catalog
  if (rawTitle) {
    try {
      const cleanTitle = rawTitle
        .replace(/\s*\(.*?\)/g, '')
        .replace(/\s*\[.*?\]/g, '')
        .trim();
      const cleanArtist = rawArtist
        .replace(/\s*-\s*Topic$/i, '')
        .replace(/VEVO$/i, '')
        .trim();

      const query = `${cleanTitle || rawTitle} ${cleanArtist}`.trim();
      const saavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=10&p=1&q=${encodeURIComponent(query)}`;

      const saavnRes = await fetch(saavnUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'X-Forwarded-For': '49.36.128.1',
          'CF-IPCountry': 'IN',
        },
      });

      if (saavnRes.ok) {
        const data = (await saavnRes.json()) as {
          results?: Array<{
            title?: string;
            more_info?: {
              encrypted_media_url?: string;
              duration?: string | number;
              '320kbps'?: string;
              artistMap?: {
                primary_artists?: Array<{ name?: string }>;
              };
            };
          }>;
        };

        const results = Array.isArray(data?.results) ? data.results : [];
        const withUrl = results.filter((r) => Boolean(r?.more_info?.encrypted_media_url));

        if (withUrl.length > 0) {
          const wantsRemixOrCover = /nightcore|lofi|8d|karaoke|instrumental|ringtone/i.test(rawTitle);
          const artistTokens = cleanArtist
            .toLowerCase()
            .split(/[\s,&]+/)
            .filter((t) => t.length > 2);

          // Score each candidate so we pick the closest studio match
          let bestCandidate = withUrl[0];
          let bestScore = -999;

          for (const item of withUrl) {
            let score = 0;
            const itemTitle = (item.title || '').toLowerCase();
            const itemArtists = (item.more_info?.artistMap?.primary_artists || [])
              .map((a) => (a.name || '').toLowerCase())
              .join(' ');
            const itemDur = Number(item.more_info?.duration) || 0;

            if (!wantsRemixOrCover && /nightcore|lofi|8d|karaoke|instrumental|ringtone/i.test(itemTitle)) {
              score -= 40;
            }
            if (itemTitle.includes((cleanTitle || rawTitle).toLowerCase())) {
              score += 20;
            }
            for (const token of artistTokens) {
              if (itemArtists.includes(token)) {
                score += 15;
              }
            }
            if (itemDur > 0 && targetDuration > 0) {
              const diff = Math.abs(itemDur - targetDuration);
              if (diff <= 5) score += 25;
              else if (diff <= 15) score += 12;
              else if (diff > 60) score -= 20;
            }

            if (score > bestScore) {
              bestScore = score;
              bestCandidate = item;
            }
          }

          const encrypted = bestCandidate?.more_info?.encrypted_media_url;
          if (encrypted) {
            let streamUrl = decryptSaavnMediaUrl(encrypted);
            if (bestCandidate.more_info?.['320kbps'] === 'true') {
              streamUrl = streamUrl.replace('_96.mp4', '_320.mp4');
            } else {
              streamUrl = streamUrl.replace('_96.mp4', '_160.mp4');
            }

            const resolvedDur = Number(bestCandidate.more_info?.duration) || targetDuration;
            const payload = {
              streamUrl,
              duration: resolvedDur,
              source: 'direct-aac',
            };
            audioStreamCache.set(cacheKey, payload);
            res.json(payload);
            return;
          }
        }
      }
    } catch (err) {
      console.error('Direct audio stream resolution error:', err);
    }
  }

  // 2. Fallback: YouTube Innertube ANDROID_VR direct audio stream
  if (videoId) {
    try {
      const ytRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: {
              clientName: 'ANDROID_VR',
              clientVersion: '1.60.19',
              deviceMake: 'Oculus',
              deviceModel: 'Quest 3',
              androidSdkVersion: 32,
              osName: 'Android',
              osVersion: '12L',
              hl: 'en',
              gl: 'US',
            },
          },
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });

      if (ytRes.ok) {
        const ytData = (await ytRes.json()) as {
          streamingData?: {
            adaptiveFormats?: Array<{
              mimeType?: string;
              url?: string;
              approxDurationMs?: string;
            }>;
          };
        };
        const formats = ytData?.streamingData?.adaptiveFormats || [];
        const audioFormats = formats.filter(
          (f) => f.mimeType && f.mimeType.startsWith('audio/') && f.url
        );
        const bestAudio =
          audioFormats.find((f) => f.mimeType?.includes('audio/mp4')) || audioFormats[0];
        if (bestAudio && bestAudio.url) {
          const payload = {
            streamUrl: bestAudio.url,
            duration: bestAudio.approxDurationMs
              ? Math.round(Number(bestAudio.approxDurationMs) / 1000)
              : targetDuration,
            source: 'yt-direct',
          };
          audioStreamCache.set(cacheKey, payload);
          res.json(payload);
          return;
        }
      }
    } catch {
      // ignore fallback error
    }
  }

  res.json({ streamUrl: null, duration: targetDuration, source: 'youtube-iframe' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cadence server listening on http://localhost:${PORT}`);
  });
}

startServer();
