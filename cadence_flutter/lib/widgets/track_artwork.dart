import 'package:flutter/material.dart';
import '../theme/cadence_theme.dart';

class TrackArtwork extends StatelessWidget {
  final String imageUrl;
  final double size;
  final double borderRadius;
  final bool isPlaying;
  final String? heroTag;

  const TrackArtwork({
    super.key,
    required this.imageUrl,
    this.size = 48,
    this.borderRadius = 8,
    this.isPlaying = false,
    this.heroTag,
  });

  @override
  Widget build(BuildContext context) {
    Widget child = ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: Container(
        width: size,
        height: size,
        decoration: const BoxDecoration(
          gradient: CadenceColors.likedSongsGradient,
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (imageUrl.isNotEmpty)
              Image.network(
                imageUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const Center(
                  child: Icon(
                    Icons.album_rounded,
                    color: Colors.white70,
                  ),
                ),
              )
            else
              const Center(
                child: Icon(
                  Icons.album_rounded,
                  color: Colors.white70,
                ),
              ),
            if (isPlaying)
              Container(
                color: Colors.black.withOpacity(0.45),
                child: const Center(
                  child: Icon(
                    Icons.graphic_eq_rounded,
                    color: CadenceColors.accentOrange,
                    size: 20,
                  ),
                ),
              ),
          ],
        ),
      ),
    );

    if (heroTag != null) {
      return Hero(tag: heroTag!, child: child);
    }
    return child;
  }
}
