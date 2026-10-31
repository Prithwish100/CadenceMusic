import { LyricLine, Track } from '../types/music';

declare global {
  interface Window {
    __cadenceNativeMediaAction?: (action: string, seekMs?: number) => void;
  }
}

export function isRunningInNativeApk(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    navigator.userAgent.includes('CadenceAPK') ||
    window.location.hostname === 'cadence.local'
  );
}

export interface NativePlayerStatus {
  playing: boolean;
  buffering: boolean;
  pos: number; // milliseconds
  dur: number; // milliseconds
  trackId: string;
}

export async function nativePlayerLoadAndPlay(
  track: Track,
  streamUrl: string,
  volumePercent: number
): Promise<void> {
  if (!isRunningInNativeApk()) return;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const thumbUrl = track.thumbnailUrl
      ? track.thumbnailUrl.startsWith('http')
        ? track.thumbnailUrl
        : `${origin}${track.thumbnailUrl}`
      : '';
    const params = new URLSearchParams({
      action: 'load',
      id: track.id,
      url: streamUrl,
      title: track.title || 'Cadence Music',
      artist: track.artist || 'Unknown Artist',
      album: track.album || 'Cadence',
      artwork: thumbUrl,
      dur: String(Math.max(1000, Math.round((track.duration || 210) * 1000))),
      vol: String(Math.max(0, Math.min(100, Math.round(volumePercent)))),
    });
    await fetch(`/api/native-player?${params.toString()}`);
  } catch {
    // ignore
  }
}

export function nativePlayerPreloadTrack(trackId: string, streamUrl: string): void {
  if (!isRunningInNativeApk() || !streamUrl) return;
  try {
    const params = new URLSearchParams({
      action: 'preload',
      id: trackId,
      url: streamUrl,
    });
    fetch(`/api/native-player?${params.toString()}`).catch(() => {});
  } catch {
    // ignore
  }
}

export function nativePlayerSetPlaying(playing: boolean): void {
  if (!isRunningInNativeApk()) return;
  try {
    fetch(`/api/native-player?action=${playing ? 'play' : 'pause'}`).catch(() => {});
  } catch {
    // ignore
  }
}

export function nativePlayerSeekTo(seconds: number): void {
  if (!isRunningInNativeApk()) return;
  try {
    const posMs = Math.max(0, Math.round(seconds * 1000));
    fetch(`/api/native-player?action=seek&pos=${posMs}`).catch(() => {});
  } catch {
    // ignore
  }
}

export function nativePlayerSetVolume(volumePercent: number): void {
  if (!isRunningInNativeApk()) return;
  try {
    const vol = Math.max(0, Math.min(100, Math.round(volumePercent)));
    fetch(`/api/native-player?action=volume&vol=${vol}`).catch(() => {});
  } catch {
    // ignore
  }
}

export async function nativePlayerGetStatus(): Promise<NativePlayerStatus | null> {
  if (!isRunningInNativeApk()) return null;
  try {
    const res = await fetch('/api/native-player?action=status');
    if (res.ok) {
      return (await res.json()) as NativePlayerStatus;
    }
  } catch {
    // ignore
  }
  return null;
}

export function syncNativeNotificationInApk(
  title: string,
  artist: string,
  album: string,
  artworkUrl: string,
  isPlaying: boolean,
  positionMs: number,
  durationMs: number
): void {
  if (!isRunningInNativeApk()) return;
  try {
    const params = new URLSearchParams({
      title: title || 'Cadence Music',
      artist: artist || 'Unknown Artist',
      album: album || 'Cadence',
      artwork: artworkUrl || '',
      playing: isPlaying ? '1' : '0',
      pos: String(Math.max(0, Math.round(positionMs))),
      dur: String(Math.max(1000, Math.round(durationMs))),
    });
    fetch(`/api/native-media-state?${params.toString()}`).catch(() => {});
  } catch {
    // ignore
  }
}

// Pure TypeScript DES-ECB implementation for decrypting direct studio audio stream URLs
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
  const keyBytes = new TextEncoder().encode(keyStr);
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

