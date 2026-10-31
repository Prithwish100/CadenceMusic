import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/library_provider.dart';
import '../screens/home_screen.dart';
import '../screens/library_and_detail_screens.dart';
import '../screens/search_screen.dart';
import '../theme/cadence_theme.dart';
import '../widgets/mini_player_bar.dart';
import '../widgets/modals_and_drawers.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      ShellRoute(
        builder: (context, state, child) {
          return CadenceAppShell(
            currentLocation: state.uri.toString(),
            child: child,
          );
        },
        routes: [
          GoRoute(
            path: '/',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: HomeScreen(),
            ),
          ),
          GoRoute(
            path: '/search',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: SearchScreen(),
            ),
          ),
          GoRoute(
            path: '/library',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: LibraryScreen(),
            ),
          ),
          GoRoute(
            path: '/liked',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: LikedSongsScreen(),
            ),
          ),
          GoRoute(
            path: '/playlist/:id',
            builder: (context, state) => PlaylistDetailScreen(
              playlistId: state.pathParameters['id'] ?? '',
            ),
          ),
          GoRoute(
            path: '/profile',
            builder: (context, state) => const ProfileScreen(),
          ),
          GoRoute(
            path: '/settings',
            builder: (context, state) => const SettingsScreen(),
          ),
        ],
      ),
    ],
  );
});

class CadenceAppShell extends ConsumerWidget {
  final String currentLocation;
  final Widget child;

  const CadenceAppShell({
    super.key,
    required this.currentLocation,
    required this.child,
  });

  int _selectedIndex() {
    if (currentLocation.startsWith('/search')) return 1;
    if (currentLocation.startsWith('/library') ||
        currentLocation.startsWith('/playlist')) {
      return 2;
    }
    if (currentLocation.startsWith('/liked')) return 3;
    return 0;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final libraryState = ref.watch(libraryProvider);
    final user = libraryState.user;
    final scaffoldKey = GlobalKey<ScaffoldState>();

    return Scaffold(
      key: scaffoldKey,
      drawer: const CadenceSideMenuDrawer(),
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(60),
        child: SafeArea(
          bottom: false,
          child: Container(
            height: 60,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            color: CadenceColors.backgroundPrimary,
            child: Row(
              children: [
                // Hamburger Menu Button + Cadence Disc3 Brand Identity
                InkWell(
                  borderRadius: BorderRadius.circular(999),
                  onTap: () => scaffoldKey.currentState?.openDrawer(),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 6,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.06),
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: CadenceColors.borderSubtle,
                            ),
                          ),
                          child: const Icon(
                            Icons.menu_rounded,
                            size: 18,
                            color: CadenceColors.textPrimary,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          width: 34,
                          height: 34,
                          decoration: const BoxDecoration(
                            color: CadenceColors.accentOrange,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.album_rounded,
                            size: 20,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Cadence',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: CadenceColors.textPrimary,
                                height: 1.0,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              'Made by Prithwish',
                              style: TextStyle(
                                fontSize: 10,
                                color: CadenceColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const Spacer(),
                // Search Shortcut Pill
                IconButton(
                  icon: const Icon(
                    Icons.search_rounded,
                    color: CadenceColors.textPrimary,
                  ),
                  onPressed: () => context.go('/search'),
                ),
                const SizedBox(width: 4),
                // Right Auth / Profile Pill matching src/App.tsx
                if (user != null)
                  InkWell(
                    borderRadius: BorderRadius.circular(999),
                    onTap: () => context.go('/profile'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: CadenceColors.surfaceCard,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: CadenceColors.borderSubtle),
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 12,
                            backgroundColor: CadenceColors.accentOrange,
                            backgroundImage: (user.photoUrl != null &&
                                    user.photoUrl!.isNotEmpty)
                                ? NetworkImage(user.photoUrl!)
                                : null,
                            child: (user.photoUrl != null &&
                                    user.photoUrl!.isNotEmpty)
                                ? null
                                : Text(
                                    user.initial,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.white,
                                    ),
                                  ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            user.firstName,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: CadenceColors.textPrimary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  )
                else
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: CadenceColors.textPrimary,
                      foregroundColor: CadenceColors.backgroundPrimary,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 8,
                      ),
                      minimumSize: Size.zero,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    onPressed: () {
                      ref.read(libraryProvider.notifier).signInWithGoogle();
                    },
                    child: const Text(
                      'Log in',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      body: Stack(
        children: [
          Positioned.fill(child: child),
          const Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: MiniPlayerBar(),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: CadenceColors.backgroundPrimary,
          border: Border(
            top: BorderSide(color: CadenceColors.borderSubtle),
          ),
        ),
        child: BottomNavigationBar(
          currentIndex: _selectedIndex(),
          backgroundColor: CadenceColors.backgroundPrimary,
          type: BottomNavigationBarType.fixed,
          selectedItemColor: CadenceColors.textPrimary,
          unselectedItemColor: CadenceColors.textSecondary,
          selectedFontSize: 11,
          unselectedFontSize: 11,
          onTap: (idx) {
            switch (idx) {
              case 0:
                context.go('/');
              case 1:
                context.go('/search');
              case 2:
                context.go('/library');
              case 3:
                context.go('/liked');
            }
          },
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.home_outlined),
              activeIcon: Icon(Icons.home_rounded),
              label: 'Home',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.search_rounded),
              label: 'Search',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.library_music_outlined),
              activeIcon: Icon(Icons.library_music_rounded),
              label: 'Your Library',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.favorite_border_rounded),
              activeIcon: Icon(Icons.favorite_rounded),
              label: 'Liked',
            ),
          ],
        ),
      ),
    );
  }
}
