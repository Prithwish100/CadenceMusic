package app.cadence.flutter.test;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.accounts.AccountManagerCallback;
import android.accounts.AccountManagerFuture;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final String TAG = "CadenceAuth";
    private static MainActivity instance;
    private CadenceWebView webView;
    private boolean isMainPageLoaded = false;

    // Duplicate login request lock
    private volatile boolean isSignInInProgress = false;
    private volatile long signInStartedAtMs = 0L;
    private String pendingSessionJsonToDispatch = null;

    private static final int REQUEST_CODE_PICK_GOOGLE_ACCOUNT = 9001;
    private static final String PREFS_NAME = "cadence_flutter_native_auth_prefs";
    private static final String KEY_ACTIVE_SESSION = "active_session_json";
    private static final String KEY_PENDING_OAUTH_SESSION_ID = "pending_oauth_session_id";
    private static final String KEY_CACHED_PROFILE_PREFIX = "cached_profile_";

    private static final String APP_HOST = "cadence.run.place";
    private static final String APP_URL = "https://cadence.run.place/index.html";
    private static final String FIREBASE_API_KEY = "AIzaSyCk6UA1aKICFe3dlWMnCrBCFD4zzPDugDM";
    private static final String FIREBASE_APP_ID = "1:1073976852547:web:37f0960c0226433cdfd4f6";
    private static final String OAUTH_CLIENT_ID = "1073976852547-nlpmgu43qb6hl0qp16ot9e9849pcpolo.apps.googleusercontent.com";
    private static final String FIREBASE_AUTH_HANDLER = "https://solar-team-23rp2.firebaseapp.com/__/auth/handler";

    private final Map<String, String> apiCache = new ConcurrentHashMap<>();
    private final ExecutorService preloadPool = Executors.newFixedThreadPool(4);

    public static class CadenceWebView extends WebView {
        public CadenceWebView(Context context) {
            super(context);
        }

        @Override
        protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(View.VISIBLE);
        }
    }

    /**
     * Sanitized diagnostic logger. Never logs passwords, access tokens, refresh tokens, or ID tokens.
     */
    private void logAuthDiagnostic(String category, String message) {
        Log.i(TAG, "[" + category + "] " + message);
    }

    private SharedPreferences getAuthPrefs() {
        return getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private String generateFirebaseSessionId() {
        String chars = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        String raw = (UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", ""));
        StringBuilder sb = new StringBuilder(20);
        for (int i = 0; i < 20; i++) {
            int idx = Math.abs(raw.charAt(i) * 31 + i * 17) % chars.length();
            sb.append(chars.charAt(idx));
        }
        return sb.toString();
    }

    public static void dispatchMediaAction(final String action, final long seekMs) {
        final MainActivity act = instance;
        if (act == null || act.webView == null) return;
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    String js = "if(window.__cadenceNativeMediaAction){window.__cadenceNativeMediaAction('"
                        + action + "'," + seekMs + ");}";
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        act.webView.evaluateJavascript(js, null);
                    } else {
                        act.webView.loadUrl("javascript:" + js);
                    }
                } catch (Exception ignored) {}
            }
        });
    }

    private void dispatchAuthStateToUi(final String state, final String errorMessage) {
        if (webView == null || !isMainPageLoaded) return;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    String safeState = escapeJson(state != null ? state : "signed_out");
                    String safeErr = errorMessage != null ? "\"" + escapeJson(errorMessage) + "\"" : "null";
                    String js = "if(window.__cadenceSetNativeAuthState){window.__cadenceSetNativeAuthState(\""
                        + safeState + "\"," + safeErr + ");}";
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        webView.evaluateJavascript(js, null);
                    } else {
                        webView.loadUrl("javascript:" + js);
                    }
                } catch (Exception ignored) {}
            }
        });
    }

    private String decodeJwtPayload(String jwt) {
        if (jwt == null || jwt.isEmpty()) return null;
        try {
            String[] parts = jwt.split("\\.");
            if (parts.length < 2) return null;
            byte[] decoded = Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
            return new String(decoded, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    private String extractJsonStringClaim(String json, String key) {
        if (json == null || key == null) return "";
        try {
            Pattern p = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
            Matcher m = p.matcher(json);
            if (m.find()) {
                String raw = m.group(1);
                if (raw != null) {
                    return raw
                        .replace("\\/", "/")
                        .replace("\\\"", "\"")
                        .replace("\\u003d", "=")
                        .replace("\\u0026", "&")
                        .trim();
                }
            }
        } catch (Exception ignored) {}
        return "";
    }

    private String deriveCleanFirstName(String givenName, String fullName, String email) {
        if (givenName != null && !givenName.trim().isEmpty()) {
            return givenName.trim().split("\\s+")[0];
        }
        if (fullName != null && !fullName.trim().isEmpty()) {
            return fullName.trim().split("\\s+")[0];
        }
        if (email != null && email.contains("@")) {
            String local = email.split("@")[0].replaceAll("[0-9]+$", "");
            String[] tokens = local.split("[._-]+");
            String first = tokens.length > 0 ? tokens[0] : local;
            String lower = first.toLowerCase();
            String[] commonSurnames = new String[]{
                "dey", "roy", "das", "sen", "kumar", "sharma", "singh", "gupta",
                "verma", "patel", "shah", "bose", "ghosh", "mukherjee", "banerjee",
                "chatterjee", "ganguly", "mitra", "saha", "paul", "pal", "dutta"
            };
            for (String surname : commonSurnames) {
                if (lower.length() > surname.length() + 2 && lower.endsWith(surname)) {
                    first = first.substring(0, first.length() - surname.length());
                    break;
                }
            }
            if (!first.isEmpty()) {
                return Character.toUpperCase(first.charAt(0)) + first.substring(1).toLowerCase();
            }
        }
        return "Listener";
    }

    private String deriveCleanFullName(String givenName, String fullName, String email) {
        if (fullName != null && !fullName.trim().isEmpty()) {
            return fullName.trim();
        }
        if (email != null && email.contains("@")) {
            String local = email.split("@")[0].replaceAll("[0-9]+$", "");
            String[] tokens = local.split("[._-]+");
            if (tokens.length >= 2) {
                StringBuilder sb = new StringBuilder();
                for (String t : tokens) {
                    if (!t.isEmpty()) {
                        if (sb.length() > 0) sb.append(" ");
                        sb.append(Character.toUpperCase(t.charAt(0))).append(t.substring(1).toLowerCase());
                    }
                }
                if (sb.length() > 0) return sb.toString();
            }
            String lower = local.toLowerCase();
            String[] commonSurnames = new String[]{
                "dey", "roy", "das", "sen", "kumar", "sharma", "singh", "gupta",
                "verma", "patel", "shah", "bose", "ghosh", "mukherjee", "banerjee",
                "chatterjee", "ganguly", "mitra", "saha", "paul", "pal", "dutta"
            };
            for (String surname : commonSurnames) {
                if (lower.length() > surname.length() + 2 && lower.endsWith(surname)) {
                    String f = local.substring(0, local.length() - surname.length());
                    String fCap = Character.toUpperCase(f.charAt(0)) + f.substring(1).toLowerCase();
                    String sCap = Character.toUpperCase(surname.charAt(0)) + surname.substring(1).toLowerCase();
                    return fCap + " " + sCap;
                }
            }
        }
        return deriveCleanFirstName(givenName, fullName, email);
    }

    /**
     * Generates a crisp Google-style SVG data-URI avatar badge when no remote Google photo URL
     * has been cached yet, ensuring a real profile image is always rendered.
     */
    private String buildFallbackAvatarDataUri(String nameOrEmail) {
        String clean = (nameOrEmail != null && !nameOrEmail.trim().isEmpty()) ? nameOrEmail.trim() : "C";
        char initial = Character.toUpperCase(clean.charAt(0));
        if (!Character.isLetterOrDigit(initial)) initial = 'C';
        String svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'>"
            + "<defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'>"
            + "<stop offset='0%' stop-color='#E25822'/>"
            + "<stop offset='100%' stop-color='#9A2E14'/>"
            + "</linearGradient></defs>"
            + "<circle cx='60' cy='60' r='60' fill='url(#g)'/>"
            + "<circle cx='60' cy='60' r='56' fill='none' stroke='rgba(255,255,255,0.22)' stroke-width='2'/>"
            + "<text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' "
            + "fill='#FFFFFF' font-family='sans-serif' font-weight='700' font-size='54'>"
            + initial
            + "</text></svg>";
        String b64 = Base64.encodeToString(svg.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
        return "data:image/svg+xml;base64," + b64;
    }

    private String buildSessionJson(
        String uid,
        String email,
        String displayName,
        String firstName,
        String photoUrl,
        String idToken,
        String accessToken,
        String refreshToken,
        String authMethod
    ) {
        String cleanEmail = email != null ? email.trim() : "";
        String cleanFirst = deriveCleanFirstName(firstName, displayName, cleanEmail);
        String cleanFull = deriveCleanFullName(cleanFirst, displayName, cleanEmail);
        String cleanUid = (uid != null && !uid.trim().isEmpty())
            ? uid.trim()
            : ("google_" + Math.abs(cleanEmail.toLowerCase().hashCode()));
        String cleanPhoto = (photoUrl != null && !photoUrl.trim().isEmpty())
            ? photoUrl.trim()
            : buildFallbackAvatarDataUri(cleanFirst);

        return "{"
            + "\"uid\":\"" + escapeJson(cleanUid) + "\","
            + "\"email\":\"" + escapeJson(cleanEmail) + "\","
            + "\"displayName\":\"" + escapeJson(cleanFull) + "\","
            + "\"firstName\":\"" + escapeJson(cleanFirst) + "\","
            + "\"photoURL\":\"" + escapeJson(cleanPhoto) + "\","
            + "\"idToken\":\"" + escapeJson(idToken != null ? idToken : "") + "\","
            + "\"accessToken\":\"" + escapeJson(accessToken != null ? accessToken : "") + "\","
            + "\"refreshToken\":\"" + escapeJson(refreshToken != null ? refreshToken : "") + "\","
            + "\"authMethod\":\"" + escapeJson(authMethod != null ? authMethod : "external_browser_oauth") + "\","
            + "\"isNativeSession\":true,"
            + "\"authenticatedAt\":" + System.currentTimeMillis()
            + "}";
    }

    private void evaluateSessionJsOnWebView(final String sessionJson) {
        if (webView == null || sessionJson == null || sessionJson.isEmpty()) return;
        try {
            String js = "window.__cadencePendingSession=" + sessionJson + ";"
                + "if(window.__cadenceEstablishNativeSession){window.__cadenceEstablishNativeSession(" + sessionJson + ");}"
                + "try{window.dispatchEvent(new CustomEvent('cadence-native-auth',{detail:" + sessionJson + "}));}catch(e){}";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                webView.evaluateJavascript(js, null);
            } else {
                webView.loadUrl("javascript:" + js);
            }
        } catch (Exception e) {
            logAuthDiagnostic("UI_DISPATCH_ERROR", "Failed dispatching session to UI: " + e.getMessage());
        }
    }

    private void persistAndEstablishSession(final String sessionJson) {
        if (sessionJson == null || sessionJson.isEmpty()) return;
        isSignInInProgress = false;
        pendingSessionJsonToDispatch = sessionJson;

        try {
            String email = extractJsonStringClaim(sessionJson, "email").toLowerCase();
            SharedPreferences.Editor editor = getAuthPrefs().edit();
            editor.putString(KEY_ACTIVE_SESSION, sessionJson);
            if (!email.isEmpty()) {
                editor.putString(KEY_CACHED_PROFILE_PREFIX + email, sessionJson);
            }
            editor.commit();
            logAuthDiagnostic("SESSION_PERSISTED", "Saved authenticated session for account (method="
                + extractJsonStringClaim(sessionJson, "authMethod") + ")");
        } catch (Exception e) {
            logAuthDiagnostic("SESSION_PERSIST_ERROR", "Failed to save session to SharedPreferences: " + e.getMessage());
        }

        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (webView == null) return;
                evaluateSessionJsOnWebView(sessionJson);
                webView.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        evaluateSessionJsOnWebView(sessionJson);
                    }
                }, 250);
                webView.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        evaluateSessionJsOnWebView(sessionJson);
                    }
                }, 900);
                logAuthDiagnostic("STATE_AUTHENTICATED", "Dispatched authenticated session to Cadence state manager");
            }
        });
    }

    /**
     * Queries Google's OAuth2 v3 userinfo endpoint when an accessToken is available,
     * and upgrades the active session with the user's real Google name and profile photo URL.
     */
    private void fetchGoogleUserInfoAndUpgradeSession(
        final String fallbackEmail,
        final String idToken,
        final String accessToken,
        final String authMethod
    ) {
        preloadPool.submit(new Runnable() {
            @Override
            public void run() {
                String jwtJson = decodeJwtPayload(idToken);
                String email = extractJsonStringClaim(jwtJson, "email");
                String fullName = extractJsonStringClaim(jwtJson, "name");
                String givenName = extractJsonStringClaim(jwtJson, "given_name");
                String picture = extractJsonStringClaim(jwtJson, "picture");
                String sub = extractJsonStringClaim(jwtJson, "sub");

                if (accessToken != null && !accessToken.trim().isEmpty()) {
                    try {
                        String infoJson = fetchHttpWithBearer(
                            "https://www.googleapis.com/oauth2/v3/userinfo",
                            accessToken.trim()
                        );
                        if (infoJson != null && infoJson.contains("{")) {
                            String uEmail = extractJsonStringClaim(infoJson, "email");
                            String uName = extractJsonStringClaim(infoJson, "name");
                            String uGiven = extractJsonStringClaim(infoJson, "given_name");
                            String uPic = extractJsonStringClaim(infoJson, "picture");
                            String uSub = extractJsonStringClaim(infoJson, "sub");
                            if (!uEmail.isEmpty()) email = uEmail;
                            if (!uName.isEmpty()) fullName = uName;
                            if (!uGiven.isEmpty()) givenName = uGiven;
                            if (!uPic.isEmpty()) picture = uPic;
                            if (!uSub.isEmpty()) sub = uSub;
                            logAuthDiagnostic("GOOGLE_USERINFO_OK", "Resolved Google profile & photo from userinfo endpoint");
                        }
                    } catch (Exception e) {
                        logAuthDiagnostic("GOOGLE_USERINFO_WARN", "Userinfo lookup error: " + e.getMessage());
                    }
                }

                if (email.isEmpty() && fallbackEmail != null) {
                    email = fallbackEmail.trim();
                }

                // Preserve any previously cached real Google photo URL for this email if current response omitted it
                if ((picture.isEmpty() || picture.startsWith("data:")) && !email.isEmpty()) {
                    String cached = getAuthPrefs().getString(KEY_CACHED_PROFILE_PREFIX + email.toLowerCase(), null);
                    if (cached != null) {
                        String cachedPic = extractJsonStringClaim(cached, "photoURL");
                        if (cachedPic.startsWith("http")) {
                            picture = cachedPic;
                        }
                        if (fullName.isEmpty()) {
                            fullName = extractJsonStringClaim(cached, "displayName");
                        }
                        if (givenName.isEmpty()) {
                            givenName = extractJsonStringClaim(cached, "firstName");
                        }
                    }
                }

                String sessionJson = buildSessionJson(
                    sub,
                    email,
                    fullName,
                    givenName,
                    picture,
                    idToken,
                    accessToken,
                    "",
                    authMethod
                );
                persistAndEstablishSession(sessionJson);
            }
        });
    }

    /**
     * Launches Android's native system Google Account Chooser when explicitly requested.
     */
    private void launchNativeGoogleAccountChooser() {
        long now = System.currentTimeMillis();
        if (isSignInInProgress && (now - signInStartedAtMs) < 8000L) {
            logAuthDiagnostic("DUPLICATE_REQUEST_BLOCKED", "Sign-in already in progress; ignoring duplicate tap");
            return;
        }
        isSignInInProgress = true;
        signInStartedAtMs = now;
        dispatchAuthStateToUi("signing_in", null);
        logAuthDiagnostic("NATIVE_SIGNIN_START", "Launching Android native Google account chooser (package=app.cadence.flutter.test)");

        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Intent pickerIntent;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        pickerIntent = AccountManager.newChooseAccountIntent(
                            null,
                            null,
                            new String[]{"com.google"},
                            null,
                            null,
                            null,
                            null
                        );
                    } else {
                        pickerIntent = AccountManager.newChooseAccountIntent(
                            null,
                            null,
                            new String[]{"com.google"},
                            false,
                            null,
                            null,
                            null,
                            null
                        );
                    }
                    startActivityForResult(pickerIntent, REQUEST_CODE_PICK_GOOGLE_ACCOUNT);
                } catch (Exception e) {
                    logAuthDiagnostic("NATIVE_CHOOSER_UNAVAILABLE", "Native chooser unavailable (" + e.getMessage() + "); falling back to external browser OAuth");
                    isSignInInProgress = false;
                    launchExternalBrowserOAuthFlow();
                }
            }
        });
    }

    /**
     * PRIMARY EXTERNAL BROWSER SOLUTION: External Browser OAuth 2.0 Authorization Code Flow (CODE_FLOW)
     * Opens Chrome Custom Tabs / System Browser (never an embedded WebView), completes Google OAuth,
     * redirects back to `app.cadence.flutter.test` via registered deep link, exchanges the authorization
     * code with Google IdentityToolkit `verifyAssertion`, and immediately signs the user in inside the app.
     */
    private void launchExternalBrowserOAuthFlow() {
        long now = System.currentTimeMillis();
        isSignInInProgress = true;
        signInStartedAtMs = now;
        dispatchAuthStateToUi("signing_in", null);

        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    String sessionId = generateFirebaseSessionId();
                    String eventId = "evt_" + System.currentTimeMillis();
                    getAuthPrefs().edit().putString(KEY_PENDING_OAUTH_SESSION_ID, sessionId).commit();

                    String oauthHandlerUrl = FIREBASE_AUTH_HANDLER
                        + "?apiKey=" + URLEncoder.encode(FIREBASE_API_KEY, "UTF-8")
                        + "&authType=signInWithRedirect"
                        + "&providerId=google.com"
                        + "&scopes=" + URLEncoder.encode("openid,email,profile", "UTF-8")
                        + "&ibi=" + URLEncoder.encode("app.cadence.flutter.test", "UTF-8")
                        + "&clientId=" + URLEncoder.encode(OAUTH_CLIENT_ID, "UTF-8")
                        + "&appId=" + URLEncoder.encode(FIREBASE_APP_ID, "UTF-8")
                        + "&sessionId=" + URLEncoder.encode(sessionId, "UTF-8")
                        + "&eventId=" + URLEncoder.encode(eventId, "UTF-8")
                        + "&v=2.20.9"
                        + "&customParameters=" + URLEncoder.encode("{\"prompt\":\"select_account\"}", "UTF-8");

                    logAuthDiagnostic("BROWSER_OAUTH_START", "Opening external browser / Chrome Custom Tabs for OAuth CODE_FLOW callback");

                    Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(oauthHandlerUrl));
                    Bundle extras = new Bundle();
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                        extras.putBinder("android.support.customtabs.extra.SESSION", null);
                    }
                    extras.putInt("android.support.customtabs.extra.TOOLBAR_COLOR", Color.parseColor("#0A0A0C"));
                    browserIntent.putExtras(extras);

                    try {
                        startActivity(browserIntent);
                    } catch (Exception inner) {
                        browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(browserIntent);
                    }
                } catch (Exception e) {
                    isSignInInProgress = false;
                    logAuthDiagnostic("BROWSER_OAUTH_ERROR", "Failed to launch external browser for OAuth: " + e.getMessage());
                    dispatchAuthStateToUi("auth_failed", "Could not open external browser for Google Sign-In: " + e.getMessage());
                }
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_CODE_PICK_GOOGLE_ACCOUNT) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                final String accountName = data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME);
                if (accountName != null && !accountName.trim().isEmpty()) {
                    final String email = accountName.trim();
                    logAuthDiagnostic("NATIVE_ACCOUNT_SELECTED", "User selected Google account in native chooser");

                    String cachedJson = getAuthPrefs().getString(KEY_CACHED_PROFILE_PREFIX + email.toLowerCase(), null);
                    String cachedFull = extractJsonStringClaim(cachedJson, "displayName");
                    String cachedFirst = extractJsonStringClaim(cachedJson, "firstName");
                    String cachedPhoto = extractJsonStringClaim(cachedJson, "photoURL");

                    String initialFirst = !cachedFirst.isEmpty() ? cachedFirst : deriveCleanFirstName(null, null, email);
                    String initialFull = !cachedFull.isEmpty() ? cachedFull : deriveCleanFullName(initialFirst, null, email);
                    String initialPhoto = !cachedPhoto.isEmpty() ? cachedPhoto : buildFallbackAvatarDataUri(initialFirst);

                    String immediateSession = buildSessionJson(
                        "google_" + Math.abs(email.toLowerCase().hashCode()),
                        email,
                        initialFull,
                        initialFirst,
                        initialPhoto,
                        "",
                        "",
                        "",
                        "android_credential_manager"
                    );
                    persistAndEstablishSession(immediateSession);

                    try {
                        Account account = new Account(email, "com.google");
                        String scope = "oauth2:https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";
                        AccountManager.get(this).getAuthToken(
                            account,
                            scope,
                            null,
                            this,
                            new AccountManagerCallback<Bundle>() {
                                @Override
                                public void run(AccountManagerFuture<Bundle> future) {
                                    preloadPool.submit(new Runnable() {
                                        @Override
                                        public void run() {
                                            try {
                                                Bundle bundle = future.getResult(8, TimeUnit.SECONDS);
                                                if (bundle != null) {
                                                    String accessToken = bundle.getString(AccountManager.KEY_AUTHTOKEN);
                                                    if (accessToken != null && !accessToken.isEmpty()) {
                                                        logAuthDiagnostic("NATIVE_OAUTH_TOKEN_OK", "Obtained OAuth token from AccountManager; upgrading profile");
                                                        fetchGoogleUserInfoAndUpgradeSession(
                                                            email,
                                                            null,
                                                            accessToken,
                                                            "android_credential_manager"
                                                        );
                                                    }
                                                }
                                            } catch (Exception e) {
                                                logAuthDiagnostic("NATIVE_TOKEN_FALLBACK", "Using native account session (OAuth token upgrade skipped: " + e.getClass().getSimpleName() + ")");
                                            }
                                        }
                                    });
                                }
                            },
                            null
                        );
                    } catch (Exception e) {
                        logAuthDiagnostic("ACCOUNT_MANAGER_INFO", "AccountManager token query skipped: " + e.getMessage());
                    }
                    return;
                }
            }

            isSignInInProgress = false;
            logAuthDiagnostic("USER_CANCELLED", "User dismissed native Google account chooser (resultCode=" + resultCode + ")");
            String existingSession = getAuthPrefs().getString(KEY_ACTIVE_SESSION, null);
            if (existingSession != null && !existingSession.isEmpty()) {
                dispatchAuthStateToUi("authenticated", null);
            } else {
                dispatchAuthStateToUi("signed_out", null);
            }
        }
    }

    /**
     * Exchanges the OAuth 2.0 callback URI received from Chrome Custom Tabs / external browser with
     * Google IdentityToolkit's `verifyAssertion` endpoint and establishes the authenticated session.
     */
    private void exchangeOAuthCallbackWithIdentityToolkit(final String requestUri, final String sessionId) {
        preloadPool.submit(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    logAuthDiagnostic("OAUTH_CODE_EXCHANGE", "Exchanging OAuth callback URI with IdentityToolkit verifyAssertion");
                    URL url = new URL("https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyAssertion?key=" + FIREBASE_API_KEY);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(10000);
                    conn.setRequestProperty("Content-Type", "application/json");

                    String payload = "{"
                        + "\"requestUri\":\"" + escapeJson(requestUri) + "\","
                        + (sessionId != null && !sessionId.isEmpty() ? "\"sessionId\":\"" + escapeJson(sessionId) + "\"," : "")
                        + "\"returnSecureToken\":true,"
                        + "\"returnIdpCredential\":true"
                        + "}";

                    OutputStream os = conn.getOutputStream();
                    os.write(payload.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                    os.close();

                    int code = conn.getResponseCode();
                    InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
                    StringBuilder sb = new StringBuilder();
                    if (is != null) {
                        BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                        String line;
                        while ((line = reader.readLine()) != null) {
                            sb.append(line);
                        }
                        reader.close();
                    }
                    String resp = sb.toString();

                    if (code >= 200 && code < 300 && resp.contains("{")) {
                        String uid = extractJsonStringClaim(resp, "localId");
                        String email = extractJsonStringClaim(resp, "email");
                        String displayName = extractJsonStringClaim(resp, "displayName");
                        if (displayName.isEmpty()) {
                            displayName = extractJsonStringClaim(resp, "fullName");
                        }
                        String firstName = extractJsonStringClaim(resp, "firstName");
                        String photoUrl = extractJsonStringClaim(resp, "photoUrl");
                        String oauthIdToken = extractJsonStringClaim(resp, "oauthIdToken");
                        String firebaseIdToken = extractJsonStringClaim(resp, "idToken");
                        String oauthAccessToken = extractJsonStringClaim(resp, "oauthAccessToken");
                        String refreshToken = extractJsonStringClaim(resp, "refreshToken");

                        String jwtPayload = decodeJwtPayload(!oauthIdToken.isEmpty() ? oauthIdToken : firebaseIdToken);
                        if (jwtPayload != null) {
                            if (email.isEmpty()) email = extractJsonStringClaim(jwtPayload, "email");
                            if (displayName.isEmpty()) displayName = extractJsonStringClaim(jwtPayload, "name");
                            if (firstName.isEmpty()) firstName = extractJsonStringClaim(jwtPayload, "given_name");
                            if (photoUrl.isEmpty()) photoUrl = extractJsonStringClaim(jwtPayload, "picture");
                            if (uid.isEmpty()) uid = extractJsonStringClaim(jwtPayload, "sub");
                        }

                        String effectiveIdToken = !oauthIdToken.isEmpty() ? oauthIdToken : firebaseIdToken;
                        String sessionJson = buildSessionJson(
                            uid,
                            email,
                            displayName,
                            firstName,
                            photoUrl,
                            effectiveIdToken,
                            oauthAccessToken,
                            refreshToken,
                            "external_browser_oauth_pkce"
                        );
                        persistAndEstablishSession(sessionJson);

                        if (!oauthAccessToken.isEmpty() && (photoUrl.isEmpty() || displayName.isEmpty())) {
                            fetchGoogleUserInfoAndUpgradeSession(email, effectiveIdToken, oauthAccessToken, "external_browser_oauth_pkce");
                        }
                    } else if (sessionId != null && !sessionId.isEmpty()) {
                        // Retry once without sessionId in case browser regenerated sessionId
                        exchangeOAuthCallbackWithIdentityToolkit(requestUri, "");
                    } else {
                        isSignInInProgress = false;
                        String errMsg = extractJsonStringClaim(resp, "message");
                        logAuthDiagnostic("BACKEND_VALIDATION_ERROR", "IdentityToolkit verifyAssertion returned HTTP " + code + " (" + errMsg + ")");
                        dispatchAuthStateToUi("auth_failed", "Google OAuth validation failed (" + (errMsg.isEmpty() ? "HTTP " + code : errMsg) + "). Please try again.");
                    }
                } catch (Exception e) {
                    isSignInInProgress = false;
                    logAuthDiagnostic("NETWORK_ERROR", "OAuth code exchange failed: " + e.getMessage());
                    dispatchAuthStateToUi("auth_failed", "Network error while verifying Google login. Check your connection and try again.");
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        });
    }

    /**
     * Handles deep-link OAuth callbacks from:
     * 1. `com.googleusercontent.apps.1073976852547-nlpmgu43qb6hl0qp16ot9e9849pcpolo://firebaseauth/link?deep_link_id=...`
     * 2. `app-1-1073976852547-web-37f0960c0226433cdfd4f6://firebaseauth/link?deep_link_id=...`
     * 3. `cadence-flutter://auth?id_token=...&access_token=...` or `cadence://auth?id_token=...&access_token=...`
     * 4. `app.cadence.flutter.test://oauth2redirect?...`
     */
    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;

        String extraLink = intent.getStringExtra("link");
        if (extraLink != null && !extraLink.isEmpty() && (extraLink.contains("code=") || extraLink.contains("state="))) {
            String savedSessionId = getAuthPrefs().getString(KEY_PENDING_OAUTH_SESSION_ID, "");
            exchangeOAuthCallbackWithIdentityToolkit(extraLink, savedSessionId);
            return;
        }

        Uri data = intent.getData();
        if (data == null) return;

        String scheme = data.getScheme() != null ? data.getScheme() : "";
        String host = data.getHost() != null ? data.getHost() : "";
        logAuthDiagnostic("DEEP_LINK_CALLBACK", "Received OAuth callback intent (scheme=" + scheme + ", host=" + host + ")");

        // Case 1: Direct token callback (`cadence://auth` or `cadence-flutter://auth`)
        String idToken = data.getQueryParameter("id_token");
        String accessToken = data.getQueryParameter("access_token");
        String email = data.getQueryParameter("email");
        String name = data.getQueryParameter("name");
        String picture = data.getQueryParameter("picture");

        if ((idToken != null && !idToken.isEmpty()) || (accessToken != null && !accessToken.isEmpty())) {
            fetchGoogleUserInfoAndUpgradeSession(email, idToken, accessToken, "deep_link_callback");
            return;
        } else if (email != null && !email.isEmpty()) {
            String sessionJson = buildSessionJson(
                "google_" + Math.abs(email.toLowerCase().hashCode()),
                email,
                name,
                null,
                picture,
                "",
                "",
                "",
                "deep_link_callback"
            );
            persistAndEstablishSession(sessionJson);
            return;
        }

        // Case 2: Firebase Auth Handler reverse-client-ID / app-ID deep link (`deep_link_id`)
        String deepLinkId = data.getQueryParameter("deep_link_id");
        if (deepLinkId != null && !deepLinkId.isEmpty()) {
            try {
                Uri callbackUri = Uri.parse(deepLinkId);
                String firebaseError = callbackUri.getQueryParameter("firebaseError");
                if (firebaseError != null && !firebaseError.isEmpty()) {
                    isSignInInProgress = false;
                    String errMsg = extractJsonStringClaim(firebaseError, "message");
                    logAuthDiagnostic("OAUTH_CALLBACK_ERROR", "OAuth handler returned error: " + (errMsg.isEmpty() ? firebaseError : errMsg));
                    dispatchAuthStateToUi("auth_failed", errMsg.isEmpty() ? "Google sign-in was cancelled or failed." : errMsg);
                    return;
                }

                String innerLink = callbackUri.getQueryParameter("link");
                if (innerLink != null && !innerLink.isEmpty()) {
                    String savedSessionId = getAuthPrefs().getString(KEY_PENDING_OAUTH_SESSION_ID, "");
                    exchangeOAuthCallbackWithIdentityToolkit(innerLink, savedSessionId);
                    return;
                } else if (deepLinkId.contains("code=")) {
                    String savedSessionId = getAuthPrefs().getString(KEY_PENDING_OAUTH_SESSION_ID, "");
                    exchangeOAuthCallbackWithIdentityToolkit(deepLinkId, savedSessionId);
                    return;
                }
            } catch (Exception e) {
                logAuthDiagnostic("DEEP_LINK_PARSE_ERROR", "Failed parsing deep_link_id: " + e.getMessage());
            }
        }

        // Case 3: Direct link parameter
        String directLink = data.getQueryParameter("link");
        if (directLink != null && (directLink.contains("code=") || directLink.contains("state="))) {
            String savedSessionId = getAuthPrefs().getString(KEY_PENDING_OAUTH_SESSION_ID, "");
            exchangeOAuthCallbackWithIdentityToolkit(directLink, savedSessionId);
            return;
        }

        // Case 4: Direct OAuth code & state query parameters on callback URI
        String codeParam = data.getQueryParameter("code");
        String stateParam = data.getQueryParameter("state");
        if (codeParam != null && !codeParam.isEmpty() && stateParam != null && !stateParam.isEmpty()) {
            String reconstructed = FIREBASE_AUTH_HANDLER + "?" + data.getEncodedQuery();
            String savedSessionId = getAuthPrefs().getString(KEY_PENDING_OAUTH_SESSION_ID, "");
            exchangeOAuthCallbackWithIdentityToolkit(reconstructed, savedSessionId);
        }
    }

    /**
     * Checks persisted session on startup and refreshes Firebase token if a refreshToken is present.
     */
    private void verifyAndRefreshStoredSessionOnStartup() {
        final String storedJson = getAuthPrefs().getString(KEY_ACTIVE_SESSION, null);
        if (storedJson == null || storedJson.isEmpty()) {
            logAuthDiagnostic("STARTUP_RESTORE", "No persisted session found; starting in SIGNED_OUT state");
            return;
        }
        logAuthDiagnostic("STARTUP_RESTORE", "Restored persisted session for account on startup");
        final String refreshToken = extractJsonStringClaim(storedJson, "refreshToken");
        if (refreshToken == null || refreshToken.isEmpty()) {
            return;
        }

        preloadPool.submit(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL("https://securetoken.googleapis.com/v1/token?key=" + FIREBASE_API_KEY);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(6000);
                    conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                    String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refreshToken, "UTF-8");
                    OutputStream os = conn.getOutputStream();
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                    os.close();
                    if (conn.getResponseCode() == 200) {
                        logAuthDiagnostic("TOKEN_REFRESH_OK", "Refreshed Firebase session token on startup");
                    }
                } catch (Exception e) {
                    logAuthDiagnostic("TOKEN_REFRESH_WARN", "Token refresh skipped (offline or non-expiring session)");
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        final String activeSession = pendingSessionJsonToDispatch != null
            ? pendingSessionJsonToDispatch
            : getAuthPrefs().getString(KEY_ACTIVE_SESSION, null);
        if (activeSession != null && !activeSession.isEmpty()) {
            evaluateSessionJsOnWebView(activeSession);
        }
    }

    private void configureMainWebViewSettings(WebView targetWebView) {
        WebSettings settings = targetWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        String defaultUa = settings.getUserAgentString();
        if (defaultUa == null) {
            defaultUa = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
        }
        String cleanUa = defaultUa
            .replace("; wv)", ")")
            .replace("; wv;", ";")
            .replaceAll("Version/\\d+\\.\\d+\\s*", "")
            .trim();
        settings.setUserAgentString(cleanUa + " CadenceAPK/1.4-FlutterExp");

        try {
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                cookieManager.setAcceptThirdPartyCookies(targetWebView, true);
            }
        } catch (Exception ignored) {}
    }

    private void applySystemBarInsets(final View targetView) {
        if (targetView == null) return;
        if (Build.VERSION.SDK_INT >= 30) {
            targetView.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @Override
                public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                    android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                    );
                    v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                    return WindowInsets.CONSUMED;
                }
            });
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        logAuthDiagnostic("STATE_INITIALISING", "Initialising Cadence Flutter Experimental authentication manager");

        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.parseColor("#0A0A0C"));
            window.setNavigationBarColor(Color.parseColor("#0A0A0C"));
        }
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                window.setDecorFitsSystemWindows(false);
                WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    controller.setSystemBarsAppearance(
                        0,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                    );
                }
            } catch (Exception ignored) {}
        }

        if (Build.VERSION.SDK_INT >= 33) {
            try {
                if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1001);
                }
            } catch (Exception ignored) {}
        }

        FrameLayout rootContainer = new FrameLayout(this);
        rootContainer.setBackgroundColor(Color.parseColor("#0A0A0C"));
        applySystemBarInsets(rootContainer);

        webView = new CadenceWebView(this);
        webView.setBackgroundColor(Color.parseColor("#0A0A0C"));
        rootContainer.addView(
            webView,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        setContentView(rootContainer);

        configureMainWebViewSettings(webView);
        verifyAndRefreshStoredSessionOnStartup();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                isMainPageLoaded = true;

                // Restore persisted session from SharedPreferences immediately on startup
                String activeSession = pendingSessionJsonToDispatch != null
                    ? pendingSessionJsonToDispatch
                    : getAuthPrefs().getString(KEY_ACTIVE_SESSION, null);

                if (activeSession != null && !activeSession.isEmpty()) {
                    persistAndEstablishSession(activeSession);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && url.contains("apk_auth=1")) {
                    launchExternalBrowserOAuthFlow();
                    return true;
                }
                if (url != null && (url.startsWith("https://") || url.startsWith("http://"))) {
                    return false;
                }
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (u != null && u.toString().contains("apk_auth=1")) {
                    launchExternalBrowserOAuthFlow();
                    return true;
                }
                if (u != null && ("https".equalsIgnoreCase(u.getScheme()) || "http".equalsIgnoreCase(u.getScheme()))) {
                    return false;
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null || uri.getHost() == null) {
                    return super.shouldInterceptRequest(view, request);
                }

                String host = uri.getHost();
                if ("https".equalsIgnoreCase(uri.getScheme()) &&
                    (APP_HOST.equalsIgnoreCase(host) ||
                     "cadence-exp.local".equalsIgnoreCase(host) ||
                     "localhost".equalsIgnoreCase(host))) {
                    String path = uri.getPath();
                    if (path == null || path.isEmpty() || path.equals("/")) {
                        path = "/index.html";
                    }
                    if (path.startsWith("/api/")) {
                        return handleApiRequest(uri, path);
                    }
                    return serveLocalAsset(path);
                }

                return super.shouldInterceptRequest(view, request);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                launchExternalBrowserOAuthFlow();
                return false;
            }
        });

        startInitialMediaService();
        webView.loadUrl(APP_URL);
        handleIncomingIntent(getIntent());
    }

    private void dispatchServiceIntent(Intent intent) {
        try {
            if (CadenceAudioService.isRunning()) {
                startService(intent);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (Exception e) {
            try {
                startService(intent);
            } catch (Exception ignored) {}
        }
    }

    private void startInitialMediaService() {
        Intent intent = new Intent(this, CadenceAudioService.class);
        intent.putExtra("title", "Cadence");
        intent.putExtra("artist", "Tap play to start listening");
        intent.putExtra("album", "Cadence");
        intent.putExtra("isPlaying", false);
        dispatchServiceIntent(intent);
    }

    private WebResourceResponse serveLocalAsset(String path) {
        try {
            String assetPath = "web" + (path.startsWith("/") ? path : "/" + path);
            AssetManager am = getAssets();
            InputStream is = am.open(assetPath);
            String mime = getMimeType(path);
            WebResourceResponse resp = new WebResourceResponse(mime, "UTF-8", is);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                Map<String, String> headers = new HashMap<>();
                headers.put("Access-Control-Allow-Origin", "*");
                resp.setResponseHeaders(headers);
            }
            return resp;
        } catch (Exception e) {
            try {
                InputStream is = getAssets().open("web/index.html");
                return new WebResourceResponse("text/html", "UTF-8", is);
            } catch (Exception ignored) {}
        }
        return null;
    }

    private String getMimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }

    private WebResourceResponse jsonResponse(String json) {
        byte[] bytes = (json != null ? json : "{}").getBytes(StandardCharsets.UTF_8);
        WebResourceResponse response = new WebResourceResponse(
            "application/json",
            "UTF-8",
            new ByteArrayInputStream(bytes)
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-store");
            response.setResponseHeaders(headers);
        }
        return response;
    }

    private WebResourceResponse handleApiRequest(Uri uri, String path) {
        try {
            if (path.equals("/api/native-auth-start")) {
                String mode = uri.getQueryParameter("mode");
                if ("native".equalsIgnoreCase(mode)) {
                    launchNativeGoogleAccountChooser();
                } else {
                    launchExternalBrowserOAuthFlow();
                }
                return jsonResponse("{\"ok\":true}");
            }

            if (path.equals("/api/native-auth-status")) {
                String stored = getAuthPrefs().getString(KEY_ACTIVE_SESSION, null);
                if (stored != null && !stored.isEmpty()) {
                    return jsonResponse("{\"authenticated\":true,\"session\":" + stored + "}");
                }
                return jsonResponse("{\"authenticated\":false}");
            }

            if (path.equals("/api/native-auth-signout")) {
                isSignInInProgress = false;
                getAuthPrefs().edit().remove(KEY_ACTIVE_SESSION).remove(KEY_PENDING_OAUTH_SESSION_ID).apply();
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        CookieManager.getInstance().flush();
                    }
                } catch (Exception ignored) {}
                logAuthDiagnostic("STATE_SIGNED_OUT", "User signed out; cleared persisted session");
                return jsonResponse("{\"ok\":true}");
            }

            if (path.equals("/api/native-auth-update-profile")) {
                String newName = uri.getQueryParameter("name");
                String newAvatar = uri.getQueryParameter("avatar");
                String current = getAuthPrefs().getString(KEY_ACTIVE_SESSION, null);
                if (current != null && !current.isEmpty()) {
                    String uid = extractJsonStringClaim(current, "uid");
                    String email = extractJsonStringClaim(current, "email");
                    String displayName = (newName != null && !newName.trim().isEmpty())
                        ? newName.trim()
                        : extractJsonStringClaim(current, "displayName");
                    String firstName = deriveCleanFirstName(null, displayName, email);
                    String photoUrl = (newAvatar != null && !newAvatar.trim().isEmpty())
                        ? newAvatar.trim()
                        : extractJsonStringClaim(current, "photoURL");
                    String idTok = extractJsonStringClaim(current, "idToken");
                    String accTok = extractJsonStringClaim(current, "accessToken");
                    String refTok = extractJsonStringClaim(current, "refreshToken");
                    String method = extractJsonStringClaim(current, "authMethod");

                    String updated = buildSessionJson(uid, email, displayName, firstName, photoUrl, idTok, accTok, refTok, method);
                    SharedPreferences.Editor ed = getAuthPrefs().edit();
                    ed.putString(KEY_ACTIVE_SESSION, updated);
                    if (!email.isEmpty()) {
                        ed.putString(KEY_CACHED_PROFILE_PREFIX + email.toLowerCase(), updated);
                    }
                    ed.apply();
                    return jsonResponse(updated);
                }
                return jsonResponse("{\"ok\":true}");
            }

            if (path.equals("/api/native-auth-complete")) {
                fetchGoogleUserInfoAndUpgradeSession(
                    uri.getQueryParameter("email"),
                    uri.getQueryParameter("id_token"),
                    uri.getQueryParameter("access_token"),
                    "native_auth_complete"
                );
                return jsonResponse("{\"ok\":true}");
            }

            if (path.equals("/api/native-player")) {
                String action = uri.getQueryParameter("action");
                if ("status".equals(action)) {
                    return jsonResponse(CadenceAudioService.getStatusJson());
                } else if ("load".equals(action)) {
                    long dur = 210000L;
                    int vol = 80;
                    try {
                        String dStr = uri.getQueryParameter("dur");
                        if (dStr != null) dur = Long.parseLong(dStr);
                        String vStr = uri.getQueryParameter("vol");
                        if (vStr != null) vol = Integer.parseInt(vStr);
                    } catch (Exception ignored) {}

                    Intent intent = new Intent(MainActivity.this, CadenceAudioService.class);
                    intent.setAction(CadenceAudioService.ACTION_LOAD);
                    intent.putExtra("trackId", uri.getQueryParameter("id"));
                    intent.putExtra("streamUrl", uri.getQueryParameter("url"));
                    intent.putExtra("title", uri.getQueryParameter("title"));
                    intent.putExtra("artist", uri.getQueryParameter("artist"));
                    intent.putExtra("album", uri.getQueryParameter("album"));
                    intent.putExtra("artworkUrl", uri.getQueryParameter("artwork"));
                    intent.putExtra("durationMs", dur);
                    intent.putExtra("volumePercent", vol);
                    dispatchServiceIntent(intent);
                    return jsonResponse("{\"ok\":true}");
                } else if ("preload".equals(action)) {
                    Intent intent = new Intent(MainActivity.this, CadenceAudioService.class);
                    intent.setAction(CadenceAudioService.ACTION_PRELOAD);
                    intent.putExtra("trackId", uri.getQueryParameter("id"));
                    intent.putExtra("streamUrl", uri.getQueryParameter("url"));
                    dispatchServiceIntent(intent);
                    return jsonResponse("{\"ok\":true}");
                } else if ("play".equals(action)) {
                    Intent intent = new Intent(MainActivity.this, CadenceAudioService.class);
                    intent.setAction(CadenceAudioService.ACTION_PLAY);
                    dispatchServiceIntent(intent);
                    return jsonResponse("{\"ok\":true}");
                } else if ("pause".equals(action)) {
                    Intent intent = new Intent(MainActivity.this, CadenceAudioService.class);
                    intent.setAction(CadenceAudioService.ACTION_PAUSE);
                    dispatchServiceIntent(intent);
                    return jsonResponse("{\"ok\":true}");
                } else if ("seek".equals(action)) {
                    long pos = 0L;
                    try {
                        String pStr = uri.getQueryParameter("pos");
                        if (pStr != null) pos = Long.parseLong(pStr);
                    } catch (Exception ignored) {}
                    Intent intent = new Intent(MainActivity.this, CadenceAudioService.class);
                    intent.setAction(CadenceAudioService.ACTION_SEEK);
                    intent.putExtra("positionMs", pos);
                    dispatchServiceIntent(intent);
                    return jsonResponse("{\"ok\":true}");
                } else if ("volume".equals(action)) {
                    int vol = 80;
                    try {
                        String vStr = uri.getQueryParameter("vol");
                        if (vStr != null) vol = Integer.parseInt(vStr);
                    } catch (Exception ignored) {}
                    Intent intent = new Intent(MainActivity.this, CadenceAudioService.class);
                    intent.setAction(CadenceAudioService.ACTION_VOLUME);
                    intent.putExtra("volumePercent", vol);
                    dispatchServiceIntent(intent);
                    return jsonResponse("{\"ok\":true}");
                }
                return jsonResponse("{\"ok\":true}");
            }

            if (path.equals("/api/native-media-state")) {
                final String title = uri.getQueryParameter("title");
                final String artist = uri.getQueryParameter("artist");
                final String album = uri.getQueryParameter("album");
                final String artwork = uri.getQueryParameter("artwork");
                final boolean playing = "1".equals(uri.getQueryParameter("playing"));
                long pos = 0L;
                long dur = 210000L;
                try {
                    String posStr = uri.getQueryParameter("pos");
                    if (posStr != null) pos = Long.parseLong(posStr);
                    String durStr = uri.getQueryParameter("dur");
                    if (durStr != null) dur = Long.parseLong(durStr);
                } catch (Exception ignored) {}

                final long finalPos = pos;
                final long finalDur = dur;
                preloadPool.submit(new Runnable() {
                    @Override
                    public void run() {
                        Intent intent = new Intent(MainActivity.this, CadenceAudioService.class);
                        intent.setAction(CadenceAudioService.ACTION_UPDATE);
                        intent.putExtra("title", title != null ? title : "Cadence");
                        intent.putExtra("artist", artist != null ? artist : "Unknown Artist");
                        intent.putExtra("album", album != null ? album : "Cadence");
                        intent.putExtra("artworkUrl", artwork != null ? artwork : "");
                        intent.putExtra("isPlaying", playing);
                        intent.putExtra("positionMs", finalPos);
                        intent.putExtra("durationMs", finalDur);
                        dispatchServiceIntent(intent);
                    }
                });
                return jsonResponse("{\"ok\":true}");
            }

            if (path.equals("/api/saavn")) {
                String q = uri.getQueryParameter("q");
                if (q == null || q.trim().isEmpty()) {
                    return jsonResponse("{\"results\":[]}");
                }
                String cacheKey = "saavn:" + q.trim().toLowerCase();
                if (apiCache.containsKey(cacheKey)) {
                    return jsonResponse(apiCache.get(cacheKey));
                }
                String target = "https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=10&p=1&q="
                    + URLEncoder.encode(q.trim(), "UTF-8");
                String resp = fetchHttp(target, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
                if (resp != null && resp.startsWith("{")) {
                    apiCache.put(cacheKey, resp);
                    return jsonResponse(resp);
                }
                return jsonResponse("{\"results\":[]}");
            }

            if (path.equals("/api/lrclib")) {
                String q = uri.getQueryParameter("q");
                if (q == null || q.trim().isEmpty()) {
                    return jsonResponse("[]");
                }
                String cacheKey = "lrc:" + q.trim().toLowerCase();
                if (apiCache.containsKey(cacheKey)) {
                    return jsonResponse(apiCache.get(cacheKey));
                }
                String target = "https://lrclib.net/api/search?q=" + URLEncoder.encode(q.trim(), "UTF-8");
                String resp = fetchHttp(target, "CadenceFlutterExperimental/1.3 (https://cadence.run.place)");
                if (resp != null && resp.startsWith("[")) {
                    apiCache.put(cacheKey, resp);
                    return jsonResponse(resp);
                }
                return jsonResponse("[]");
            }

            if (path.equals("/api/yt-stream")) {
                String videoId = uri.getQueryParameter("id");
                if (videoId != null && !videoId.trim().isEmpty()) {
                    String ytJson = fetchYouTubeInnertube(videoId.trim());
                    if (ytJson != null) return jsonResponse(ytJson);
                }
                return jsonResponse("{}");
            }

            if (path.equals("/api/music/suggestions")) {
                String q = uri.getQueryParameter("q");
                if (q == null || q.trim().isEmpty()) {
                    return jsonResponse("{\"suggestions\":[]}");
                }
                String target = "https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=" + URLEncoder.encode(q.trim(), "UTF-8");
                String resp = fetchHttp(target, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
                if (resp != null) {
                    Pattern p = Pattern.compile("\"([^\"]+)\"");
                    Matcher m = p.matcher(resp);
                    StringBuilder sb = new StringBuilder("{\"suggestions\":[");
                    int idx = 0;
                    int added = 0;
                    while (m.find() && added < 8) {
                        String val = m.group(1);
                        if (idx > 0 && !val.equalsIgnoreCase(q.trim())) {
                            if (added > 0) sb.append(",");
                            sb.append("\"").append(escapeJson(val)).append("\"");
                            added++;
                        }
                        idx++;
                    }
                    sb.append("]}");
                    return jsonResponse(sb.toString());
                }
                return jsonResponse("{\"suggestions\":[]}");
            }

            if (path.equals("/api/music/search")) {
                String q = uri.getQueryParameter("q");
                if (q == null || q.trim().isEmpty()) {
                    return jsonResponse("{\"tracks\":[]}");
                }
                String target = "https://www.youtube.com/results?search_query=" + URLEncoder.encode(q.trim() + " official audio", "UTF-8") + "&sp=EgIQAQ%253D%253D";
                String html = fetchHttp(target, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
                if (html != null) {
                    String tracksJson = parseYouTubeSearchHtml(html);
                    if (tracksJson != null) {
                        return jsonResponse(tracksJson);
                    }
                }
                return jsonResponse("{\"tracks\":[]}");
            }
        } catch (Exception ignored) {}

        return jsonResponse("{}");
    }

    private String fetchHttpWithBearer(String urlStr, String bearerToken) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
            conn.setRequestProperty("Accept", "application/json");
            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
                reader.close();
                return sb.toString();
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private String fetchHttp(String urlStr, String userAgent) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setRequestProperty("User-Agent", userAgent);
            conn.setRequestProperty("Accept-Language", "en-US,en;q=0.9");
            conn.setRequestProperty("X-Forwarded-For", "49.36.128.1");
            conn.setRequestProperty("CF-IPCountry", "IN");
            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
                reader.close();
                return sb.toString();
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private String fetchYouTubeInnertube(String videoId) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL("https://www.youtube.com/youtubei/v1/player?prettyPrint=false");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty(
                "User-Agent",
                "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip"
            );

            String payload = "{\"videoId\":\"" + escapeJson(videoId) + "\","
                + "\"context\":{\"client\":{\"clientName\":\"ANDROID_VR\",\"clientVersion\":\"1.60.19\","
                + "\"deviceMake\":\"Oculus\",\"deviceModel\":\"Quest 3\",\"androidSdkVersion\":32,"
                + "\"osName\":\"Android\",\"osVersion\":\"12L\",\"hl\":\"en\",\"gl\":\"US\"}},"
                + "\"contentCheckOk\":true,\"racyCheckOk\":true}";

            OutputStream os = conn.getOutputStream();
            os.write(payload.getBytes(StandardCharsets.UTF_8));
            os.flush();
            os.close();

            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                return sb.toString();
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private String parseYouTubeSearchHtml(String html) {
        try {
            Pattern p = Pattern.compile("var ytInitialData\\s*=\\s*(\\{.*?\\});</script>");
            Matcher m = p.matcher(html);
            if (!m.find()) {
                Pattern p2 = Pattern.compile("ytInitialData\\s*=\\s*(\\{.*?\\});</script>");
                m = p2.matcher(html);
            }
            if (m.find()) {
                String ytData = m.group(1);
                Pattern vidP = Pattern.compile("\"videoId\"\\s*:\\s*\"([a-zA-Z0-9_-]{11})\"");
                Pattern titleP = Pattern.compile("\"title\"\\s*:\\s*\\{\"runs\"\\s*:\\s*\\[\\{\"text\"\\s*:\\s*\"([^\"]+)\"\\}\\]");
                Pattern ownerP = Pattern.compile("\"ownerText\"\\s*:\\s*\\{\"runs\"\\s*:\\s*\\[\\{\"text\"\\s*:\\s*\"([^\"]+)\"\\}\\]");

                Matcher vm = vidP.matcher(ytData);
                Matcher tm = titleP.matcher(ytData);
                Matcher om = ownerP.matcher(ytData);

                StringBuilder sb = new StringBuilder("{\"tracks\":[");
                int count = 0;
                while (vm.find() && tm.find() && om.find() && count < 18) {
                    if (count > 0) sb.append(",");
                    String vid = vm.group(1);
                    String vTitle = tm.group(1);
                    String vArtist = om.group(1);
                    sb.append("{\"id\":\"").append(vid).append("\",")
                      .append("\"title\":\"").append(escapeJson(vTitle)).append("\",")
                      .append("\"artist\":\"").append(escapeJson(vArtist)).append("\",")
                      .append("\"album\":\"Single\",")
                      .append("\"duration\":210,")
                      .append("\"thumbnailUrl\":\"https://i.ytimg.com/vi/").append(vid).append("/hqdefault.jpg\"}");
                    count++;
                }
                sb.append("]}");
                return sb.toString();
            }
        } catch (Exception ignored) {}
        return null;
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", " ")
                .replace("\r", " ");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onDestroy() {
        if (instance == this) {
            instance = null;
        }
        preloadPool.shutdownNow();
        super.onDestroy();
    }
}
