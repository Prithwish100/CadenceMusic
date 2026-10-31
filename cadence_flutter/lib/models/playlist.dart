import 'track.dart';

class Playlist {
  final String id;
  final String ownerId;
  final String name;
  final String description;
  final List<Track> tracks;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const Playlist({
    required this.id,
    required this.ownerId,
    required this.name,
    required this.description,
    required this.tracks,
    this.createdAt,
    this.updatedAt,
  });

  Playlist copyWith({
    String? id,
    String? ownerId,
    String? name,
    String? description,
    List<Track>? tracks,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Playlist(
      id: id ?? this.id,
      ownerId: ownerId ?? this.ownerId,
      name: name ?? this.name,
      description: description ?? this.description,
      tracks: tracks ?? this.tracks,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'ownerId': ownerId,
        'name': name,
        'description': description,
        'tracks': tracks.map((t) => t.toJson()).toList(),
        'createdAt': createdAt?.toIso8601String(),
        'updatedAt': updatedAt?.toIso8601String(),
      };

  factory Playlist.fromJson(Map<String, dynamic> json) {
    final rawTracks = json['tracks'];
    final parsedTracks = <Track>[];
    if (rawTracks is List) {
      for (final item in rawTracks) {
        if (item is Map<String, dynamic>) {
          parsedTracks.add(Track.fromJson(item));
        } else if (item is Map) {
          parsedTracks.add(Track.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    }
    return Playlist(
      id: (json['id'] ?? '').toString(),
      ownerId: (json['ownerId'] ?? 'guest').toString(),
      name: (json['name'] ?? 'Untitled Playlist').toString(),
      description: (json['description'] ?? '').toString(),
      tracks: parsedTracks,
    );
  }
}
