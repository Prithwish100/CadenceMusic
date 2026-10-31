package app.cadence.player;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static MainActivity instance;
    private CadenceWebView webView;
    private Dialog authPopupDialog;
    private WebView authPopupWebView;
    private boolean isMainPageLoaded = false;
    private String pendingAuthIdToken = null;
    private String pendingAuthAccessToken = null;

    // Serve local APK bundle on https://cadence.run.place (which is in Firebase Auth's authorizedDomains)
    private static final String APP_HOST = "cadence.run.place";
    private static final String APP_URL = "https://cadence.run.place/index.html";
    private static final String OAUTH_CLIENT_ID = "1073976852547-nlpmgu43qb6hl0qp16ot9e9849pcpolo.apps.googleusercontent.com";
    private static final String FIREBASE_AUTH_HANDLER = "https://solar-team-23rp2.firebaseapp.com/__/auth/handler";
    private static final String EXTERNAL_BROWSER_AUTH_URL = "https://cadence.run.place/?apk_auth=1";

    private final Map<String, String> apiCache = new ConcurrentHashMap<>();
    private final ExecutorService preloadPool = Executors.newFixedThreadPool(3);

    public static class CadenceWebView extends WebView {
        public CadenceWebView(Context context) {
            super(context);
        }

        @Override
        protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(View.VISIBLE);
        }
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

    private void dispatchGoogleAuthTokens(final String idToken, final String accessToken) {
        if ((idToken == null || idToken.isEmpty()) && (accessToken == null || accessToken.isEmpty())) {
            return;
        }
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                closeAuthPopup();
                if (!isMainPageLoaded || webView == null) {
                    pendingAuthIdToken = idToken;
                    pendingAuthAccessToken = accessToken;
                    return;
                }
                try {
                    String safeId = escapeJson(idToken != null ? idToken : "");
                    String safeAccess = escapeJson(accessToken != null ? accessToken : "");
                    String js = "if(window.__cadenceCompleteNativeGoogleAuth){window.__cadenceCompleteNativeGoogleAuth(\""
                        + safeId + "\",\"" + safeAccess + "\");}";
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                        webView.evaluateJavascript(js, null);
                    } else {
                        webView.loadUrl("javascript:" + js);
                    }
                } catch (Exception ignored) {}
            }
        });
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data != null && "cadence".equalsIgnoreCase(data.getScheme()) && "auth".equalsIgnoreCase(data.getHost())) {
            String idToken = data.getQueryParameter("id_token");
            String accessToken = data.getQueryParameter("access_token");
            if ((idToken != null && !idToken.isEmpty()) || (accessToken != null && !accessToken.isEmpty())) {
                dispatchGoogleAuthTokens(idToken, accessToken);
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
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
            defaultUa = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
        }
        String cleanUa = defaultUa
            .replace("; wv)", ")")
            .replace("; wv;", ";")
            .replaceAll("Version/\\d+\\.\\d+\\s*", "")
            .trim();
        settings.setUserAgentString(cleanUa + " CadenceAPK/2.1");

        try {
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                cookieManager.setAcceptThirdPartyCookies(targetWebView, true);
            }
        } catch (Exception ignored) {}
    }

    private void configureOAuthWebViewSettings(WebView targetWebView) {
        WebSettings settings = targetWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Firefox Android UA bypasses Google OAuth's WebView / X-Requested-With block completely
        settings.setUserAgentString("Mozilla/5.0 (Android 13; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0");

        try {
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                cookieManager.setAcceptThirdPartyCookies(targetWebView, true);
            }
        } catch (Exception ignored) {}
    }

    private void closeAuthPopup() {
        try {
            if (authPopupDialog != null && authPopupDialog.isShowing()) {
                authPopupDialog.dismiss();
            }
        } catch (Exception ignored) {}
        authPopupDialog = null;

        try {
            if (authPopupWebView != null) {
                ViewGroup parent = (ViewGroup) authPopupWebView.getParent();
                if (parent != null) {
                    parent.removeView(authPopupWebView);
                }
                authPopupWebView.destroy();
            }
        } catch (Exception ignored) {}
        authPopupWebView = null;
    }

    private void launchExternalBrowserSignIn() {
        try {
            Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(EXTERNAL_BROWSER_AUTH_URL));
            browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(browserIntent);
        } catch (Exception ignored) {}
    }

    private void openNativeGoogleSignInDialog() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    closeAuthPopup();

                    authPopupWebView = new WebView(MainActivity.this);
                    authPopupWebView.setBackgroundColor(Color.parseColor("#0A0A0C"));
                    configureOAuthWebViewSettings(authPopupWebView);

                    LinearLayout container = new LinearLayout(MainActivity.this);
                    container.setOrientation(LinearLayout.VERTICAL);
                    container.setBackgroundColor(Color.parseColor("#0A0A0C"));

                    LinearLayout topBar = new LinearLayout(MainActivity.this);
                    topBar.setOrientation(LinearLayout.HORIZONTAL);
                    topBar.setGravity(Gravity.CENTER_VERTICAL);
                    topBar.setBackgroundColor(Color.parseColor("#141418"));
                    float density = getResources().getDisplayMetrics().density;
                    int padH = Math.round(14 * density);
                    int padV = Math.round(12 * density);
                    topBar.setPadding(padH, padV, padH, padV);

                    TextView titleView = new TextView(MainActivity.this);
                    titleView.setText("Sign in with Google");
                    titleView.setTextColor(Color.parseColor("#F5F5F7"));
                    titleView.setTextSize(15f);
                    LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                        0,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        1.0f
                    );
                    topBar.addView(titleView, titleParams);

                    TextView browserBtn = new TextView(MainActivity.this);
                    browserBtn.setText("Use Browser ↗");
                    browserBtn.setTextColor(Color.parseColor("#E25822"));
                    browserBtn.setTextSize(13f);
                    browserBtn.setPadding(Math.round(10 * density), 0, Math.round(14 * density), 0);
                    browserBtn.setOnClickListener(new View.OnClickListener() {
                        @Override
                        public void onClick(View v) {
                            closeAuthPopup();
                            launchExternalBrowserSignIn();
                        }
                    });
                    topBar.addView(browserBtn);

                    TextView closeBtn = new TextView(MainActivity.this);
                    closeBtn.setText("Close ✕");
                    closeBtn.setTextColor(Color.parseColor("#94949E"));
                    closeBtn.setTextSize(13f);
                    closeBtn.setOnClickListener(new View.OnClickListener() {
                        @Override
                        public void onClick(View v) {
                            closeAuthPopup();
                        }
                    });
                    topBar.addView(closeBtn);

                    container.addView(
                        topBar,
                        new LinearLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.WRAP_CONTENT
                        )
                    );
                    container.addView(
                        authPopupWebView,
                        new LinearLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            0,
                            1.0f
                        )
                    );

                    authPopupDialog = new Dialog(MainActivity.this, android.R.style.Theme_Black_NoTitleBar);
                    authPopupDialog.setContentView(container);
                    authPopupDialog.setOnCancelListener(new DialogInterface.OnCancelListener() {
                        @Override
                        public void onCancel(DialogInterface dialog) {
                            closeAuthPopup();
                        }
                    });

                    Window dialogWindow = authPopupDialog.getWindow();
                    if (dialogWindow != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        dialogWindow.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                        dialogWindow.setStatusBarColor(Color.parseColor("#141418"));
                        dialogWindow.setNavigationBarColor(Color.parseColor("#0A0A0C"));
                    }

                    authPopupWebView.setWebViewClient(new WebViewClient() {
                        @Override
                        public boolean shouldOverrideUrlLoading(WebView v, String url) {
                            if (url != null && url.contains("/api/native-auth-complete")) {
                                Uri u = Uri.parse(url);
                                dispatchGoogleAuthTokens(
                                    u.getQueryParameter("id_token"),
                                    u.getQueryParameter("access_token")
                                );
                                return true;
                            }
                            return false;
                        }

                        @Override
                        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                            Uri u = req.getUrl();
                            if (u != null && u.getPath() != null && u.getPath().equals("/api/native-auth-complete")) {
                                dispatchGoogleAuthTokens(
                                    u.getQueryParameter("id_token"),
                                    u.getQueryParameter("access_token")
                                );
                                return true;
                            }
                            return false;
                        }

                        @Override
                        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                            Uri u = req.getUrl();
                            if (u != null && u.getHost() != null) {
                                String host = u.getHost().toLowerCase();
                                String path = u.getPath() != null ? u.getPath() : "";

                                // Intercept Firebase OAuth redirect handler to extract #id_token=...&access_token=...
                                if ("solar-team-23rp2.firebaseapp.com".equals(host) && path.startsWith("/__/auth/handler")) {
                                    String html = "<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>"
                                        + "<body style=\"background:#0A0A0C;color:#F5F5F7;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\">"
                                        + "<p style=\"font-size:15px;font-weight:bold;color:#E25822\">Signing in to Cadence...</p>"
                                        + "<script>"
                                        + "var raw = window.location.hash ? window.location.hash.substring(1) : (window.location.search ? window.location.search.substring(1) : '');"
                                        + "window.location.replace('https://cadence.run.place/api/native-auth-complete?' + raw);"
                                        + "</script></body></html>";
                                    return new WebResourceResponse(
                                        "text/html",
                                        "UTF-8",
                                        new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8))
                                    );
                                }

                                if (path.equals("/api/native-auth-complete")) {
                                    dispatchGoogleAuthTokens(
                                        u.getQueryParameter("id_token"),
                                        u.getQueryParameter("access_token")
                                    );
                                    return jsonResponse("{\"ok\":true}");
                                }
                            }
                            return super.shouldInterceptRequest(v, req);
                        }
                    });

                    authPopupDialog.show();

                    String nonce = "cadence_" + System.currentTimeMillis();
                    String oauthUrl = "https://accounts.google.com/o/oauth2/v2/auth"
                        + "?client_id=" + URLEncoder.encode(OAUTH_CLIENT_ID, "UTF-8")
                        + "&redirect_uri=" + URLEncoder.encode(FIREBASE_AUTH_HANDLER, "UTF-8")
                        + "&response_type=" + URLEncoder.encode("id_token token", "UTF-8")
                        + "&scope=" + URLEncoder.encode("openid email profile", "UTF-8")
                        + "&prompt=select_account"
                        + "&nonce=" + nonce;

                    authPopupWebView.loadUrl(oauthUrl);
                } catch (Exception e) {
                    launchExternalBrowserSignIn();
                }
            }
        });
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;

        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.parseColor("#0A0A0C"));
            window.setNavigationBarColor(Color.parseColor("#0A0A0C"));
        }

        if (Build.VERSION.SDK_INT >= 33) {
            try {
                if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1001);
                }
            } catch (Exception ignored) {}
        }

        webView = new CadenceWebView(this);
        webView.setBackgroundColor(Color.parseColor("#0A0A0C"));
        setContentView(webView);

        configureMainWebViewSettings(webView);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                isMainPageLoaded = true;
                if (pendingAuthIdToken != null || pendingAuthAccessToken != null) {
                    String idTok = pendingAuthIdToken;
                    String accTok = pendingAuthAccessToken;
                    pendingAuthIdToken = null;
                    pendingAuthAccessToken = null;
                    dispatchGoogleAuthTokens(idTok, accTok);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && (url.startsWith("https://") || url.startsWith("http://"))) {
                    return false;
                }
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
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
                     "localhost".equalsIgnoreCase(host) ||
                     "cadence.local".equalsIgnoreCase(host))) {
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
                openNativeGoogleSignInDialog();
                return false;
            }
        });

        startInitialMediaService();
        handleIncomingIntent(getIntent());
        webView.loadUrl(APP_URL);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.resumeTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
        }
    }

    private void dispatchServiceIntent(Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (Exception ignored) {}
    }

    private void startInitialMediaService() {
        Intent intent = new Intent(this, CadenceAudioService.class);
        intent.putExtra("title", "Cadence Music");
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
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
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
                openNativeGoogleSignInDialog();
                return jsonResponse("{\"ok\":true}");
            }

            if (path.equals("/api/native-auth-complete")) {
                dispatchGoogleAuthTokens(
                    uri.getQueryParameter("id_token"),
                    uri.getQueryParameter("access_token")
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
                        intent.putExtra("title", title != null ? title : "Cadence Music");
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
                String resp = fetchHttp(target, "CadenceMusicPlayer/2.1 (https://cadence.run.place)");
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
                if (count > 0) return sb.toString();
            }
        } catch (Exception ignored) {}
        return null;
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", " ")
                .replace("\r", " ")
                .replace("\t", " ");
    }

    @Override
    public void onBackPressed() {
        if (authPopupDialog != null && authPopupDialog.isShowing()) {
            closeAuthPopup();
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onDestroy() {
        closeAuthPopup();
        if (instance == this) {
            instance = null;
        }
        super.onDestroy();
    }
}
