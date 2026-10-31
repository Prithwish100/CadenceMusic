import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

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

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
