import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/track.dart';
import '../providers/library_provider.dart';
import '../providers/player_provider.dart';
import '../theme/cadence_theme.dart';
import 'track_artwork.dart';

/// Left Slide-Out Side Menu Drawer matching `SideMenuDrawer.tsx`
class CadenceSideMenuDrawer extends ConsumerWidget {
  const CadenceSideMenuDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final libraryState = ref.watch(libraryProvider);
    final playerState = ref.watch(playerProvider);
    final user = libraryState.user;

    return Drawer(
      backgroundColor: CadenceColors.surfaceStage,
      child: SafeArea(
        child: Column(
          children: [
            // Brand Header
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              decoration: const BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: CadenceColors.borderSubtle),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: const BoxDecoration(
                      color: CadenceColors.accentOrange,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.album_rounded,
                      color: Colors.white,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Cadence',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: CadenceColors.textPrimary,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Made by Prithwish',
                          style: TextStyle(
                            fontSize: 11,
                            color: CadenceColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.close_rounded,
                      size: 18,
                      color: CadenceColors.textSecondary,
                    ),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),

            // Scrollable Body
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(14),
                children: [
                  // User Profile Card
                  InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () {
                      Navigator.of(context).pop();
                      context.go('/profile');
                    },
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: CadenceColors.surfaceCard,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: CadenceColors.borderSubtle),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 22,
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
                                      fontWeight: FontWeight.w700,
                                      color: CadenceColors.accentOrange,
                                    ),
                                  ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  user != null ? user.displayName : 'Guest',
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
                                  user != null ? user.email : 'Not signed in',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: CadenceColors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(
                            Icons.chevron_right_rounded,
                            color: CadenceColors.textSecondary,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    child: Text(
                      'MENU',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.0,
                        color: CadenceColors.textSecondary,
                      ),
                    ),
                  ),
                  _buildDrawerLink(
                    context,
                    icon: Icons.person_outline_rounded,
                    label: 'Profile',
                    badge: user != null ? 'Synced' : 'Guest',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.go('/profile');
                    },
                  ),
                  _buildDrawerLink(
                    context,
                    icon: Icons.favorite_border_rounded,
                    label: 'Liked Songs',
                    badge: '${libraryState.likedTracks.length}',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.go('/liked');
                    },
                  ),
                  _buildDrawerLink(
                    context,
                    icon: Icons.queue_music_rounded,
                    label: 'Playlists',
                    badge: '${libraryState.playlists.length}',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.go('/library');
                    },
                  ),
                  _buildDrawerLink(
                    context,
                    icon: Icons.file_download_outlined,
                    label: 'Import Playlist',
                    badge: 'URL / List',
                    onTap: () {
                      Navigator.of(context).pop();
                      showImportPlaylistModal(context);
                    },
                  ),
                  _buildDrawerLink(
                    context,
                    icon: Icons.home_outlined,
                    label: 'Home',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.go('/');
                    },
                  ),
                  _buildDrawerLink(
                    context,
                    icon: Icons.settings_outlined,
                    label: 'Settings & About',
                    onTap: () {
                      Navigator.of(context).pop();
                      context.go('/settings');
                    },
                  ),
                  const Divider(
                    height: 28,
                    color: CadenceColors.borderSubtle,
                  ),
                  _buildDrawerLink(
                    context,
                    icon: Icons.nightlight_round,
                    label: 'Sleep Timer',
                    badge: playerState.sleepTimerRemainingSeconds != null
                        ? '${(playerState.sleepTimerRemainingSeconds! / 60).ceil()}m left'
                        : 'Off',
                    onTap: () {
                      Navigator.of(context).pop();
                      showSleepTimerSheet(context);
                    },
                  ),
                ],
              ),
            ),

            // Bottom Auth Action Footer
            Container(
              padding: const EdgeInsets.all(14),
              decoration: const BoxDecoration(
                color: Color(0xFF0E0E12),
                border: Border(
                  top: BorderSide(color: CadenceColors.borderSubtle),
                ),
              ),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: user != null
                        ? Colors.white.withOpacity(0.08)
                        : CadenceColors.accentOrange,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  icon: Icon(
                    user != null ? Icons.logout_rounded : Icons.login_rounded,
                    size: 18,
                  ),
                  label: Text(
                    user != null ? 'Sign Out' : 'Continue with Google',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  onPressed: () {
                    Navigator.of(context).pop();
                    if (user != null) {
                      ref.read(libraryProvider.notifier).signOut();
                    } else {
                      ref.read(libraryProvider.notifier).signInWithGoogle();
                    }
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDrawerLink(
    BuildContext context, {
    required IconData icon,
    required String label,
    String? badge,
    required VoidCallback onTap,
  }) {
    return ListTile(
      dense: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      leading: Icon(icon, color: CadenceColors.textPrimary, size: 20),
      title: Text(
        label,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: CadenceColors.textPrimary,
        ),
      ),
      trailing: badge != null
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.07),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                badge,
                style: const TextStyle(
                  fontSize: 11,
                  color: CadenceColors.textSecondary,
                ),
              ),
            )
          : null,
      onTap: onTap,
    );
  }
}

