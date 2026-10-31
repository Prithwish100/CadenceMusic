enum RepeatMode {
  off,
  all,
  one,
}

class Track {
  final String id; // YouTube Video ID
  final String title;
  final String artist;
  final String album;
  final int duration; // in seconds
  final String thumbnailUrl;
  final String? category;

  const Track({
    required this.id,
    required this.title,
    required this.artist,
    required this.album,
    required this.duration,
    required this.thumbnailUrl,
    this.category,
  });

  Track copyWith({
    String? id,
    String? title,
    String? artist,
    String? album,
    int? duration,
    String? thumbnailUrl,
    String? category,
  }) {
    return Track(
      id: id ?? this.id,
      title: title ?? this.title,
      artist: artist ?? this.artist,
      album: album ?? this.album,
      duration: duration ?? this.duration,
      thumbnailUrl: thumbnailUrl ?? this.thumbnailUrl,
      category: category ?? this.category,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'artist': artist,
        'album': album,
        'duration': duration,
        'thumbnailUrl': thumbnailUrl,
        if (category != null) 'category': category,
      };

  factory Track.fromJson(Map<String, dynamic> json) {
    final rawId = (json['id'] ?? '').toString().trim();
    final rawThumb = (json['thumbnailUrl'] ?? '').toString().trim();
    return Track(
      id: rawId,
      title: (json['title'] ?? 'Unknown Track').toString(),
      artist: (json['artist'] ?? 'Unknown Artist').toString(),
      album: (json['album'] ?? 'Single').toString(),
      duration: (json['duration'] is num)
          ? (json['duration'] as num).round()
          : int.tryParse((json['duration'] ?? '210').toString()) ?? 210,
      thumbnailUrl: rawThumb.isNotEmpty
          ? rawThumb
          : 'https://i.ytimg.com/vi/$rawId/hqdefault.jpg',
      category: json['category']?.toString(),
    );
  }

  String get formattedDuration {
    final safeSecs = duration < 0 ? 0 : duration;
    final mins = safeSecs ~/ 60;
    final secs = safeSecs % 60;
    return '$mins:${secs.toString().padLeft(2, '0')}';
  }
}
