import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../data/curated_catalog.dart';
import '../models/track.dart';
import '../providers/library_provider.dart';
import '../providers/player_provider.dart';
import '../theme/cadence_theme.dart';
import '../widgets/track_artwork.dart';
import '../widgets/track_row.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  String _timeGreeting(String? firstName) {
    final hour = DateTime.now().hour;
    String base = 'Good evening';
    if (hour >= 5 && hour < 12) {
      base = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      base = 'Good afternoon';
    } else if (hour >= 17 && hour < 22) {
      base = 'Good evening';
    } else {
      base = 'Good night';
    }
    return (firstName != null && firstName.isNotEmpty)
        ? '$base, $firstName'
        : base;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final libraryState = ref.watch(libraryProvider);
    final playerState = ref.watch(playerProvider);

    final topSixGrid = curatedTracks.take(6).toList();
    final madeForYou = curatedTracks.take(6).toList();
    final sunsetSessions = curatedTracks.skip(6).take(6).toList();

    return Container(
      decoration: const BoxDecoration(
        gradient: CadenceColors.topAmbientGradient,
      ),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
        children: [
          // Greeting Header
          Text(
            _timeGreeting(libraryState.user?.firstName),
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: CadenceColors.textPrimary,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 16),

          // Spotify-style 6-Tile Quick Grid
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: topSixGrid.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 3.1,
            ),
            itemBuilder: (context, idx) {
              final track = topSixGrid[idx];
              final isCurrent = playerState.currentTrack.id == track.id;
              return InkWell(
                borderRadius: BorderRadius.circular(6),
                onTap: () {
                  ref
                      .read(playerProvider.notifier)
                      .playTrack(track, newQueue: curatedTracks);
                  ref.read(libraryProvider.notifier).recordRecentlyPlayed(track);
                },
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.07),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    children: [
                      TrackArtwork(
                        imageUrl: track.thumbnailUrl,
                        size: 56,
                        borderRadius: 6,
                        isPlaying: isCurrent && playerState.isPlaying,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: Text(
                            track.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: isCurrent
                                  ? CadenceColors.accentOrange
                                  : CadenceColors.textPrimary,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 28),

          // Shelf 1: Made For You
          _buildHorizontalShelf(
            context,
            ref,
            title: 'Made For You',
            tracks: madeForYou,
          ),
          const SizedBox(height: 28),

          // Shelf 2: Sunset Sessions
          _buildHorizontalShelf(
            context,
            ref,
            title: 'Sunset Sessions',
            tracks: sunsetSessions,
          ),
          const SizedBox(height: 28),

          // Popular Tracks Table
          const Text(
            'Popular Tracks',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: CadenceColors.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          for (int i = 0; i < curatedTracks.length; i++)
            TrackRow(
              track: curatedTracks[i],
              index: i,
              queueContext: curatedTracks,
              hideDuration: true,
            ),
        ],
      ),
    );
  }

  Widget _buildHorizontalShelf(
    BuildContext context,
    WidgetRef ref, {
    required String title,
    required List<Track> tracks,
  }) {
    final playerState = ref.watch(playerProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              title,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: CadenceColors.textPrimary,
              ),
            ),
            TextButton(
              onPressed: () => context.go('/search'),
              child: const Text(
                'Show all',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: CadenceColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 206,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: tracks.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, idx) {
              final track = tracks[idx];
              final isCurrent = playerState.currentTrack.id == track.id;
              return GestureDetector(
                onTap: () {
                  ref
                      .read(playerProvider.notifier)
                      .playTrack(track, newQueue: tracks);
                  ref.read(libraryProvider.notifier).recordRecentlyPlayed(track);
                },
                child: Container(
                  width: 148,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: CadenceColors.surfaceCard.withOpacity(0.65),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Stack(
                        children: [
                          TrackArtwork(
                            imageUrl: track.thumbnailUrl,
                            size: 128,
                            borderRadius: 8,
                            isPlaying: isCurrent && playerState.isPlaying,
                          ),
                          Positioned(
                            right: 6,
                            bottom: 6,
                            child: Container(
                              width: 36,
                              height: 36,
                              decoration: const BoxDecoration(
                                color: CadenceColors.accentOrange,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.play_arrow_rounded,
                                color: Colors.white,
                                size: 22,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        track.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: CadenceColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        track.artist,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11.5,
                          color: CadenceColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
