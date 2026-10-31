# Cadence — Music Web Player

Cadence is a responsive, Spotify-inspired music streaming web application powered by YouTube playback, designed with a refined Onyx Black and Mid-Deep Sunset Orange visual identity. It delivers a rich home catalog, music-only YouTube search, full transport controls, a maximizable theater player with interactive click-to-seek time-synchronized lyrics, and hybrid Google Sign-In cloud sync with instant guest mode support.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product and design decisions incorporate your preferences from our clarification step and govern the build:

- **Visual Theme (Confirmed)**: Deep Onyx Black (`#0A0A0C` canvas, `#121216` elevated surfaces) paired with a matte, non-neon Mid-Deep Sunset Orange accent (`#E25822` / `#D94E1F`), crisp warm-white typography, and subtle 1px hairline borders.
- **Creator Attribution & Branding (Confirmed)**: Branded as **Cadence** with a subtle `"Made by Prithwish"` attribution displayed cleanly in the top application bar.
- **Authentication & Library Persistence (Confirmed)**: Supports **Google Sign-In with Cloud Sync** (backed by Firebase Authentication and Cloud Firestore) alongside a seamless **Guest Mode** (backed by local browser storage) so users can like songs and build playlists immediately or sync them permanently to their account.
- **Time-Synchronized Lyrics & Maximizable Player (Confirmed)**: Full-screen maximizable player featuring real-time LRC-synced lyrics with **interactive click-to-seek** on any lyric line, auto-scrolling active verse focus, and toggleable artwork/video display.

---

## 1. Overview & Core Concept

- **What It Does**: Streams music directly from YouTube through a sleek audio-first interface, offering curated home collections, real-time music-filtered search, custom playlist creation, liked song collections, and live time-synced lyrics.
- **Target Audience / Persona**: Music listeners across desktop, tablet, and mobile devices who want a distraction-free, dark-mode streaming deck with synchronized lyrics and persistent playlists.
- **Key Value**: Combines YouTube's vast music catalog with a dedicated, Spotify-grade player workflow—complete with queue control, shuffle/repeat states, and interactive lyric navigation.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Rich Home Experience**: Upon opening Cadence, the user lands on a populated Home view featuring a Sunset-accented Featured Track hero banner, a **Quick Picks** grid of curated tracks, **Trending Now**, and **Sunset Sessions** mixes—every track ready for one-click playback with pre-verified synced lyrics.
2. **Music-Only Search**: Typing in the top search bar queries YouTube specifically for music tracks and songs, filtering out non-music clutter and displaying track artwork, artist name, duration, quick-like button, and an "Add to Playlist" menu.
3. **Standard & Maximizable Player Bar**:
   - **Docked Player Bar**: Pinned to the bottom of the viewport with track info, Like toggle, Shuffle, Previous, Play/Pause, Next, Repeat (Off / All / One), interactive progress scrubber with tabular timestamps, Queue drawer toggle, Volume slider, and a **Maximize Player** trigger.
   - **Maximized Player View**: Expands smoothly to a full-viewport Onyx & Sunset studio view. The left column displays high-resolution album artwork (with an optional switch to view the embedded YouTube music video) and full transport controls; the right column presents **Time-Synchronized Lyrics** that highlight and auto-scroll in sync with the audio. Clicking any lyric line immediately jumps playback to that exact timestamp.
4. **Likes, Playlists & Sign-In**:
   - Clicking the heart icon adds/removes tracks from **Liked Songs**.
   - Users can create custom playlists (with title and description), add/remove songs from any track row or player bar, and replay saved playlists anytime.
   - Signing in with Google automatically merges and syncs Guest Mode likes and playlists into Cloud Firestore.

### Visual Identity & Theme
- **Aesthetic Direction**: Refined Dark Studio Deck — matte onyx surfaces, warm sunset orange focal points, zero neon clutter, and tactile media controls.
- **Color Palette & Mood**:
  - `--background`: `#0A0A0C` (Deep Onyx Black — 60% canvas)
  - `--surface`: `#121216` / `#18181E` (Charcoal Slate structural surfaces — 30%)
  - `--border`: `rgba(255, 255, 255, 0.07)` (Subtle 1px hairline dividers)
  - `--primary`: `#E25822` (Mid-Deep Sunset Orange — 10% accent budget for active play buttons, seek bar fill, active lyric glow, and active navigation states)
  - `--primary-hover`: `#F06A35` (Warm Sunset Highlight)
  - `--text-primary`: `#F5F5F7` (Crisp Alabaster)
  - `--text-muted`: `#94949E` (Warm Muted Gray)
- **Typography & Hierarchy**:
  - **Display & Headings**: `Outfit` (600/700 weight) for brand wordmark, section headers, and maximized track titles.
  - **Body & UI Controls**: `Plus Jakarta Sans` (400/500/600 weight) for track lists, artist names, and lyric lines.
  - **Timestamps & Durations**: `JetBrains Mono` (`tabular-nums`) for track durations, player scrubbers, and lyric line timestamps.