/// Queue Bottom Sheet matching `QueueDrawer.tsx`
void showQueueBottomSheet(BuildContext context) {
  showModalBottomSheet(
    context: context,
    backgroundColor: CadenceColors.surfaceStage,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => Consumer(
      builder: (context, ref, _) {
        final playerState = ref.watch(playerProvider);
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.65,
          maxChildSize: 0.9,
          minChildSize: 0.4,
          builder: (_, controller) => Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 12, 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.queue_music_rounded,
                          color: CadenceColors.accentOrange,
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'Up Next Queue',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: CadenceColors.textPrimary,
                          ),
                        ),
                        if (playerState.shuffle) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color:
                                  CadenceColors.accentOrange.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: const Text(
                              'Shuffled',
                              style: TextStyle(
                                fontSize: 11,
                                color: CadenceColors.accentOrange,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1, color: CadenceColors.borderSubtle),
              Expanded(
                child: ListView.builder(
                  controller: controller,
                  padding: const EdgeInsets.all(12),
                  itemCount: playerState.queue.length,
                  itemBuilder: (context, idx) {
                    final track = playerState.queue[idx];
                    final isCurrent =
                        track.id == playerState.currentTrack.id;
                    return ListTile(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      tileColor: isCurrent
                          ? CadenceColors.accentOrange.withOpacity(0.12)
                          : null,
                      leading: TrackArtwork(
                        imageUrl: track.thumbnailUrl,
                        size: 40,
                        isPlaying: isCurrent && playerState.isPlaying,
                      ),
                      title: Text(
                        track.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: isCurrent
                              ? CadenceColors.accentOrange
                              : CadenceColors.textPrimary,
                        ),
                      ),
                      subtitle: Text(
                        track.artist,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          color: CadenceColors.textSecondary,
                        ),
                      ),
                      trailing: isCurrent
                          ? const Icon(
                              Icons.play_arrow_rounded,
                              color: CadenceColors.accentOrange,
                            )
                          : IconButton(
                              icon: const Icon(
                                Icons.delete_outline_rounded,
                                size: 18,
                                color: CadenceColors.textSecondary,
                              ),
                              onPressed: () {
                                ref
                                    .read(playerProvider.notifier)
                                    .removeFromQueue(track.id);
                              },
                            ),
                      onTap: () {
                        ref.read(playerProvider.notifier).playTrack(track);
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}

/// Sleep Timer Sheet matching `SleepTimerModal.tsx`
void showSleepTimerSheet(BuildContext context) {
  showModalBottomSheet(
    context: context,
    backgroundColor: CadenceColors.surfaceStage,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => Consumer(
      builder: (context, ref, _) {
        final playerState = ref.watch(playerProvider);
        final presets = [15, 30, 45, 60];

        return Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Row(
                    children: [
                      Icon(
                        Icons.nightlight_round,
                        color: CadenceColors.accentOrange,
                      ),
                      SizedBox(width: 10),
                      Text(
                        'Sleep Timer',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: CadenceColors.textPrimary,
                        ),
                      ),
                    ],
                  ),
                  if (playerState.sleepTimerRemainingSeconds != null)
                    TextButton(
                      onPressed: () {
                        ref.read(playerProvider.notifier).cancelSleepTimer();
                        Navigator.of(context).pop();
                      },
                      child: const Text(
                        'Turn Off',
                        style: TextStyle(color: CadenceColors.danger),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              for (final mins in presets)
                ListTile(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  leading: const Icon(
                    Icons.access_time_rounded,
                    color: CadenceColors.textSecondary,
                  ),
                  title: Text(
                    mins == 60 ? '1 hour' : '$mins minutes',
                    style: const TextStyle(color: CadenceColors.textPrimary),
                  ),
                  onTap: () {
                    ref
                        .read(playerProvider.notifier)
                        .setSleepTimerMinutes(mins);
                    Navigator.of(context).pop();
                  },
                ),
              ListTile(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                leading: const Icon(
                  Icons.auto_awesome_rounded,
                  color: CadenceColors.accentOrange,
                ),
                title: const Text(
                  'End of track',
                  style: TextStyle(color: CadenceColors.textPrimary),
                ),
                subtitle: Text(
                  playerState.currentTrack.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    color: CadenceColors.textSecondary,
                  ),
                ),
                onTap: () {
                  ref
                      .read(playerProvider.notifier)
                      .setSleepTimerEndOfTrack();
                  Navigator.of(context).pop();
                },
              ),
            ],
          ),
        );
      },
    ),
  );
}

/// Create / Save to Playlist Modal matching `PlaylistModal.tsx`
void showPlaylistModal(BuildContext context, {Track? trackToAdd}) {
  final nameCtrl = TextEditingController();
  final descCtrl = TextEditingController();

  showDialog(
    context: context,
    builder: (ctx) => Consumer(
      builder: (context, ref, _) {
        final libraryState = ref.watch(libraryProvider);
        return AlertDialog(
          title: Text(
            trackToAdd != null ? 'Save to Playlist' : 'Create New Playlist',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: CadenceColors.textPrimary,
            ),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (trackToAdd != null && libraryState.playlists.isNotEmpty) ...[
                  for (final pl in libraryState.playlists)
                    ListTile(
                      dense: true,
                      leading: const Icon(
                        Icons.queue_music_rounded,
                        color: CadenceColors.accentOrange,
                      ),
                      title: Text(
                        pl.name,
                        style: const TextStyle(color: CadenceColors.textPrimary),
                      ),
                      subtitle: Text(
                        '${pl.tracks.length} songs',
                        style: const TextStyle(
                          fontSize: 12,
                          color: CadenceColors.textSecondary,
                        ),
                      ),
                      trailing: const Icon(
                        Icons.add_rounded,
                        color: CadenceColors.accentOrange,
                      ),
                      onTap: () {
                        ref
                            .read(libraryProvider.notifier)
                            .addTrackToPlaylist(pl.id, trackToAdd);
                        Navigator.of(context).pop();
                      },
                    ),
                  const Divider(color: CadenceColors.borderSubtle),
                ],
                TextField(
                  controller: nameCtrl,
                  style: const TextStyle(color: CadenceColors.textPrimary),
                  decoration: const InputDecoration(
                    labelText: 'New Playlist Name',
                    hintText: 'e.g., Late Night Sunset Drive',
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: descCtrl,
                  style: const TextStyle(color: CadenceColors.textPrimary),
                  decoration: const InputDecoration(
                    labelText: 'Description (Optional)',
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: CadenceColors.accentOrange,
                foregroundColor: Colors.white,
              ),
              onPressed: () {
                if (nameCtrl.text.trim().isEmpty) return;
                ref.read(libraryProvider.notifier).createPlaylist(
                      nameCtrl.text.trim(),
                      descCtrl.text.trim(),
                      initialTrack: trackToAdd,
                    );
                Navigator.of(context).pop();
              },
              child: const Text('Create Playlist'),
            ),
          ],
        );
      },
    ),
  );
}

/// Import Playlist Modal matching `ImportPlaylistModal.tsx`
void showImportPlaylistModal(BuildContext context) {
  final nameCtrl = TextEditingController();
  final linesCtrl = TextEditingController();

  showDialog(
    context: context,
    builder: (ctx) => Consumer(
      builder: (context, ref, _) {
        return AlertDialog(
          title: const Text(
            'Import Playlist',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: CadenceColors.textPrimary,
            ),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameCtrl,
                  style: const TextStyle(color: CadenceColors.textPrimary),
                  decoration: const InputDecoration(
                    labelText: 'Playlist Name',
                    hintText: 'My Imported Mix',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: linesCtrl,
                  maxLines: 4,
                  style: const TextStyle(color: CadenceColors.textPrimary),
                  decoration: const InputDecoration(
                    labelText: 'Songs (One per line: Title - Artist)',
                    hintText:
                        "November Rain - Guns N' Roses\nNumb - Linkin Park",
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: CadenceColors.accentOrange,
                foregroundColor: Colors.white,
              ),
              onPressed: () {
                final lines = linesCtrl.text
                    .split(RegExp(r'\r?\n'))
                    .where((l) => l.trim().isNotEmpty)
                    .toList();
                if (lines.isEmpty) return;
                ref
                    .read(libraryProvider.notifier)
                    .importPlaylistFromLines(nameCtrl.text, lines);
                Navigator.of(context).pop();
              },
              child: const Text('Import'),
            ),
          ],
        );
      },
    ),
  );
}
