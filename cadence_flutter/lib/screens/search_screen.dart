import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/curated_catalog.dart';
import '../models/track.dart';
import '../services/search_service.dart';
import '../theme/cadence_theme.dart';
import '../widgets/track_row.dart';

final searchServiceProvider = Provider<SearchService>((ref) => SearchService());

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final TextEditingController _controller = TextEditingController();
  List<String> _suggestions = [];
  List<Track> _results = [];
  bool _isSearching = false;
  bool _hasSearched = false;

  @override
  void initState() {
    super.initState();
    _suggestions = popularSearchSuggestions.take(6).toList();
  }

  Future<void> _onQueryChanged(String val) async {
    final suggestions = await ref
        .read(searchServiceProvider)
        .fetchAutocompleteSuggestions(val);
    if (mounted) {
      setState(() {
        _suggestions = suggestions;
      });
    }
  }

  Future<void> _executeSearch(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) return;
    _controller.text = trimmed;
    setState(() {
      _isSearching = true;
      _hasSearched = true;
    });
    final tracks = await ref.read(searchServiceProvider).searchTracks(trimmed);
    if (mounted) {
      setState(() {
        _results = tracks;
        _isSearching = false;
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
      children: [
        // Expandable Pill Search Bar matching src/App.tsx
        Container(
          decoration: BoxDecoration(
            color: CadenceColors.surfaceInput,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: CadenceColors.borderSubtle),
          ),
          child: TextField(
            controller: _controller,
            onChanged: _onQueryChanged,
            onSubmitted: _executeSearch,
            style: const TextStyle(
              color: CadenceColors.textPrimary,
              fontSize: 14,
            ),
            decoration: InputDecoration(
              hintText: 'What do you want to play?',
              hintStyle: const TextStyle(color: CadenceColors.textSecondary),
              prefixIcon: const Icon(
                Icons.search_rounded,
                color: CadenceColors.textSecondary,
              ),
              suffixIcon: _controller.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(
                        Icons.close_rounded,
                        color: CadenceColors.textSecondary,
                        size: 18,
                      ),
                      onPressed: () {
                        _controller.clear();
                        setState(() {
                          _hasSearched = false;
                          _results = [];
                        });
                      },
                    )
                  : null,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 14,
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),

        // Autocomplete Predictions Chips
        if (_suggestions.isNotEmpty && !_hasSearched) ...[
          const Text(
            'Trending & Suggested Searches',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: CadenceColors.textSecondary,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _suggestions.map((suggestion) {
              return ActionChip(
                backgroundColor: CadenceColors.surfaceCard,
                side: const BorderSide(color: CadenceColors.borderSubtle),
                avatar: const Icon(
                  Icons.trending_up_rounded,
                  size: 15,
                  color: CadenceColors.accentOrange,
                ),
                label: Text(
                  suggestion,
                  style: const TextStyle(
                    fontSize: 12,
                    color: CadenceColors.textPrimary,
                  ),
                ),
                onPressed: () => _executeSearch(suggestion),
              );
            }).toList(),
          ),
          const SizedBox(height: 24),
        ],

        if (_isSearching)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 48),
            child: Center(
              child: CircularProgressIndicator(
                color: CadenceColors.accentOrange,
              ),
            ),
          )
        else if (_hasSearched) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Top Results for "${_controller.text}"',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: CadenceColors.textPrimary,
                ),
              ),
              TextButton(
                onPressed: () => setState(() => _hasSearched = false),
                child: const Text('Browse All'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (int i = 0; i < _results.length; i++)
            TrackRow(
              track: _results[i],
              index: i,
              queueContext: _results,
              hideDuration: true,
            ),
        ] else ...[
          // Browse all gradient tiles matching GENRE_TILES in src/App.tsx
          const Text(
            'Browse all',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: CadenceColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: cadenceGenreTiles.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.65,
            ),
            itemBuilder: (context, idx) {
              final tile = cadenceGenreTiles[idx];
              return InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => _executeSearch(tile.name),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: tile.gradientColors,
                    ),
                  ),
                  child: Align(
                    alignment: Alignment.topLeft,
                    child: Text(
                      tile.name,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 28),
          const Text(
            'Trending Songs',
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
      ],
    );
  }
}
