import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../config/test_config.dart';
import '../providers/library_provider.dart';
import '../providers/player_provider.dart';
import '../theme/cadence_theme.dart';
import '../widgets/modals_and_drawers.dart';
import '../widgets/track_artwork.dart';
import '../widgets/track_row.dart';

/// Library Grid Screen (`ActiveView.PLAYLISTS` in `src/App.tsx`)
class LibraryScreen extends ConsumerWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final libraryState = ref.watch(libraryProvider);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Your Library',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: CadenceColors.textPrimary,
              ),
            ),
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: () => showImportPlaylistModal(context),
                  icon: const Icon(Icons.file_download_outlined, size: 16),
                  label: const Text('Import'),
                ),
                const SizedBox(width: 8),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: CadenceColors.accentOrange,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: () => showPlaylistModal(context),
                  icon: const Icon(Icons.add_rounded, size: 16),
                  label: const Text('Create'),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 18),

        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 14,
          crossAxisSpacing: 14,
          childAspectRatio: 0.78,
          children: [
            // Pinned Liked Songs Card
            GestureDetector(
              onTap: () => context.go('/liked'),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: CadenceColors.surfaceCard,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Container(
                        width: double.infinity,
                        decoration: BoxDecoration(
                          gradient: CadenceColors.likedSongsGradient,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Center(
                          child: Icon(
                            Icons.favorite_rounded,
                            color: Colors.white,
                            size: 46,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Liked Songs',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: CadenceColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Playlist · ${libraryState.likedTracks.length} songs',
                      style: const TextStyle(
                        fontSize: 12,
                        color: CadenceColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Custom Playlists
            for (final pl in libraryState.playlists)
              GestureDetector(
                onTap: () => context.go('/playlist/${pl.id}'),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: CadenceColors.surfaceCard,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: SizedBox(
                          width: double.infinity,
                          child: TrackArtwork(
                            imageUrl: pl.tracks.isNotEmpty
                                ? pl.tracks.first.thumbnailUrl
                                : '',
                            size: 140,
                            borderRadius: 8,
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        pl.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: CadenceColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Playlist · ${pl.tracks.length} songs',
                        style: const TextStyle(
                          fontSize: 12,
                          color: CadenceColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// Liked Songs Banner Screen (`ActiveView.LIKED` in `src/App.tsx`)
class LikedSongsScreen extends ConsumerWidget {
  const LikedSongsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final libraryState = ref.watch(libraryProvider);
    final likedTracks = libraryState.likedTracks;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                gradient: CadenceColors.likedSongsGradient,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Center(
                child: Icon(
                  Icons.favorite_rounded,
                  color: Colors.white,
                  size: 54,
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Playlist',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: CadenceColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Liked Songs',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      color: CadenceColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${likedTracks.length} songs',
                    style: const TextStyle(
                      fontSize: 13,
                      color: CadenceColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        if (likedTracks.isNotEmpty)
          Row(
            children: [
              FloatingActionButton(
                heroTag: 'play_liked_fab',
                backgroundColor: CadenceColors.accentOrange,
                onPressed: () {
                  ref
                      .read(playerProvider.notifier)
                      .playTrack(likedTracks.first, newQueue: likedTracks);
                },
                child: const Icon(Icons.play_arrow_rounded, color: Colors.white),
              ),
              const SizedBox(width: 14),
              OutlinedButton.icon(
                onPressed: () {
                  ref.read(playerProvider.notifier).shufflePlay(likedTracks);
                },
                icon: const Icon(Icons.shuffle_rounded, size: 18),
                label: const Text('Shuffle'),
              ),
            ],
          ),
        const SizedBox(height: 16),
        for (int i = 0; i < likedTracks.length; i++)
          TrackRow(
            track: likedTracks[i],
            index: i,
            queueContext: likedTracks,
            hideDuration: true,
          ),
      ],
    );
  }
}

/// Playlist Detail Screen (`ActiveView.PLAYLIST_DETAIL` in `src/App.tsx`)
class PlaylistDetailScreen extends ConsumerWidget {
  final String playlistId;

  const PlaylistDetailScreen({super.key, required this.playlistId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final libraryState = ref.watch(libraryProvider);
    final playlist = libraryState.playlists
        .where((p) => p.id == playlistId)
        .firstOrNull;

    if (playlist == null) {
      return const Center(
        child: Text(
          'Playlist not found',
          style: TextStyle(color: CadenceColors.textSecondary),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            TrackArtwork(
              imageUrl: playlist.tracks.isNotEmpty
                  ? playlist.tracks.first.thumbnailUrl
                  : '',
              size: 120,
              borderRadius: 12,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Playlist',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: CadenceColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    playlist.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: CadenceColors.textPrimary,
                    ),
                  ),
                  if (playlist.description.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      playlist.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: CadenceColors.textSecondary,
                      ),
                    ),
                  ],
                  const SizedBox(height: 4),
                  Text(
                    '${playlist.tracks.length} songs',
                    style: const TextStyle(
                      fontSize: 12,
                      color: CadenceColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            if (playlist.tracks.isNotEmpty) ...[
              FloatingActionButton(
                heroTag: 'play_pl_${playlist.id}',
                backgroundColor: CadenceColors.accentOrange,
                onPressed: () {
                  ref.read(playerProvider.notifier).playTrack(
                        playlist.tracks.first,
                        newQueue: playlist.tracks,
                      );
                },
                child: const Icon(Icons.play_arrow_rounded, color: Colors.white),
              ),
              const SizedBox(width: 14),
              OutlinedButton.icon(
                onPressed: () {
                  ref
                      .read(playerProvider.notifier)
                      .shufflePlay(playlist.tracks);
                },
                icon: const Icon(Icons.shuffle_rounded, size: 18),
                label: const Text('Shuffle'),
              ),
              const SizedBox(width: 10),
            ],
            IconButton(
              icon: const Icon(
                Icons.delete_outline_rounded,
                color: CadenceColors.danger,
              ),
              onPressed: () {
                ref.read(libraryProvider.notifier).deletePlaylist(playlist.id);
                context.go('/library');
              },
            ),
          ],
        ),
        const SizedBox(height: 16),
        for (int i = 0; i < playlist.tracks.length; i++)
          TrackRow(
            track: playlist.tracks[i],
            index: i,
            queueContext: playlist.tracks,
            onRemoveFromPlaylist: () {
              ref
                  .read(libraryProvider.notifier)
                  .removeTrackFromPlaylist(playlist.id, playlist.tracks[i].id);
            },
            hideDuration: true,
          ),
      ],
    );
  }
}

/// User Profile & Native Google Account Picker Screen (`ActiveView.PROFILE`)
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final libraryState = ref.watch(libraryProvider);
    final playerState = ref.watch(playerProvider);
    final user = libraryState.user;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: CadenceColors.surfaceCard,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: CadenceColors.borderSubtle),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 36,
                    backgroundColor:
                        CadenceColors.accentOrange.withOpacity(0.2),
                    backgroundImage: (user != null &&
                            user.photoUrl != null &&
                            user.photoUrl!.isNotEmpty)
                        ? NetworkImage(user.photoUrl!)
                        : null,
                    child: (user != null &&
                            user.photoUrl != null &&
                            user.photoUrl!.isNotEmpty)
                        ? null
                        : Text(
                            user != null ? user.initial : 'G',
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                              color: CadenceColors.accentOrange,
                            ),
                          ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: CadenceColors.accentOrange.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(999),
                            border:
                                Border.all(color: CadenceColors.borderAccent),
                          ),
                          child: Text(
                            user != null
                                ? 'Native Google Account (${user.authSource})'
                                : 'Guest Session (Experimental Test Build)',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: CadenceColors.accentOrange,
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          user != null ? user.displayName : 'Guest',
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            color: CadenceColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          user != null
                              ? user.email
                              : 'Tap Continue with Google to open the native Android Credential Manager / Google Account Picker.',
                          style: const TextStyle(
                            fontSize: 13,
                            color: CadenceColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: user != null
                        ? Colors.white.withOpacity(0.08)
                        : CadenceColors.accentOrange,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  icon: Icon(
                    user != null ? Icons.logout_rounded : Icons.login_rounded,
                  ),
                  label: Text(
                    user != null ? 'Sign Out' : 'Continue with Google',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  onPressed: () {
                    if (user != null) {
                      ref.read(libraryProvider.notifier).signOut();
                    } else {
                      ref.read(libraryProvider.notifier).signInWithGoogle();
                    }
                  },
                ),
              ),
              if (libraryState.authError != null) ...[
                const SizedBox(height: 10),
                Text(
                  libraryState.authError!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: CadenceColors.accentOrangeHover,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Stats Cards matching Profile view in src/App.tsx
        Row(
          children: [
            Expanded(
              child: _buildStatCard(
                label: 'Liked Songs',
                value: '${libraryState.likedTracks.length}',
                icon: Icons.favorite_rounded,
                onTap: () => context.go('/liked'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildStatCard(
                label: 'Playlists',
                value: '${libraryState.playlists.length}',
                icon: Icons.queue_music_rounded,
                onTap: () => context.go('/library'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildStatCard(
                label: 'Sleep Timer',
                value: playerState.sleepTimerRemainingSeconds != null
                    ? '${(playerState.sleepTimerRemainingSeconds! / 60).ceil()}m'
                    : 'Off',
                icon: Icons.nightlight_round,
                onTap: () => showSleepTimerSheet(context),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStatCard({
    required String label,
    required String value,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: CadenceColors.surfaceCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: CadenceColors.borderSubtle),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: CadenceColors.textSecondary,
                  ),
                ),
                Icon(icon, size: 15, color: CadenceColors.accentOrange),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: CadenceColors.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Settings & About Screen (`ActiveView.ABOUT` + Experimental Test Configuration Info)
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: CadenceColors.surfaceCard,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: CadenceColors.borderSubtle),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Made this out of boredom, hope it to be working :-!',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: CadenceColors.textPrimary,
                ),
              ),
              SizedBox(height: 8),
              Text(
                'feedback/contact us: prithwishdey.100@gmail.com',
                style: TextStyle(
                  fontSize: 13,
                  color: CadenceColors.accentOrange,
                ),
              ),
              SizedBox(height: 8),
              Text(
                'Made by Prithwish Dey',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  fontStyle: FontStyle.italic,
                  color: CadenceColors.textPrimary,
                ),
              ),
              SizedBox(height: 14),
              Divider(height: 1, color: CadenceColors.borderSubtle),
              SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'App Version',
                    style: TextStyle(
                      fontSize: 12,
                      color: CadenceColors.textSecondary,
                    ),
                  ),
                  Text(
                    CadenceTestConfig.appVersion,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: CadenceColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: CadenceColors.surfaceCard,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: CadenceColors.borderSubtle),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Experimental Native Build Isolation',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: CadenceColors.textPrimary,
                ),
              ),
              SizedBox(height: 8),
              Text(
                '• Application ID: ${CadenceTestConfig.applicationId}\n'
                '• Version: ${CadenceTestConfig.appVersion}\n'
                '• Isolated from production app.cadence.player\n'
                '• Playback Engine: Hybrid YouTube Innertube Audio Stream + Embedded YT.Player Fallback (No yt-dlp)\n'
                '• Auth Engine: Native Android AccountPicker / Credential Manager & iOS GIDSignIn',
                style: TextStyle(
                  fontSize: 12.5,
                  height: 1.5,
                  color: CadenceColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
