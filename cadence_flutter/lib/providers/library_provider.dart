import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../data/curated_catalog.dart';
import '../models/playlist.dart';
import '../models/track.dart';
import '../models/user_profile.dart';
import '../services/google_auth_service.dart';

/// Explicit 5-state authentication state machine:
/// - initialising
/// - signedOut
/// - signingIn
/// - authenticated
/// - authenticationFailed
enum CadenceAuthStatus {
  initialising,
  signedOut,
  signingIn,
  authenticated,
  authenticationFailed,
}

class LibraryState {
  final CadenceAuthStatus authStatus;
  final CadenceUserProfile? user;
  final String? authError;
  final List<Track> likedTracks;
  final List<Playlist> playlists;
  final List<Track> recentlyPlayed;

  const LibraryState({
    this.authStatus = CadenceAuthStatus.initialising,
    this.user,
    this.authError,
    required this.likedTracks,
    required this.playlists,
    this.recentlyPlayed = const [],
  });

  bool get isSigningIn => authStatus == CadenceAuthStatus.signingIn;
  bool get isAuthenticated =>
      authStatus == CadenceAuthStatus.authenticated && user != null;

  bool isLiked(String trackId) => likedTracks.any((t) => t.id == trackId);

  LibraryState copyWith({
    CadenceAuthStatus? authStatus,
    CadenceUserProfile? user,
    bool clearUser = false,
    String? authError,
    bool clearAuthError = false,
    List<Track>? likedTracks,
    List<Playlist>? playlists,
    List<Track>? recentlyPlayed,
  }) {
    return LibraryState(
      authStatus: authStatus ?? this.authStatus,
      user: clearUser ? null : (user ?? this.user),
      authError: clearAuthError ? null : (authError ?? this.authError),
      likedTracks: likedTracks ?? this.likedTracks,
      playlists: playlists ?? this.playlists,
      recentlyPlayed: recentlyPlayed ?? this.recentlyPlayed,
    );
  }
}

class LibraryNotifier extends StateNotifier<LibraryState> {
  final GoogleAuthService _authService;
  bool _signInLock = false;

  static const _likesKey = 'cadence_flutter_exp_likes_v1';
  static const _playlistsKey = 'cadence_flutter_exp_playlists_v1';
  static const _recentKey = 'cadence_flutter_exp_recent_v1';
  static const _userKey = 'cadence_flutter_exp_user_v1';

  LibraryNotifier(this._authService)
      : super(
          LibraryState(
            authStatus: CadenceAuthStatus.initialising,
            likedTracks: curatedTracks.sublist(0, 3),
            playlists: defaultGuestPlaylists,
            recentlyPlayed: curatedTracks.sublist(0, 6),
          ),
        ) {
    _loadPersistedTestState();
  }

  Future<void> _loadPersistedTestState() async {
    try {
      final prefs = await SharedPreferences.getInstance();

      final rawUser = prefs.getString(_userKey);
      CadenceUserProfile? loadedUser;
      if (rawUser != null && rawUser.isNotEmpty) {
        loadedUser = CadenceUserProfile.fromJson(
          jsonDecode(rawUser) as Map<String, dynamic>,
        );
      }

      // If no persisted user or token needs refresh, also check silent Google Sign-In restore
      if (loadedUser == null) {
        loadedUser = await _authService.restoreExistingGoogleSession();
      }

      final rawLikes = prefs.getString(_likesKey);
      List<Track>? loadedLikes;
      if (rawLikes != null && rawLikes.isNotEmpty) {
        final list = jsonDecode(rawLikes) as List<dynamic>;
        loadedLikes = list
            .whereType<Map>()
            .map((m) => Track.fromJson(Map<String, dynamic>.from(m)))
            .toList();
      }

      final rawPlaylists = prefs.getString(_playlistsKey);
      List<Playlist>? loadedPlaylists;
      if (rawPlaylists != null && rawPlaylists.isNotEmpty) {
        final list = jsonDecode(rawPlaylists) as List<dynamic>;
        loadedPlaylists = list
            .whereType<Map>()
            .map((m) => Playlist.fromJson(Map<String, dynamic>.from(m)))
            .toList();
      }

      final rawRecent = prefs.getString(_recentKey);
      List<Track>? loadedRecent;
      if (rawRecent != null && rawRecent.isNotEmpty) {
        final list = jsonDecode(rawRecent) as List<dynamic>;
        loadedRecent = list
            .whereType<Map>()
            .map((m) => Track.fromJson(Map<String, dynamic>.from(m)))
            .toList();
      }

      state = state.copyWith(
        authStatus: loadedUser != null
            ? CadenceAuthStatus.authenticated
            : CadenceAuthStatus.signedOut,
        user: loadedUser,
        likedTracks: loadedLikes,
        playlists: loadedPlaylists,
        recentlyPlayed: loadedRecent,
      );

      if (loadedUser != null) {
        await _persistState();
      }
    } catch (e) {
      debugPrint('[CadenceAuth][sessionPersistenceFailure] Failed restoring state: ${e.runtimeType}');
      state = state.copyWith(authStatus: CadenceAuthStatus.signedOut);
    }
  }

