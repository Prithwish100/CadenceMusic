import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/library_provider.dart';
import '../providers/player_provider.dart';
import '../theme/cadence_theme.dart';
import 'maximized_player_sheet.dart';
import 'modals_and_drawers.dart';
import 'track_artwork.dart';

class MiniPlayerBar extends ConsumerWidget {
  const MiniPlayerBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playerState = ref.watch(playerProvider);
    final libraryState = ref.watch(libraryProvider);
    final track = playerState.currentTrack;
    final liked = libraryState.isLiked(track.id);

    final progress = playerState.duration > 0
        ? (playerState.currentTime / playerState.duration).clamp(0.0, 1.0)
        : 0.0;

    return GestureDetector(
      onTap: () => showMaximizedPlayerSheet(context),
      onVerticalDragEnd: (details) {
        if ((details.primaryVelocity ?? 0) < -150) {
          showMaximizedPlayerSheet(context);
        }
      },
      child: Container(
        height: 70,
        decoration: const BoxDecoration(
          color: CadenceColors.backgroundPrimary,
          border: Border(
            top: BorderSide(color: CadenceColors.borderSubtle),
          ),
        ),
        child: Column(
          children: [
            // Sunset Flame top progress indicator strip
            LinearProgressIndicator(
              value: progress,
              minHeight: 2.2,
              backgroundColor: Colors.white.withOpacity(0.1),
              valueColor: const AlwaysStoppedAnimation<Color>(
                CadenceColors.accentOrange,
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    TrackArtwork(
                      imageUrl: track.thumbnailUrl,
                      size: 44,
                      borderRadius: 6,
                      heroTag: 'mini_player_art_${track.id}',
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            track.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: CadenceColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            track.artist,
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
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      icon: Icon(
                        liked
                            ? Icons.favorite_rounded
                            : Icons.favorite_border_rounded,
                        size: 20,
                        color: liked
                            ? CadenceColors.accentOrange
                            : CadenceColors.textSecondary,
                      ),
                      onPressed: () {
                        ref.read(libraryProvider.notifier).toggleLike(track);
                      },
                    ),
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      icon: const Icon(
                        Icons.add_circle_outline_rounded,
                        size: 20,
                        color: CadenceColors.textSecondary,
                      ),
                      onPressed: () {
                        showPlaylistModal(context, trackToAdd: track);
                      },
                    ),
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      icon: const Icon(
                        Icons.skip_previous_rounded,
                        size: 24,
                        color: CadenceColors.textPrimary,
                      ),
                      onPressed: () {
                        ref.read(playerProvider.notifier).prevTrack();
                      },
                    ),
                    const SizedBox(width: 2),
                    GestureDetector(
                      onTap: () {
                        ref.read(playerProvider.notifier).togglePlayPause();
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        width: 38,
                        height: 38,
                        decoration: const BoxDecoration(
                          color: CadenceColors.textPrimary,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          playerState.isPlaying
                              ? Icons.pause_rounded
                              : Icons.play_arrow_rounded,
                          color: CadenceColors.backgroundPrimary,
                          size: 22,
                        ),
                      ),
                    ),
                    const SizedBox(width: 2),
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      icon: const Icon(
                        Icons.skip_next_rounded,
                        size: 24,
                        color: CadenceColors.textPrimary,
                      ),
                      onPressed: () {
                        ref.read(playerProvider.notifier).nextTrack();
                      },
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
