import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/track.dart';
import '../providers/library_provider.dart';
import '../providers/player_provider.dart';
import '../theme/cadence_theme.dart';
import 'modals_and_drawers.dart';
import 'track_artwork.dart';

class TrackRow extends ConsumerWidget {
  final Track track;
  final int index;
  final List<Track>? queueContext;
  final VoidCallback? onRemoveFromPlaylist;
  final bool hideDuration;

  const TrackRow({
    super.key,
    required this.track,
    required this.index,
    this.queueContext,
    this.onRemoveFromPlaylist,
    this.hideDuration = false,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playerState = ref.watch(playerProvider);
    final libraryState = ref.watch(libraryProvider);

    final isCurrent = playerState.currentTrack.id == track.id;
    final isPlaying = isCurrent && playerState.isPlaying;
    final isLiked = libraryState.isLiked(track.id);

    return Material(
      color: isCurrent
          ? Colors.white.withOpacity(0.08)
          : Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () {
          if (isCurrent) {
            ref.read(playerProvider.notifier).togglePlayPause();
          } else {
            ref
                .read(playerProvider.notifier)
                .playTrack(track, newQueue: queueContext);
            ref.read(libraryProvider.notifier).recordRecentlyPlayed(track);
          }
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          child: Row(
            children: [
              SizedBox(
                width: 26,
                child: Center(
                  child: isPlaying
                      ? const Icon(
                          Icons.equalizer_rounded,
                          color: CadenceColors.accentOrange,
                          size: 18,
                        )
                      : Text(
                          '${index + 1}',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight:
                                isCurrent ? FontWeight.w700 : FontWeight.w500,
                            color: isCurrent
                                ? CadenceColors.accentOrange
                                : CadenceColors.textSecondary,
                          ),
                        ),
                ),
              ),
              const SizedBox(width: 10),
              TrackArtwork(
                imageUrl: track.thumbnailUrl,
                size: 42,
                borderRadius: 6,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
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
                  isLiked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                  size: 19,
                  color: isLiked
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
                  size: 19,
                  color: CadenceColors.textSecondary,
                ),
                onPressed: () {
                  showPlaylistModal(context, trackToAdd: track);
                },
              ),
              if (onRemoveFromPlaylist != null)
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(
                    Icons.delete_outline_rounded,
                    size: 19,
                    color: CadenceColors.textSecondary,
                  ),
                  onPressed: onRemoveFromPlaylist,
                ),
              if (!hideDuration)
                Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: Text(
                    track.formattedDuration,
                    style: const TextStyle(
                      fontSize: 12,
                      color: CadenceColors.textSecondary,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
