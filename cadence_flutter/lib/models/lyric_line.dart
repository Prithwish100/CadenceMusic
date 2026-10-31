class LyricLine {
  final double time; // in seconds
  final String text;

  const LyricLine({
    required this.time,
    required this.text,
  });

  factory LyricLine.fromJson(Map<String, dynamic> json) {
    return LyricLine(
      time: (json['time'] is num)
          ? (json['time'] as num).toDouble()
          : double.tryParse((json['time'] ?? '0').toString()) ?? 0.0,
      text: (json['text'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'time': time,
        'text': text,
      };
}
