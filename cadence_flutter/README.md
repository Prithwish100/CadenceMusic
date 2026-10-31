# Cadence Flutter — Experimental Native Mobile Rebuild

An independent, modular native Flutter application (`cadence_flutter`) recreating the exact visual identity, interactions, and playback architecture of the live **Cadence** music application.

---

## 1. Non-Interference & Isolation Guarantees

This experimental project is **100% isolated** from the live production Cadence web app, PWA, backend, and Android APK:

| Property | Production Cadence App | Experimental Cadence Flutter Build |
| :--- | :--- | :--- |
| **Android Package ID** | `app.cadence.player` | `app.cadence.flutter.test` |
| **App Launcher Name** | `Cadence` | `Cadence Exp` |
| **Signing Keystore** | `android/keystore/cadence-release.keystore` | `cadence_flutter/android/keystore/cadence-flutter-test.keystore` |
| **Notification Channel** | `cadence_media_player_channel` (ID `8801`) | `cadence_flutter_exp_channel` (ID `8901`) |
| **Local Storage Keys** | `cadence_guest_*` | `cadence_flutter_exp_*` |
| **Side-by-Side Install** | Installed as main app | Installs alongside `Cadence` without conflict |

---

## 2. Playback Architecture Investigation & Implementation (No `yt-dlp`)

### How the Existing Cadence Application Plays Music
Inspection of `src/context/PlayerContext.tsx`, `server.ts`, and `android/src/app/cadence/player/` confirmed that Cadence **does NOT use `yt-dlp`**. Instead, it uses a modular hybrid playback architecture:

1. **YouTube Video ID Discovery**:
   - Searches YouTube's music catalog (`ytInitialData` parsing + curated YouTube video IDs such as `1w7OgIMMRc4`, `v2H4l9RpkwM`, `5qF_qbaWt3Q`, `klZEkqJmixk`, `3YxaaGgTQYM`, `Wj7lL6eDOqc`).
2. **Primary Direct Audio Stream Engine**:
   - Resolves direct `audio/mp4` (M4A/AAC) streams via YouTube's Innertube `ANDROID_VR` `/youtubei/v1/player` endpoint and JioSaavn's 320kbps stream resolver.
   - Plays streams through the native platform `MediaPlayer` / `just_audio` + `audio_service` foreground service (`CadenceAudioService`) with local `.m4a` disk pre-caching of upcoming queue tracks.
3. **Official YouTube Embedded IFrame Fallback (`YT.Player`)**:
   - Embeds `https://www.youtube.com/iframe_api` (`YT.Player`) when a direct audio stream is unavailable or when video mode is active.
4. **Line-Synchronized Lyrics**:
   - Queries `https://lrclib.net/api/search` and parses `[mm:ss.xx]` LRC timestamps with duration-matching (`0.15s` visual reaction lead).

### Platform & Policy Restrictions (YouTube Official Player vs Background Audio)
- **Official YouTube IFrame Player (`YT.Player`) Restrictions**:
  - YouTube's official embedded IFrame player enforces platform policies that automatically pause video embeds when a standard browser tab or unprivileged WebView is minimized or the screen is locked.
- **How Background Playback & Lock-Screen Controls Work**:
  - Background playback, audio focus ducking, lock-screen `MediaSession` transport controls, and Bluetooth/headphone buttons (`MediaControl.skipToNext`, `MediaControl.skipToPrevious`, `MediaControl.play`, `MediaControl.pause`) are powered by the native foreground `CadenceAudioService` (`FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK`) playing resolved AAC/M4A audio streams with local disk caching.
- **Modular Source Interface**:
  - `lib/services/playback/playback_source.dart` defines the abstract `PlaybackSource` interface (`CadenceHybridPlaybackSource`), allowing future music providers to be added without modifying the UI or Riverpod state management.

---

## 3. Native Google Account Picker (Android & iOS)

- **Android**:
  - Uses Android's native OS Google Account Chooser (`AccountManager.newChooseAccountIntent` filtered to `"com.google"` accounts + Android Credential Manager `androidx.credentials:credentials-play-services-auth` & `GoogleIdTokenCredential` in `lib/services/google_auth_service.dart`).
  - Tapping **Log in** or **Continue with Google** opens the genuine Android system account picker sheet — never an imitated custom Flutter dialog.
- **iOS**:
  - Uses `google_sign_in` (`GIDSignIn`) to trigger the native iOS system authentication sheet.
- **Test Configuration Placeholders (`lib/config/test_config.dart`)**:
  - No production OAuth secrets are hardcoded. Pass your test OAuth Client IDs at build time:
    ```bash
    flutter run \
      --dart-define=CADENCE_TEST_GOOGLE_ANDROID_CLIENT_ID=YOUR_TEST_ANDROID_ID.apps.googleusercontent.com \
      --dart-define=CADENCE_TEST_GOOGLE_WEB_CLIENT_ID=YOUR_TEST_WEB_ID.apps.googleusercontent.com \
      --dart-define=CADENCE_TEST_GOOGLE_IOS_CLIENT_ID=YOUR_TEST_IOS_ID.apps.googleusercontent.com
    ```

---

## 4. Project Architecture

```text
cadence_flutter/
├── pubspec.yaml                  # Flutter, Riverpod, GoRouter, just_audio, audio_service, google_sign_in
├── lib/
│   ├── main.dart                 # App entry point + ProviderScope + Portrait lock
│   ├── config/
│   │   └── test_config.dart      # Isolated test placeholders (OAuth, API URLs, app ID)
│   ├── theme/
│   │   └── cadence_theme.dart    # Exact Cadence colors (#0A0A0C, #121216, #E25822, #F5F5F7)
│   ├── models/
│   │   ├── track.dart
│   │   ├── playlist.dart
│   │   ├── lyric_line.dart
│   │   └── user_profile.dart
│   ├── data/
│   │   └── curated_catalog.dart  # Curated tracks, Genre tiles, Preset synced lyrics
│   ├── services/
│   │   ├── playback/
│   │   │   └── playback_source.dart # Modular PlaybackSource + CadenceAudioHandler
│   │   ├── lyrics_service.dart   # LRCLIB [mm:ss.xx] parser & duration matcher
│   │   ├── search_service.dart   # YouTube Music search & autocomplete predictions
│   │   └── google_auth_service.dart # Native Android AccountPicker / Credential Manager & iOS GIDSignIn
│   ├── providers/
│   │   ├── player_provider.dart  # Riverpod PlayerNotifier (queue, shuffle, repeat, lyrics, sleep timer)
│   │   └── library_provider.dart # Riverpod LibraryNotifier (likes, playlists, recently played, user)
│   ├── router/
│   │   └── app_router.dart       # GoRouter shell with top header, bottom nav & persistent mini-player
│   ├── screens/
│   │   ├── home_screen.dart
│   │   ├── search_screen.dart
│   │   └── library_and_detail_screens.dart
│   └── widgets/
│       ├── track_artwork.dart
│       ├── track_row.dart
│       ├── mini_player_bar.dart
│       ├── maximized_player_sheet.dart
│       └── modals_and_drawers.dart
├── android/                      # Native Android config (app.cadence.flutter.test, SDK 36)
├── ios/                          # Native iOS config (Info.plist with background audio & GIDSignIn)
└── test/
    └── widget_test.dart          # Widget test suite
```
