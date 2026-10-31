import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../models/track.dart';
import '../providers/library_provider.dart';
import '../providers/player_provider.dart';
import '../theme/cadence_theme.dart';
import 'modals_and_drawers.dart';
import 'track_artwork.dart';

void showMaximizedPlayerSheet(BuildContext context) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => const MaximizedPlayerSheet(),
  );
}

class MaximizedPlayerSheet extends ConsumerStatefulWidget {
  const MaximizedPlayerSheet({super.key});

  @override
  ConsumerState<MaximizedPlayerSheet> createState() =>
      _MaximizedPlayerSheetState();
}

class _MaximizedPlayerSheetState extends ConsumerState<MaximizedPlayerSheet> {
  bool _showLyricsView = false;
  final ScrollController _lyricsScrollController = ScrollController();

  String _formatSeconds(double seconds) {
    final safe = seconds < 0 ? 0 : seconds.round();
    final mins = safe ~/ 60;
    final secs = safe % 60;
    return '$mins:${secs.toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    _lyricsScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final playerState = ref.watch(playerProvider);
    final libraryState = ref.watch(libraryProvider);
    final track = playerState.currentTrack;
    final liked = libraryState.isLiked(track.id);
    final activeLyricIdx = playerState.activeLyricIndex;

    // Auto-scroll active lyric line into center view
    if (_showLyricsView &&
        activeLyricIdx >= 0 &&
        _lyricsScrollController.hasClients) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_lyricsScrollController.hasClients) return;
        final targetOffset = (activeLyricIdx * 64.0 - 120.0).clamp(
          0.0,
          _lyricsScrollController.position.maxScrollExtent,
        );
        _lyricsScrollController.animateTo(
          targetOffset,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOutCubic,
        );
      });
    }

    return Container(
      decoration: const BoxDecoration(
        gradient: CadenceColors.maximizedPlayerGradient,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          // Top Header Bar (Close, Album Title, Queue & Sleep Timer)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.black.withOpacity(0.4),
                  ),
                  icon: const Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: CadenceColors.textPrimary,
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      track.album,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: CadenceColors.textPrimary,
                      ),
                    ),
                  ),
                ),
                Row(
                  children: [
                    IconButton(
                      onPressed: () => showQueueBottomSheet(context),
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.black.withOpacity(0.4),
                      ),
                      icon: const Icon(
                        Icons.queue_music_rounded,
                        size: 20,
                        color: CadenceColors.textSecondary,
                      ),
                    ),
                    const SizedBox(width: 6),
                    InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: () => showSleepTimerSheet(context),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: playerState.sleepTimerRemainingSeconds != null
                              ? CadenceColors.accentOrange.withOpacity(0.2)
                              : Colors.black.withOpacity(0.4),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color:
                                playerState.sleepTimerRemainingSeconds != null
                                    ? CadenceColors.borderAccent
                                    : Colors.transparent,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.nightlight_round,
                              size: 16,
                              color:
                                  playerState.sleepTimerRemainingSeconds != null
                                      ? CadenceColors.accentOrange
                                      : CadenceColors.textSecondary,
                            ),
                            if (playerState.sleepTimerRemainingSeconds !=
                                null) ...[
                              const SizedBox(width: 4),
                              Text(
                                '${(playerState.sleepTimerRemainingSeconds! / 60).ceil()}m',
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: CadenceColors.accentOrange,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Artwork / Synchronized Lyrics Toggle Pill
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.35),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: CadenceColors.borderSubtle),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildToggleChip(
                    label: 'Artwork',
                    active: !_showLyricsView,
                    onTap: () => setState(() => _showLyricsView = false),
                  ),
                  _buildToggleChip(
                    label: 'Synced Lyrics',
                    active: _showLyricsView,
                    onTap: () => setState(() => _showLyricsView = true),
                  ),
                ],
              ),
            ),
          ),

          // Center Stage: Animated Album Art OR Line-Synchronized Lyrics
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 260),
              child: _showLyricsView
                  ? _buildSynchronizedLyricsStage(playerState, activeLyricIdx)
                  : Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 28),
                        child: AnimatedScale(
                          scale: playerState.isPlaying ? 1.0 : 0.94,
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeOutBack,
                          child: AspectRatio(
                            aspectRatio: 1,
                            child: Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(16),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.55),
                                    blurRadius: 32,
                                    offset: const Offset(0, 16),
                                  ),
                                ],
                              ),
                              child: TrackArtwork(
                                imageUrl: track.thumbnailUrl,
                                size: 340,
                                borderRadius: 16,
                                heroTag: 'mini_player_art_${track.id}',
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
            ),
          ),

          // Track Info + Like / Add to Playlist / Share
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 4),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        track.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: CadenceColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        track.artist,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 15,
                          color: CadenceColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: Icon(
                    liked
                        ? Icons.favorite_rounded
                        : Icons.favorite_border_rounded,
                    color: liked
                        ? CadenceColors.accentOrange
                        : CadenceColors.textSecondary,
                  ),
                  onPressed: () {
                    ref.read(libraryProvider.notifier).toggleLike(track);
                  },
                ),
                IconButton(
                  icon: const Icon(
                    Icons.add_rounded,
                    color: CadenceColors.textSecondary,
                  ),
                  onPressed: () {
                    showPlaylistModal(context, trackToAdd: track);
                  },
                ),
                IconButton(
                  icon: const Icon(
                    Icons.share_outlined,
                    size: 20,
                    color: CadenceColors.textSecondary,
                  ),
                  onPressed: () {
                    Share.share(
                      'Listen to "${track.title}" by ${track.artist} on Cadence',
                    );
                  },
                ),
              ],
            ),
          ),

          // Scrubber Slider
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                Slider(
                  value: playerState.currentTime.clamp(
                    0.0,
                    playerState.duration.toDouble(),
                  ),
                  min: 0.0,
                  max: playerState.duration > 0
                      ? playerState.duration.toDouble()
                      : 210.0,
                  onChanged: (val) {
                    ref.read(playerProvider.notifier).seekTo(val);
                  },
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        _formatSeconds(playerState.currentTime),
                        style: const TextStyle(
                          fontSize: 12,
                          color: CadenceColors.textSecondary,
                        ),
                      ),
                      Text(
                        _formatSeconds(playerState.duration.toDouble()),
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
          ),

          // Transport Controls (Shuffle, Prev, Play/Pause, Next, Repeat)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  icon: Icon(
                    Icons.shuffle_rounded,
                    color: playerState.shuffle
                        ? CadenceColors.accentOrange
                        : CadenceColors.textSecondary,
                  ),
                  onPressed: () {
                    ref.read(playerProvider.notifier).toggleShuffle();
                  },
                ),
                IconButton(
                  iconSize: 34,
                  icon: const Icon(
                    Icons.skip_previous_rounded,
                    color: CadenceColors.textPrimary,
                  ),
                  onPressed: () {
                    ref.read(playerProvider.notifier).prevTrack();
                  },
                ),
                GestureDetector(
                  onTap: () {
                    ref.read(playerProvider.notifier).togglePlayPause();
                  },
                  child: Container(
                    width: 60,
                    height: 60,
                    decoration: const BoxDecoration(
                      color: CadenceColors.textPrimary,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      playerState.isPlaying
                          ? Icons.pause_rounded
                          : Icons.play_arrow_rounded,
                      size: 32,
                      color: CadenceColors.backgroundPrimary,
                    ),
                  ),
                ),
                IconButton(
                  iconSize: 34,
                  icon: const Icon(
                    Icons.skip_next_rounded,
                    color: CadenceColors.textPrimary,
                  ),
                  onPressed: () {
                    ref.read(playerProvider.notifier).nextTrack();
                  },
                ),
                IconButton(
                  icon: Icon(
                    playerState.repeatMode == RepeatMode.one
                        ? Icons.repeat_one_rounded
                        : Icons.repeat_rounded,
                    color: playerState.repeatMode != RepeatMode.off
                        ? CadenceColors.accentOrange
                        : CadenceColors.textSecondary,
                  ),
                  onPressed: () {
                    ref.read(playerProvider.notifier).cycleRepeatMode();
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildToggleChip({
    required String label,
    required bool active,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: BoxDecoration(
          color: active ? CadenceColors.accentOrange : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: active ? Colors.white : CadenceColors.textSecondary,
          ),
        ),
      ),
    );
  }

  Widget _buildSynchronizedLyricsStage(
    PlayerState playerState,
    int activeLyricIdx,
  ) {
    final lyrics = playerState.lyrics;
    if (lyrics.isEmpty) {
      return const Center(
        child: Text(
          'Loading synchronized lyrics...',
          style: TextStyle(color: CadenceColors.textSecondary),
        ),
      );
    }

    return ListView.builder(
      controller: _lyricsScrollController,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      itemCount: lyrics.length,
      itemBuilder: (context, idx) {
        final line = lyrics[idx];
        final isActive = idx == activeLyricIdx;
        final isPast = idx < activeLyricIdx;

        return GestureDetector(
          onTap: () {
            ref.read(playerProvider.notifier).seekTo(line.time);
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 240),
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: isActive
                  ? CadenceColors.accentOrange.withOpacity(0.2)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              border: isActive
                  ? const Border(
                      left: BorderSide(
                        color: CadenceColors.accentOrange,
                        width: 4,
                      ),
                    )
                  : null,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    line.text,
                    style: TextStyle(
                      fontSize: isActive ? 22 : 17,
                      fontWeight: FontWeight.w700,
                      color: isActive
                          ? Colors.white
                          : isPast
                              ? Colors.white.withOpacity(0.32)
                              : Colors.white.withOpacity(0.55),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                if (isActive)
                  Text(
                    _formatSeconds(line.time),
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: CadenceColors.accentOrange,
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}