- **Responsive Layout Architecture**:
  - **Desktop (`lg:`)**: 260px left navigation & library sidebar + scrollable main content stage + persistent 88px bottom player deck.
  - **Tablet & Mobile (`< lg`)**: Compact sticky top bar with `"Cadence · Made by Prithwish"`, scrollable content viewport with 44px minimum touch targets, floating mini-player bar, and fixed 4-tab bottom navigation (`Home`, `Search`, `Library`, `Playlists`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Hidden/Toggleable YouTube IFrame Engine with Custom Transport UI**
  - *Chosen Approach*: Drive all audio playback through a persistent YouTube IFrame Player API controller managed by a central React Playback Context, keeping the raw YouTube player hidden during standard listening and exposing a clean toggle inside the Maximized Player when the user wants to watch the video.
  - *Why*: Provides genuine streaming audio, accurate `getCurrentTime()` polling (every 200ms) for smooth lyric synchronization, and native Spotify-like controls.
- **Decision 2: Real Music Search + Synchronized Lyrics API Proxy**
  - *Chosen Approach*: Implement backend Express proxy endpoints (`/api/music/search` and `/api/lyrics`) that fetch music-filtered YouTube results and query LRCLIB for time-synced `.lrc` lyrics, paired with curated fallback tracks and intelligent timestamp interpolation when a rare track lacks external LRC data.
  - *Why*: Guarantees fast, CORS-free music search and ensures time-synchronized lyrics are always visible and interactive for every song.
- **Decision 3: Hybrid Cloud + Guest Library Persistence**
  - *Chosen Approach*: Use Firebase Authentication (Google Sign-In) and Cloud Firestore for authenticated users while mirroring operations to `localStorage` for guest users.
  - *Why*: Lets users test and enjoy playlist creation and song liking immediately without a mandatory login wall, while offering true cloud persistence when signed in.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        CADENCE WEB APPLICATION                             │
│          Top Bar: "Cadence"  ·  "Made by Prithwish"  ·  Search / Auth      │
├──────────────────────┬─────────────────────────────────────────────────────┤
│  NAVIGATION &        │  MAIN CONTENT STAGE                                 │
│  LIBRARY SIDEBAR     │  ┌───────────────────────────────────────────────┐  │
│  (Desktop Sidebar /  │  │ Home View: Sunset Hero + Curated Track Grids  │  │
│   Mobile Bottom Nav) │  ├───────────────────────────────────────────────┤  │
│                      │  │ Search View: Music-Only YouTube Results       │  │
│  • Home              │  ├───────────────────────────────────────────────┤  │
│  • Search            │  │ Liked Songs & Custom Playlist Detail Views    │  │
│  • Liked Songs       │  └───────────────────────────────────────────────┘  │
│  • Custom Playlists  │                                                     │
│  • + New Playlist    │  MAXIMIZABLE FULL-SCREEN PLAYER OVERLAY             │
│                      │  ┌──────────────────────┬────────────────────────┐  │
│                      │  │ Album Art / Video    │ Time-Synced Lyrics     │  │
│                      │  │ + Full Transport     │ (Click Line to Seek)   │  │
│                      │  └──────────────────────┴────────────────────────┘  │
├──────────────────────┴─────────────────────────────────────────────────────┤
│  PERSISTENT BOTTOM PLAYER DECK                                             │
│  [Track Info + Like]   [Shuffle | Prev | Play | Next | Repeat]   [Maximize]│
└──────────────┬───────────────────────────────────────────┬─────────────────┘
               │                                           │
               ▼                                           ▼
┌─────────────────────────────────────┐     ┌────────────────────────────────┐
│  BACKEND EXPRESS API PROXY          │     │  FIREBASE & LOCAL PERSISTENCE  │
│  • GET /api/music/search (YouTube)  │     │  • Google Auth (Popup Sign-In) │
│  • GET /api/lyrics (LRCLIB Synced)  │     │  • Firestore: Likes & Playlists│
│  • YouTube IFrame Player API Bridge │     │  • Guest Mode: localStorage    │
└─────────────────────────────────────┘     └────────────────────────────────┘
```

### Data Model & State
- **Track Entity**: `id` (YouTube video ID), `title`, `artist`, `album`, `duration` (seconds), `thumbnailUrl`, `publishedAt`.
- **LyricLine Entity**: `time` (seconds float), `text` (lyric verse).
- **Playlist Entity**: `id`, `ownerId`, `name`, `description`, `tracks` (bounded list of Track objects), `createdAt`, `updatedAt`.
- **LikedSong Entity**: `id` (track ID), `ownerId`, `track` (Track metadata), `likedAt`.

### Interactive Component & State Mapping
- **Playback Controller (`PlayerContext`)**: Manages `currentTrack`, `queue`, `isPlaying`, `currentTime`, `duration`, `volume`, `isMuted`, `shuffle`, `repeatMode` (`off` | `all` | `one`), and `isMaximized`. Polls the YouTube IFrame player every 200ms while playing to keep the scrubber and active lyric line in lockstep.
- **Interactive Lyrics Engine**: Matches `currentTime` to the active `LyricLine` index (`lines[i].time <= currentTime < lines[i+1].time`), scrolls the active line smoothly into the center of the lyrics viewport, and binds `onClick={() => seekTo(line.time)}` to every lyric line.
- **Library & Playlist Manager**: Exposes `toggleLike(track)`, `createPlaylist(name, description)`, `deletePlaylist(id)`, `addTrackToPlaylist(playlistId, track)`, and `removeTrackFromPlaylist(playlistId, trackId)` with automatic routing to Firestore (when authenticated) or `localStorage` (when in Guest Mode).