export function decryptSaavnMediaUrlClient(base64Cipher: string): string {
  const binStr = atob(base64Cipher.trim());
  const cipherBytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    cipherBytes[i] = binStr.charCodeAt(i);
  }
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
  return new TextDecoder().decode(outBytes.subarray(0, validLen));
}

export async function resolveStreamInApk(
  track: Track
): Promise<{ streamUrl: string | null; duration: number }> {
  const targetDuration = Number(track.duration) || 210;
  const rawTitle = (track.title || '').trim();
  const rawArtist = (track.artist || '').trim();

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
      const res = await fetch(`/api/saavn?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        const withUrl = results.filter((r: any) => Boolean(r?.more_info?.encrypted_media_url));

        if (withUrl.length > 0) {
          const wantsRemixOrCover = /nightcore|lofi|8d|karaoke|instrumental|ringtone/i.test(rawTitle);
          const artistTokens = cleanArtist
            .toLowerCase()
            .split(/[\s,&]+/)
            .filter((t) => t.length > 2);

          let bestCandidate = withUrl[0];
          let bestScore = -999;

          for (const item of withUrl) {
            let score = 0;
            const itemTitle = String(item.title || '').toLowerCase();
            const itemArtists = (item.more_info?.artistMap?.primary_artists || [])
              .map((a: any) => String(a.name || '').toLowerCase())
              .join(' ');
            const itemDur = Number(item.more_info?.duration) || 0;

            if (
              !wantsRemixOrCover &&
              /nightcore|lofi|8d|karaoke|instrumental|ringtone/i.test(itemTitle)
            ) {
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
            let streamUrl = decryptSaavnMediaUrlClient(encrypted);
            streamUrl = streamUrl.replace('_96.mp4', '_160.mp4');
            const resolvedDur = Number(bestCandidate.more_info?.duration) || targetDuration;
            return { streamUrl, duration: resolvedDur };
          }
        }
      }
    } catch {
      // Fall through to YouTube ANDROID_VR Innertube fallback
    }
  }

  // Fallback: YouTube ANDROID_VR direct stream via /api/yt-stream
  if (track.id) {
    try {
      const ytRes = await fetch(`/api/yt-stream?id=${encodeURIComponent(track.id)}`);
      if (ytRes.ok) {
        const ytData = await ytRes.json();
        const formats = ytData?.streamingData?.adaptiveFormats || [];
        const audioFormats = formats.filter(
          (f: any) => f.mimeType && String(f.mimeType).startsWith('audio/') && f.url
        );
        const bestAudio =
          audioFormats.find((f: any) => String(f.mimeType).includes('audio/mp4')) ||
          audioFormats[0];
        if (bestAudio && bestAudio.url) {
          return {
            streamUrl: String(bestAudio.url),
            duration: bestAudio.approxDurationMs
              ? Math.round(Number(bestAudio.approxDurationMs) / 1000)
              : targetDuration,
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return { streamUrl: null, duration: targetDuration };
}

function parseLrcText(lrcContent: string): LyricLine[] {
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

export async function resolveLyricsInApk(
  title: string,
  artist: string,
  duration: number
): Promise<{ lines: LyricLine[]; source: string }> {
  const cleanTitle = title.replace(/\s*\(.*?\)/g, '').replace(/\s*\[.*?\]/g, '').trim();
  const cleanArtist = artist.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
  const query = `${cleanTitle || title} ${cleanArtist}`.trim();

  try {
    const res = await fetch(`/api/lrclib?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const items = await res.json();
      if (Array.isArray(items) && items.length > 0) {
        const synced = items.filter(
          (i: any) => i.syncedLyrics && String(i.syncedLyrics).trim().length > 0
        );
        if (synced.length > 0) {
          synced.sort((a: any, b: any) => {
            const diffA = Math.abs((Number(a.duration) || duration) - duration);
            const diffB = Math.abs((Number(b.duration) || duration) - duration);
            return diffA - diffB;
          });
          const parsed = parseLrcText(String(synced[0].syncedLyrics));
          if (parsed.length >= 4) {
            return { lines: parsed, source: 'lrclib-synced' };
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return { lines: [], source: 'none' };
}
