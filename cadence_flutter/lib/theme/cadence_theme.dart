import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Exact 1:1 reproduction of the Cadence web/PWA Sunset Dark visual identity.
class CadenceColors {
  CadenceColors._();

  /// Primary obsidian app shell background (`#0A0A0C`)
  static const Color backgroundPrimary = Color(0xFF0A0A0C);

  /// Elevated main stage & drawer surface (`#121216`)
  static const Color surfaceStage = Color(0xFF121216);

  /// Card & list item surface (`#18181E`)
  static const Color surfaceCard = Color(0xFF18181E);

  /// Hover / active elevated card surface (`#22222A`)
  static const Color surfaceCardHover = Color(0xFF22222A);

  /// Search bar & input pill surface (`#1F1F27`)
  static const Color surfaceInput = Color(0xFF1F1F27);

  /// Modal dialog surface (`#141418`)
  static const Color surfaceModal = Color(0xFF141418);

  /// Primary Sunset Flame brand accent (`#E25822`)
  static const Color accentOrange = Color(0xFFE25822);

  /// Hover / lighter Sunset Flame (`#F06A35`)
  static const Color accentOrangeHover = Color(0xFFF06A35);

  /// Deep ember gradient stop (`#C2410C`)
  static const Color accentDeepEmber = Color(0xFFC2410C);

  /// Dark umber gradient stop (`#431407`)
  static const Color accentUmber = Color(0xFF431407);

  /// Maximized player top warm wash (`#2A140B`)
  static const Color maximizedTopWash = Color(0xFF2A140B);

  /// Primary crisp off-white text (`#F5F5F7`)
  static const Color textPrimary = Color(0xFFF5F5F7);

  /// Secondary muted slate text (`#94949E`)
  static const Color textSecondary = Color(0xFF94949E);

  /// Subtle border (`rgba(255, 255, 255, 0.08)`)
  static const Color borderSubtle = Color(0x14FFFFFF);

  /// Active border (`rgba(226, 88, 34, 0.40)`)
  static const Color borderAccent = Color(0x66E25822);

  /// Success emerald (`#10B981`)
  static const Color emerald = Color(0xFF10B981);

  /// Danger red (`#EF4444`)
  static const Color danger = Color(0xFFEF4444);

  /// Top ambient header gradient matching `linear-gradient(180deg, rgba(226, 88, 34, 0.22) 0%, rgba(18, 18, 22, 0) 100%)`
  static const LinearGradient topAmbientGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [
      Color(0x38E25822),
      Color(0x00121216),
    ],
  );

  /// Liked Songs cover art gradient (`from-[#E25822] via-[#C2410C] to-[#431407]`)
  static const LinearGradient likedSongsGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [
      accentOrange,
      accentDeepEmber,
      accentUmber,
    ],
  );

  /// Maximized full-screen player background (`from-[#2A140B] via-[#121216] to-[#0A0A0C]`)
  static const LinearGradient maximizedPlayerGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [
      maximizedTopWash,
      surfaceStage,
      backgroundPrimary,
    ],
  );
}

class CadenceTheme {
  CadenceTheme._();

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: CadenceColors.backgroundPrimary,
      primaryColor: CadenceColors.accentOrange,
      colorScheme: const ColorScheme.dark(
        primary: CadenceColors.accentOrange,
        secondary: CadenceColors.accentOrangeHover,
        surface: CadenceColors.surfaceStage,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: CadenceColors.textPrimary,
        error: CadenceColors.danger,
      ),
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: const AppBarTheme(
        backgroundColor: CadenceColors.backgroundPrimary,
        foregroundColor: CadenceColors.textPrimary,
        elevation: 0,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
          systemNavigationBarColor: CadenceColors.backgroundPrimary,
          systemNavigationBarIconBrightness: Brightness.light,
        ),
      ),
      textTheme: const TextTheme(
        displayLarge: TextStyle(
          color: CadenceColors.textPrimary,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.8,
        ),
        displayMedium: TextStyle(
          color: CadenceColors.textPrimary,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
        headlineMedium: TextStyle(
          color: CadenceColors.textPrimary,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.4,
        ),
        titleLarge: TextStyle(
          color: CadenceColors.textPrimary,
          fontWeight: FontWeight.w700,
          fontSize: 20,
        ),
        titleMedium: TextStyle(
          color: CadenceColors.textPrimary,
          fontWeight: FontWeight.w600,
          fontSize: 15,
        ),
        bodyLarge: TextStyle(
          color: CadenceColors.textPrimary,
          fontSize: 15,
        ),
        bodyMedium: TextStyle(
          color: CadenceColors.textSecondary,
          fontSize: 13,
        ),
        labelSmall: TextStyle(
          color: CadenceColors.textSecondary,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: CadenceColors.accentOrange,
        inactiveTrackColor: Colors.white.withOpacity(0.2),
        thumbColor: CadenceColors.textPrimary,
        overlayColor: CadenceColors.accentOrange.withOpacity(0.2),
        trackHeight: 4.0,
        thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6.0),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: CadenceColors.surfaceModal,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: CadenceColors.borderSubtle),
        ),
      ),
    );
  }
}
