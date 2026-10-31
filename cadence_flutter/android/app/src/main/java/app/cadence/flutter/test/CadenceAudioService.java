package app.cadence.flutter.test;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Isolated Foreground Media Playback Service for `app.cadence.flutter.test`.
 * Uses separate Notification Channel (`cadence_flutter_exp_channel`) and
 * Notification ID (`8901`) so it never collides with `app.cadence.player`.
 */
public class CadenceAudioService extends Service {
    public static final String CHANNEL_ID = "cadence_flutter_exp_channel";
    public static final int NOTIFICATION_ID = 8901;

    public static final String ACTION_UPDATE = "app.cadence.flutter.test.ACTION_UPDATE";
    public static final String ACTION_LOAD = "app.cadence.flutter.test.ACTION_LOAD";
    public static final String ACTION_PRELOAD = "app.cadence.flutter.test.ACTION_PRELOAD";
    public static final String ACTION_PLAY = "app.cadence.flutter.test.ACTION_PLAY";
    public static final String ACTION_PAUSE = "app.cadence.flutter.test.ACTION_PAUSE";
    public static final String ACTION_SEEK = "app.cadence.flutter.test.ACTION_SEEK";
    public static final String ACTION_VOLUME = "app.cadence.flutter.test.ACTION_VOLUME";
    public static final String ACTION_PREV = "app.cadence.flutter.test.ACTION_PREV";
    public static final String ACTION_TOGGLE = "app.cadence.flutter.test.ACTION_TOGGLE";
    public static final String ACTION_NEXT = "app.cadence.flutter.test.ACTION_NEXT";

    private static CadenceAudioService instance;

    public static boolean isRunning() {
        return instance != null;
    }

    private MediaPlayer mediaPlayer;
    private MediaSession mediaSession;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private WifiManager.WifiLock wifiLock;
    private Handler mainHandler;
    private File audioCacheDir;

    private final ExecutorService artworkExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService cacheExecutor = Executors.newFixedThreadPool(2);
    private final Map<String, Bitmap> artworkCache = new HashMap<>();
    private final ConcurrentHashMap<String, Boolean> activeDownloads = new ConcurrentHashMap<>();
    private Bitmap defaultIconBitmap;

    private volatile String currentTrackId = "";
    private volatile String currentStreamUrl = "";
    private volatile String currentTitle = "Cadence";
    private volatile String currentArtist = "Ready to play";
    private volatile String currentAlbum = "Cadence";
    private volatile String currentArtworkUrl = "";
    private Bitmap currentArtwork = null;

    private volatile boolean currentIsPlaying = false;
    private volatile boolean isBuffering = false;
    private volatile boolean isPrepared = false;
    private volatile boolean shouldPlayWhenPrepared = false;
    private volatile long currentPositionMs = 0L;
    private volatile long currentDurationMs = 210000L;
    private volatile float currentVolume = 0.8f;