  Future<void> _persistState() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _likesKey,
        jsonEncode(state.likedTracks.map((t) => t.toJson()).toList()),
      );
      await prefs.setString(
        _playlistsKey,
        jsonEncode(state.playlists.map((p) => p.toJson()).toList()),
      );
      await prefs.setString(
        _recentKey,
        jsonEncode(state.recentlyPlayed.map((t) => t.toJson()).toList()),
      );
      if (state.user != null) {
        await prefs.setString(_userKey, jsonEncode(state.user!.toJson()));
      } else {
        await prefs.remove(_userKey);
      }
    } catch (e) {
      debugPrint('[CadenceAuth][sessionPersistenceFailure] Failed persisting state: ${e.runtimeType}');
    }
  }

  /// Primary Google Sign-In via External Browser OAuth 2.0 + Deep Link Redirect
  /// back into the app with race-condition prevention lock.
  Future<void> signInWithGoogle() async {
    if (_signInLock || state.authStatus == CadenceAuthStatus.signingIn) {
      return;
    }
    _signInLock = true;
    state = state.copyWith(
      authStatus: CadenceAuthStatus.signingIn,
      clearAuthError: true,
    );

    try {
      final profile = await _authService.signInWithExternalBrowserOAuth();
      if (profile != null) {
        state = state.copyWith(
          authStatus: CadenceAuthStatus.authenticated,
          user: profile,
          clearAuthError: true,
        );
        await _persistState();
      } else {
        state = state.copyWith(
          authStatus: state.user != null
              ? CadenceAuthStatus.authenticated
              : CadenceAuthStatus.signedOut,
        );
      }
    } on CadenceAuthException catch (e) {
      state = state.copyWith(
        authStatus: CadenceAuthStatus.authenticationFailed,
        authError: e.userMessage,
      );
    } catch (e) {
      state = state.copyWith(
        authStatus: CadenceAuthStatus.authenticationFailed,
        authError:
            'External browser Google Sign-In failed. Please check your connection and try again.',
      );
    } finally {
      _signInLock = false;
    }
  }

  /// Fallback External Browser OAuth 2.0 Authorization Code + PKCE flow.
  Future<void> signInWithExternalBrowser() async {
    if (_signInLock || state.authStatus == CadenceAuthStatus.signingIn) {
      return;
    }
    _signInLock = true;
    state = state.copyWith(
      authStatus: CadenceAuthStatus.signingIn,
      clearAuthError: true,
    );

    try {
      final profile = await _authService.signInWithExternalBrowserOAuth();
      if (profile != null) {
        state = state.copyWith(
          authStatus: CadenceAuthStatus.authenticated,
          user: profile,
          clearAuthError: true,
        );
        await _persistState();
      } else {
        state = state.copyWith(
          authStatus: state.user != null
              ? CadenceAuthStatus.authenticated
              : CadenceAuthStatus.signedOut,
        );
      }
    } on CadenceAuthException catch (e) {
      state = state.copyWith(
        authStatus: CadenceAuthStatus.authenticationFailed,
        authError: e.userMessage,
      );
    } catch (_) {
      state = state.copyWith(
        authStatus: CadenceAuthStatus.authenticationFailed,
        authError: 'External browser OAuth sign-in did not complete.',
      );
    } finally {
      _signInLock = false;
    }
  }

  Future<void> signOut() async {
    _signInLock = false;
    await _authService.signOut();
    state = state.copyWith(
      authStatus: CadenceAuthStatus.signedOut,
      clearUser: true,
      clearAuthError: true,
    );
    await _persistState();
  }

  Future<void> updateDisplayName(String newName) async {
    final trimmed = newName.trim();
    if (trimmed.isEmpty || state.user == null) return;
    state = state.copyWith(
      user: state.user!.copyWith(displayName: trimmed),
    );
    await _persistState();
  }

  Future<void> toggleLike(Track track) async {
    final exists = state.likedTracks.any((t) => t.id == track.id);
    final updated = exists
        ? state.likedTracks.where((t) => t.id != track.id).toList()
        : [track, ...state.likedTracks];
    state = state.copyWith(likedTracks: updated);
    await _persistState();
  }

  Future<void> recordRecentlyPlayed(Track track) async {
    final filtered =
        state.recentlyPlayed.where((t) => t.id != track.id).toList();
    final updated = [track, ...filtered].take(20).toList();
    state = state.copyWith(recentlyPlayed: updated);
    await _persistState();
  }

  Future<String> createPlaylist(
    String name,
    String description, {
    Track? initialTrack,
  }) async {
    final id = 'pl_${DateTime.now().millisecondsSinceEpoch}';
    final newPl = Playlist(
      id: id,
      ownerId: state.user?.uid ?? 'guest',
      name: name.trim().isEmpty ? 'My Sunset Playlist' : name.trim(),
      description: description.trim(),
      tracks: initialTrack != null ? [initialTrack] : const [],
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    state = state.copyWith(playlists: [newPl, ...state.playlists]);
    await _persistState();
    return id;
  }

  Future<String> importPlaylistFromLines(
    String name,
    List<String> lines,
  ) async {
    final matchedTracks = <Track>[];
    for (final raw in lines) {
      final line = raw.trim();
      if (line.isEmpty) continue;
      final q = line.toLowerCase();
      final match = curatedTracks.firstWhere(
        (t) =>
            t.title.toLowerCase().contains(q) ||
            q.contains(t.title.toLowerCase()),
        orElse: () => Track(
          id: 'yt_${line.hashCode.abs()}',
          title: line.split('-').first.trim(),
          artist: line.contains('-')
              ? line.split('-').last.trim()
              : 'Imported Artist',
          album: 'Imported',
          duration: 215,
          thumbnailUrl: featuredTrack.thumbnailUrl,
        ),
      );
      matchedTracks.add(match);
    }

    final id = 'pl_${DateTime.now().millisecondsSinceEpoch}';
    final newPl = Playlist(
      id: id,
      ownerId: state.user?.uid ?? 'guest',
      name: name.trim().isEmpty ? 'Imported Playlist' : name.trim(),
      description: 'Imported playlist (${matchedTracks.length} songs)',
      tracks: matchedTracks,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    state = state.copyWith(playlists: [newPl, ...state.playlists]);
    await _persistState();
    return id;
  }

  Future<void> deletePlaylist(String playlistId) async {
    state = state.copyWith(
      playlists: state.playlists.where((p) => p.id != playlistId).toList(),
    );
    await _persistState();
  }

  Future<void> addTrackToPlaylist(String playlistId, Track track) async {
    final updated = state.playlists.map((pl) {
      if (pl.id != playlistId) return pl;
      if (pl.tracks.any((t) => t.id == track.id)) return pl;
      return pl.copyWith(
        tracks: [...pl.tracks, track],
        updatedAt: DateTime.now(),
      );
    }).toList();
    state = state.copyWith(playlists: updated);
    await _persistState();
  }

  Future<void> removeTrackFromPlaylist(
    String playlistId,
    String trackId,
  ) async {
    final updated = state.playlists.map((pl) {
      if (pl.id != playlistId) return pl;
      return pl.copyWith(
        tracks: pl.tracks.where((t) => t.id != trackId).toList(),
        updatedAt: DateTime.now(),
      );
    }).toList();
    state = state.copyWith(playlists: updated);
    await _persistState();
  }
}

final googleAuthServiceProvider = Provider<GoogleAuthService>((ref) {
  return GoogleAuthService();
});

final libraryProvider =
    StateNotifierProvider<LibraryNotifier, LibraryState>((ref) {
  return LibraryNotifier(ref.watch(googleAuthServiceProvider));
});
