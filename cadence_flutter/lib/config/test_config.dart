/// Test & Environment Configuration for Cadence Flutter (Experimental Build)
///
/// IMPORTANT:
/// This experimental Flutter build uses a separate Android application ID
/// (`app.cadence.flutter.test`), separate local storage namespace, and test
/// configuration placeholders so it never modifies or interferes with the
/// live production Cadence web app, PWA, or Android APK (`app.cadence.player`).
///
/// Zero secrets are hardcoded in this file. Supply custom test values via
/// `--dart-define` when running `flutter build apk` or `flutter run`.
class CadenceTestConfig {
  CadenceTestConfig._();

  /// Separate Android Application ID for side-by-side installation alongside
  /// the production `app.cadence.player` APK.
  static const String applicationId = 'app.cadence.flutter.test';

  /// Version string for this Flutter build.
  static const String appVersion = 'v1.4.0 (Build 5)';

  /// Optional test backend URL for `/api/music/search`, `/api/music/audio-stream`,
  /// `/api/lyrics`, and `/api/playlist/import`.
  ///
  /// Defaults to empty (direct client-side YouTube Innertube + JioSaavn + LRCLIB
  /// resolution without touching production servers).
  /// Override with: `--dart-define=CADENCE_TEST_API_BASE_URL=https://your-test-server.example.com`
  static const String testApiBaseUrl = String.fromEnvironment(
    'CADENCE_TEST_API_BASE_URL',
    defaultValue: '',
  );

  /// Google OAuth 2.0 Android Client ID placeholder (configured in Google Cloud
  /// Console for package `app.cadence.flutter.test` and your test keystore SHA-1).
  /// Override with: `--dart-define=CADENCE_TEST_GOOGLE_ANDROID_CLIENT_ID=...`
  static const String googleAndroidClientId = String.fromEnvironment(
    'CADENCE_TEST_GOOGLE_ANDROID_CLIENT_ID',
    defaultValue: 'YOUR_TEST_ANDROID_CLIENT_ID.apps.googleusercontent.com',
  );

  /// Google OAuth 2.0 Web / Server Client ID placeholder used by Android
  /// Credential Manager (`GetGoogleIdOption.Builder().setServerClientId(...)`)
  /// to request an ID token via the native Google Account Picker bottom sheet.
  /// Override with: `--dart-define=CADENCE_TEST_GOOGLE_WEB_CLIENT_ID=...`
  static const String googleServerClientId = String.fromEnvironment(
    'CADENCE_TEST_GOOGLE_WEB_CLIENT_ID',
    defaultValue: 'YOUR_TEST_WEB_SERVER_CLIENT_ID.apps.googleusercontent.com',
  );

  /// Google OAuth 2.0 iOS Client ID placeholder (for `GIDSignIn` on iPhone).
  /// Override with: `--dart-define=CADENCE_TEST_GOOGLE_IOS_CLIENT_ID=...`
  static const String googleIosClientId = String.fromEnvironment(
    'CADENCE_TEST_GOOGLE_IOS_CLIENT_ID',
    defaultValue: 'YOUR_TEST_IOS_CLIENT_ID.apps.googleusercontent.com',
  );

  /// LRCLIB public API endpoint for line-synchronized `[mm:ss.xx]` LRC lyrics.
  static const String lrclibSearchEndpoint = 'https://lrclib.net/api/search';

  /// YouTube Autocomplete Suggestions endpoint (Firefox JSON format).
  static const String youtubeSuggestEndpoint =
      'https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=';

  /// Returns true if the developer has supplied real OAuth Client IDs via `--dart-define`.
  static bool get hasConfiguredOAuthCredentials =>
      !googleServerClientId.startsWith('YOUR_TEST_') ||
      !googleAndroidClientId.startsWith('YOUR_TEST_');
}