    private final Runnable progressSyncRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                if (mediaPlayer != null && isPrepared) {
                    if (mediaPlayer.isPlaying()) {
                        currentPositionMs = Math.max(0L, mediaPlayer.getCurrentPosition());
                        int dur = mediaPlayer.getDuration();
                        if (dur > 1000) {
                            currentDurationMs = dur;
                        }
                    }
                    updatePlaybackStateOnly();
                }
            } catch (Exception ignored) {}
            if (mainHandler != null && currentIsPlaying) {
                mainHandler.postDelayed(this, 1000L);
            }
        }
    };

    private final AudioManager.OnAudioFocusChangeListener focusChangeListener = new AudioManager.OnAudioFocusChangeListener() {
        @Override
        public void onAudioFocusChange(int focusChange) {
            try {
                if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                    if (mediaPlayer != null && isPrepared) {
                        float duckVol = currentVolume * 0.25f;
                        mediaPlayer.setVolume(duckVol, duckVol);
                    }
                } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
                    if (mediaPlayer != null && isPrepared) {
                        mediaPlayer.setVolume(currentVolume, currentVolume);
                    }
                } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                    pauseNativePlayer();
                    MainActivity.dispatchMediaAction("pause", -1L);
                }
            } catch (Exception ignored) {}
        }
    };

    public static String getStatusJson() {
        CadenceAudioService svc = instance;
        if (svc == null) {
            return "{\"playing\":false,\"buffering\":false,\"pos\":0,\"dur\":210000,\"trackId\":\"\"}";
        }
        long pos = svc.currentPositionMs;
        long dur = svc.currentDurationMs;
        boolean playing = svc.currentIsPlaying;
        boolean buffering = svc.isBuffering;
        try {
            if (svc.mediaPlayer != null && svc.isPrepared) {
                int mpPos = svc.mediaPlayer.getCurrentPosition();
                if (mpPos >= 0) {
                    pos = mpPos;
                    svc.currentPositionMs = pos;
                }
                int mpDur = svc.mediaPlayer.getDuration();
                if (mpDur > 1000) {
                    dur = mpDur;
                    svc.currentDurationMs = dur;
                }
            }
        } catch (Exception ignored) {}
        String safeTrackId = svc.currentTrackId != null ? svc.currentTrackId.replace("\"", "") : "";
        return "{\"playing\":" + playing
            + ",\"buffering\":" + buffering
            + ",\"pos\":" + pos
            + ",\"dur\":" + dur
            + ",\"trackId\":\"" + safeTrackId + "\"}";
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        mainHandler = new Handler(Looper.getMainLooper());
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        audioCacheDir = new File(getCacheDir(), "exp_audio_cache");
        if (!audioCacheDir.exists()) {
            audioCacheDir.mkdirs();
        }

        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                int lockMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                    : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wm.createWifiLock(lockMode, "CadenceExp:AudioWifiLock");
                wifiLock.setReferenceCounted(false);
            }
        } catch (Exception ignored) {}

        createNotificationChannel();

        try {
            defaultIconBitmap = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
            currentArtwork = defaultIconBitmap;
        } catch (Exception ignored) {}

        initMediaSession();
        initMediaPlayer();
    }

    private void initMediaPlayer() {
        try {
            if (mediaPlayer != null) {
                try {
                    mediaPlayer.release();
                } catch (Exception ignored) {}
            }
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
                mediaPlayer.setAudioAttributes(attrs);
            } else {
                mediaPlayer.setAudioStreamType(AudioManager.STREAM_MUSIC);
            }

            mediaPlayer.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                @Override
                public void onPrepared(MediaPlayer mp) {
                    isPrepared = true;
                    isBuffering = false;
                    try {
                        int dur = mp.getDuration();
                        if (dur > 1000) {
                            currentDurationMs = dur;
                        }
                        mp.setVolume(currentVolume, currentVolume);
                        if (shouldPlayWhenPrepared) {
                            requestAudioFocus();
                            acquireWifiLock();
                            mp.start();
                            currentIsPlaying = true;
                            scheduleProgressSync();
                        }
                        updateSessionAndNotification();
                    } catch (Exception ignored) {}
                }
            });

            mediaPlayer.setOnInfoListener(new MediaPlayer.OnInfoListener() {
                @Override
                public boolean onInfo(MediaPlayer mp, int what, int extra) {
                    if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) {
                        isBuffering = true;
                    } else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END) {
                        isBuffering = false;
                    }
                    return false;
                }
            });

            mediaPlayer.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer mp) {
                    if (!isPrepared) return;
                    isBuffering = false;
                    currentPositionMs = 0L;
                    MainActivity.dispatchMediaAction("ended", -1L);
                }
            });

            mediaPlayer.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer mp, int what, int extra) {
                    isPrepared = false;
                    isBuffering = false;
                    return true;
                }
            });
        } catch (Exception ignored) {}
    }

    private void requestAudioFocus() {
        try {
            if (audioManager == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (audioFocusRequest == null) {
                    AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build();
                    audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(attrs)
                        .setAcceptsDelayedFocusGain(true)
                        .setOnAudioFocusChangeListener(focusChangeListener)
                        .build();
                }
                audioManager.requestAudioFocus(audioFocusRequest);
            } else {
                audioManager.requestAudioFocus(
                    focusChangeListener,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN
                );
            }
        } catch (Exception ignored) {}
    }

    private void acquireWifiLock() {
        try {
            if (wifiLock != null && !wifiLock.isHeld()) {
                wifiLock.acquire();
            }
        } catch (Exception ignored) {}
    }

    private void releaseWifiLock() {
        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
        } catch (Exception ignored) {}
    }

    private void scheduleProgressSync() {
        if (mainHandler != null) {
            mainHandler.removeCallbacks(progressSyncRunnable);
            mainHandler.postDelayed(progressSyncRunnable, 500L);
        }
    }

    private File getCachedFileForTrack(String trackId) {
        String safeName = (trackId != null ? trackId : "track").replaceAll("[^a-zA-Z0-9_-]", "_");
        return new File(audioCacheDir, safeName + ".m4a");
    }

    private void preloadTrackToDiskAsync(final String trackId, final String streamUrl) {
        if (trackId == null || trackId.isEmpty() || streamUrl == null || !streamUrl.startsWith("http")) {
            return;
        }
        final File targetFile = getCachedFileForTrack(trackId);
        if (targetFile.exists() && targetFile.length() > 65536L) {
            return;
        }
        if (activeDownloads.putIfAbsent(trackId, Boolean.TRUE) != null) {
            return;
        }

        cacheExecutor.submit(new Runnable() {
            @Override
            public void run() {
                File tempFile = new File(audioCacheDir, targetFile.getName() + ".tmp");
                HttpURLConnection conn = null;
                InputStream is = null;
                FileOutputStream fos = null;
                try {
                    pruneCacheIfNeeded();
                    URL url = new URL(streamUrl);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(15000);
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36");
                    if (conn.getResponseCode() == 200) {
                        is = conn.getInputStream();
                        fos = new FileOutputStream(tempFile);
                        byte[] buf = new byte[16384];
                        int read;
                        long total = 0L;
                        while ((read = is.read(buf)) != -1) {
                            fos.write(buf, 0, read);
                            total += read;
                        }
                        fos.flush();
                        fos.close();
                        fos = null;
                        if (total > 32768L) {
                            tempFile.renameTo(targetFile);
                        } else {
                            tempFile.delete();
                        }
                    }
                } catch (Exception ignored) {
                    try {
                        if (tempFile.exists()) tempFile.delete();
                    } catch (Exception ignored2) {}
                } finally {
                    try {
                        if (is != null) is.close();
                    } catch (Exception ignored) {}
                    try {
                        if (fos != null) fos.close();
                    } catch (Exception ignored) {}
                    if (conn != null) conn.disconnect();
                    activeDownloads.remove(trackId);
                }
            }
        });
    }

    private void pruneCacheIfNeeded() {
        try {
            File[] files = audioCacheDir.listFiles();
            if (files == null || files.length <= 25) return;
            Arrays.sort(files, new Comparator<File>() {
                @Override
                public int compare(File a, File b) {
                    return Long.compare(a.lastModified(), b.lastModified());
                }
            });
            for (int i = 0; i < files.length - 20; i++) {
                if (!files[i].getName().contains(currentTrackId)) {
                    files[i].delete();
                }
            }
        } catch (Exception ignored) {}
    }

    private void loadAndPlayInternal(
        String trackId,
        String streamUrl,
        String title,
        String artist,
        String album,
        String artworkUrl,
        long durationMs,
        int volumePercent
    ) {
        if (trackId != null && !trackId.isEmpty()) currentTrackId = trackId;
        if (streamUrl != null && !streamUrl.isEmpty()) currentStreamUrl = streamUrl;
        if (title != null && !title.isEmpty()) currentTitle = title;
        if (artist != null && !artist.isEmpty()) currentArtist = artist;
        if (album != null && !album.isEmpty()) currentAlbum = album;
        if (durationMs > 0) currentDurationMs = durationMs;
        if (volumePercent >= 0 && volumePercent <= 100) {
            currentVolume = volumePercent / 100.0f;
        }

        if (artworkUrl != null && !artworkUrl.equals(currentArtworkUrl)) {
            currentArtworkUrl = artworkUrl;
            loadArtworkAsync(artworkUrl);
        }

        currentPositionMs = 0L;
        currentIsPlaying = true;
        isBuffering = true;
        isPrepared = false;
        shouldPlayWhenPrepared = true;

        updateSessionAndNotification();

        if (currentStreamUrl == null || currentStreamUrl.isEmpty()) {
            isBuffering = false;
            return;
        }

        try {
            if (mediaPlayer == null) {
                initMediaPlayer();
            } else {
                mediaPlayer.reset();
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
                mediaPlayer.setAudioAttributes(attrs);
            } else {
                mediaPlayer.setAudioStreamType(AudioManager.STREAM_MUSIC);
            }

            File cachedFile = getCachedFileForTrack(currentTrackId);
            if (cachedFile.exists() && cachedFile.length() > 65536L) {
                FileInputStream fis = new FileInputStream(cachedFile);
                mediaPlayer.setDataSource(fis.getFD());
                fis.close();
                mediaPlayer.prepareAsync();
            } else {
                Map<String, String> headers = new HashMap<>();
                headers.put("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36");
                mediaPlayer.setDataSource(getApplicationContext(), android.net.Uri.parse(currentStreamUrl), headers);
                mediaPlayer.prepareAsync();
                preloadTrackToDiskAsync(currentTrackId, currentStreamUrl);
            }
        } catch (Exception e) {
            initMediaPlayer();
            isBuffering = false;
        }
    }

    private void playNativePlayer() {
        try {
            shouldPlayWhenPrepared = true;
            currentIsPlaying = true;
            if (mediaPlayer != null && isPrepared) {
                requestAudioFocus();
                acquireWifiLock();
                mediaPlayer.setVolume(currentVolume, currentVolume);
                mediaPlayer.start();
                scheduleProgressSync();
            } else if (currentStreamUrl != null && !currentStreamUrl.isEmpty()) {
                loadAndPlayInternal(
                    currentTrackId,
                    currentStreamUrl,
                    currentTitle,
                    currentArtist,
                    currentAlbum,
                    currentArtworkUrl,
                    currentDurationMs,
                    Math.round(currentVolume * 100)
                );
                return;
            }
            updateSessionAndNotification();
        } catch (Exception ignored) {}
    }

    private void pauseNativePlayer() {
        try {
            shouldPlayWhenPrepared = false;
            currentIsPlaying = false;
            isBuffering = false;
            if (mediaPlayer != null && isPrepared && mediaPlayer.isPlaying()) {
                currentPositionMs = Math.max(0L, mediaPlayer.getCurrentPosition());
                mediaPlayer.pause();
            }
            releaseWifiLock();
            updateSessionAndNotification();
        } catch (Exception ignored) {}
    }

    private void seekNativePlayer(long posMs) {
        try {
            long safePos = Math.max(0L, posMs);
            currentPositionMs = safePos;
            if (mediaPlayer != null && isPrepared) {
                mediaPlayer.seekTo((int) safePos);
            }
            updatePlaybackStateOnly();
        } catch (Exception ignored) {}
    }

    private void setNativeVolume(int volumePercent) {
        try {
            int clamped = Math.max(0, Math.min(100, volumePercent));
            currentVolume = clamped / 100.0f;
            if (mediaPlayer != null && isPrepared) {
                mediaPlayer.setVolume(currentVolume, currentVolume);
            }
        } catch (Exception ignored) {}
    }

    private void initMediaSession() {
        try {
            mediaSession = new MediaSession(this, "CadenceExpMediaSession");
            mediaSession.setFlags(
                MediaSession.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS
            );
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    playNativePlayer();
                    MainActivity.dispatchMediaAction("play", -1L);
                }

                @Override
                public void onPause() {
                    pauseNativePlayer();
                    MainActivity.dispatchMediaAction("pause", -1L);
                }

                @Override
                public void onSkipToNext() {
                    MainActivity.dispatchMediaAction("next", -1L);
                }

                @Override
                public void onSkipToPrevious() {
                    MainActivity.dispatchMediaAction("prev", -1L);
                }

                @Override
                public void onSeekTo(long pos) {
                    seekNativePlayer(pos);
                    MainActivity.dispatchMediaAction("seek", pos);
                }
            });
            mediaSession.setActive(true);
        } catch (Exception ignored) {}
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Cadence Media Controls",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Cadence Notification Bar & Lock Screen Controls");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private PendingIntent buildActionIntent(String action, int requestCode) {
        Intent intent = new Intent(this, CadenceAudioService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getService(this, requestCode, intent, flags);
    }

    private void updatePlaybackStateOnly() {
        try {
            if (mediaSession != null) {
                long actions = PlaybackState.ACTION_PLAY
                    | PlaybackState.ACTION_PAUSE
                    | PlaybackState.ACTION_PLAY_PAUSE
                    | PlaybackState.ACTION_SKIP_TO_NEXT
                    | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                    | PlaybackState.ACTION_SEEK_TO;

                PlaybackState state = new PlaybackState.Builder()
                    .setActions(actions)
                    .setState(
                        currentIsPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        currentPositionMs,
                        currentIsPlaying ? 1.0f : 0.0f
                    )
                    .build();
                mediaSession.setPlaybackState(state);
            }
        } catch (Exception ignored) {}
    }

    private void updateSessionAndNotification() {
        try {
            if (mediaSession != null) {
                if (!mediaSession.isActive()) {
                    mediaSession.setActive(true);
                }

                updatePlaybackStateOnly();

                MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, currentArtist)
                    .putString(MediaMetadata.METADATA_KEY_ALBUM, currentAlbum)
                    .putLong(MediaMetadata.METADATA_KEY_DURATION, currentDurationMs);

                Bitmap art = currentArtwork != null ? currentArtwork : defaultIconBitmap;
                if (art != null) {
                    metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art);
                    metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, art);
                }
                mediaSession.setMetadata(metaBuilder.build());
            }

            Notification notification = buildMediaNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception ignored) {}
    }

    private Notification buildMediaNotification() {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openAppIntent, piFlags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        Bitmap art = currentArtwork != null ? currentArtwork : defaultIconBitmap;
        if (art != null) {
            builder.setLargeIcon(art);
        }

        int playPauseIcon = currentIsPlaying
            ? android.R.drawable.ic_media_pause
            : android.R.drawable.ic_media_play;
        String playPauseLabel = currentIsPlaying ? "Pause" : "Play";

        Notification.Action prevAction = new Notification.Action.Builder(
            android.R.drawable.ic_media_previous,
            "Previous",
            buildActionIntent(ACTION_PREV, 201)
        ).build();

        Notification.Action toggleAction = new Notification.Action.Builder(
            playPauseIcon,
            playPauseLabel,
            buildActionIntent(ACTION_TOGGLE, 202)
        ).build();

        Notification.Action nextAction = new Notification.Action.Builder(
            android.R.drawable.ic_media_next,
            "Next",
            buildActionIntent(ACTION_NEXT, 203)
        ).build();

        Notification.MediaStyle mediaStyle = new Notification.MediaStyle();
        if (mediaSession != null) {
            mediaStyle.setMediaSession(mediaSession.getSessionToken());
        }
        mediaStyle.setShowActionsInCompactView(0, 1, 2);

        builder
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSubText(currentAlbum)
            .setContentIntent(contentIntent)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setShowWhen(false)
            .setColor(0xFFE25822)
            .addAction(prevAction)
            .addAction(toggleAction)
            .addAction(nextAction)
            .setStyle(mediaStyle);

        return builder.build();
    }

    private void loadArtworkAsync(final String urlStr) {
        if (urlStr == null || urlStr.isEmpty() || !urlStr.startsWith("http")) {
            currentArtwork = defaultIconBitmap;
            return;
        }
        if (artworkCache.containsKey(urlStr)) {
            currentArtwork = artworkCache.get(urlStr);
            return;
        }

        artworkExecutor.submit(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(urlStr);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14)");
                    if (conn.getResponseCode() == 200) {
                        InputStream is = conn.getInputStream();
                        Bitmap bmp = BitmapFactory.decodeStream(is);
                        is.close();
                        if (bmp != null) {
                            if (artworkCache.size() > 20) {
                                artworkCache.clear();
                            }
                            artworkCache.put(urlStr, bmp);
                            if (urlStr.equals(currentArtworkUrl)) {
                                currentArtwork = bmp;
                                if (mainHandler != null) {
                                    mainHandler.post(new Runnable() {
                                        @Override
                                        public void run() {
                                            updateSessionAndNotification();
                                        }
                                    });
                                }
                            }
                        }
                    }
                } catch (Exception ignored) {
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_PREV.equals(action)) {
                MainActivity.dispatchMediaAction("prev", -1L);
                return START_STICKY;
            } else if (ACTION_TOGGLE.equals(action)) {
                if (currentIsPlaying) {
                    pauseNativePlayer();
                    MainActivity.dispatchMediaAction("pause", -1L);
                } else {
                    playNativePlayer();
                    MainActivity.dispatchMediaAction("play", -1L);
                }
                return START_STICKY;
            } else if (ACTION_NEXT.equals(action)) {
                MainActivity.dispatchMediaAction("next", -1L);
                return START_STICKY;
            } else if (ACTION_LOAD.equals(action)) {
                loadAndPlayInternal(
                    intent.getStringExtra("trackId"),
                    intent.getStringExtra("streamUrl"),
                    intent.getStringExtra("title"),
                    intent.getStringExtra("artist"),
                    intent.getStringExtra("album"),
                    intent.getStringExtra("artworkUrl"),
                    intent.getLongExtra("durationMs", 210000L),
                    intent.getIntExtra("volumePercent", 80)
                );
                return START_STICKY;
            } else if (ACTION_PRELOAD.equals(action)) {
                preloadTrackToDiskAsync(
                    intent.getStringExtra("trackId"),
                    intent.getStringExtra("streamUrl")
                );
                return START_STICKY;
            } else if (ACTION_PLAY.equals(action)) {
                playNativePlayer();
                return START_STICKY;
            } else if (ACTION_PAUSE.equals(action)) {
                pauseNativePlayer();
                return START_STICKY;
            } else if (ACTION_SEEK.equals(action)) {
                seekNativePlayer(intent.getLongExtra("positionMs", 0L));
                return START_STICKY;
            } else if (ACTION_VOLUME.equals(action)) {
                setNativeVolume(intent.getIntExtra("volumePercent", 80));
                return START_STICKY;
            }

            if (intent.hasExtra("title")) {
                String t = intent.getStringExtra("title");
                if (t != null && !t.isEmpty()) currentTitle = t;
            }
            if (intent.hasExtra("artist")) {
                String a = intent.getStringExtra("artist");
                if (a != null && !a.isEmpty()) currentArtist = a;
            }
            if (intent.hasExtra("album")) {
                String al = intent.getStringExtra("album");
                if (al != null && !al.isEmpty()) currentAlbum = al;
            }
            if (intent.hasExtra("durationMs")) {
                long d = intent.getLongExtra("durationMs", currentDurationMs);
                if (d > 0 && !isPrepared) currentDurationMs = d;
            }
            if (intent.hasExtra("artworkUrl")) {
                String artUrl = intent.getStringExtra("artworkUrl");
                if (artUrl != null && !artUrl.equals(currentArtworkUrl)) {
                    currentArtworkUrl = artUrl;
                    loadArtworkAsync(artUrl);
                }
            }
        }

        updateSessionAndNotification();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (instance == this) {
            instance = null;
        }
        if (mainHandler != null) {
            mainHandler.removeCallbacksAndMessages(null);
        }
        releaseWifiLock();
        try {
            if (mediaPlayer != null) {
                mediaPlayer.release();
                mediaPlayer = null;
            }
        } catch (Exception ignored) {}
        try {
            if (mediaSession != null) {
                mediaSession.setActive(false);
                mediaSession.release();
            }
        } catch (Exception ignored) {}
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
