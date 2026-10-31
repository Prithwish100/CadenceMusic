import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import '../config/test_config.dart';
import '../models/user_profile.dart';

enum CadenceAuthDiagnosticCategory {
  oauthConfigError,
  invalidClientId,
  shaFingerprintMismatch,
  missingRedirectCallback,
  backendValidationFailure,
  networkError,
  userCancellation,
  sessionPersistenceFailure,
  authFlowInfo,
}

class CadenceAuthException implements Exception {
  final CadenceAuthDiagnosticCategory category;
  final String userMessage;
  final String diagnosticDetail;

  const CadenceAuthException({
    required this.category,
    required this.userMessage,
    required this.diagnosticDetail,
  });

  @override
  String toString() => 'CadenceAuthException(${category.name}): $userMessage';
}

/// Native Google Identity / Credential Manager (Android) + GIDSignIn (iOS)
/// with External Browser OAuth 2.0 Authorization Code + PKCE Fallback.
class GoogleAuthService {
  static const MethodChannel _nativeChannel = MethodChannel(
    'app.cadence.flutter.test/native_auth',
  );

  static const String _firebaseApiKey = 'AIzaSyCk6UA1aKICFe3dlWMnCrBCFD4zzPDugDM';
  static const String _oauthClientId =
      '1073976852547-nlpmgu43qb6hl0qp16ot9e9849pcpolo.apps.googleusercontent.com';
  static const String _firebaseAuthHandler =
      'https://solar-team-23rp2.firebaseapp.com/__/auth/handler';

  late final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: <String>['openid', 'email', 'profile'],
    serverClientId: CadenceTestConfig.googleServerClientId.startsWith('YOUR_')
        ? _oauthClientId
        : CadenceTestConfig.googleServerClientId,
    clientId: defaultTargetPlatform == TargetPlatform.iOS &&
            !CadenceTestConfig.googleIosClientId.startsWith('YOUR_')
        ? CadenceTestConfig.googleIosClientId
        : null,
  );

  /// Sanitized diagnostic logger — never logs passwords, access tokens, refresh tokens, or ID tokens.
  void logDiagnostic(
    CadenceAuthDiagnosticCategory category,
    String message,
  ) {
    debugPrint('[CadenceAuth][${category.name}] $message');
  }

  /// Attempts silent session restoration on app startup.
  Future<CadenceUserProfile?> restoreExistingGoogleSession() async {
    try {
      final account = await _googleSignIn.signInSilently();
      if (account != null) {
        final auth = await account.authentication;
        logDiagnostic(
          CadenceAuthDiagnosticCategory.authFlowInfo,
          'Restored silent Google Sign-In session for ${account.email}',
        );
        return _validateAndBuildProfile(
          uid: account.id,
          email: account.email,
          displayName: account.displayName,
          photoUrl: account.photoUrl,
          idToken: auth.idToken,
          accessToken: auth.accessToken,
          authSource: 'google_sign_in_silent_restore',
        );
      }
    } catch (e) {
      logDiagnostic(
        CadenceAuthDiagnosticCategory.authFlowInfo,
        'Silent Google Sign-In restore unavailable (${e.runtimeType})',
      );
    }
    return null;
  }

  /// PRIMARY SOLUTION: Official Native Google Sign-In using Android Credential Manager /
  /// Google Play Services (`google_sign_in`) with native OS AccountManager fallback.
  Future<CadenceUserProfile?> signInWithNativeAccountPicker() async {
    logDiagnostic(
      CadenceAuthDiagnosticCategory.authFlowInfo,
      'Starting primary native Google Sign-In flow (package=${TestConfig.applicationId})',
    );

    try {
      // Ensure account chooser is always presented when switching accounts
      try {
        await _googleSignIn.signOut();
      } catch (_) {}

      final GoogleSignInAccount? account = await _googleSignIn.signIn();
      if (account == null) {
        logDiagnostic(
          CadenceAuthDiagnosticCategory.userCancellation,
          'User cancelled native Google account chooser',
        );
        return null;
      }

      final GoogleSignInAuthentication auth = await account.authentication;
      if ((auth.idToken == null || auth.idToken!.isEmpty) &&
          (auth.accessToken == null || auth.accessToken!.isEmpty)) {
        logDiagnostic(
          CadenceAuthDiagnosticCategory.oauthConfigError,
          'GoogleSignIn completed without tokens; verifying SHA-1 fingerprint & OAuth client ID configuration',
        );
      }

      return await _validateAndBuildProfile(
        uid: account.id,
        email: account.email,
        displayName: account.displayName,
        photoUrl: account.photoUrl,
        idToken: auth.idToken,
        accessToken: auth.accessToken,
        authSource: defaultTargetPlatform == TargetPlatform.iOS
            ? 'ios_gid_signin'
            : 'android_credential_manager',
      );
    } on PlatformException catch (e) {
      final code = e.code;
      final msg = e.message ?? '';
      if (code == GoogleSignIn.kSignInCanceledError ||
          msg.contains('12501') ||
          msg.toLowerCase().contains('cancel')) {
        logDiagnostic(
          CadenceAuthDiagnosticCategory.userCancellation,
          'User dismissed Google Sign-In sheet (code=$code)',
        );
        return null;
      }

      if (msg.contains('10:') ||
          msg.contains('DEVELOPER_ERROR') ||
          msg.contains('12500')) {
        logDiagnostic(
          CadenceAuthDiagnosticCategory.shaFingerprintMismatch,
          'Play Services DEVELOPER_ERROR (code=$code): Check that SHA-1 '
          '(1A:6A:83:5C:AF:88:57:D2:69:D1:87:30:82:09:D7:3C:43:50:76:2C) '
          'for package app.cadence.flutter.test is registered in Firebase / Google Cloud OAuth. '
          'Falling back to native Android AccountManager / Browser PKCE.',
        );
      } else {
        logDiagnostic(
          CadenceAuthDiagnosticCategory.oauthConfigError,
          'PlatformException during GoogleSignIn (code=$code)',
        );
      }

      return await _invokePlatformNativeAccountChooserOrBrowserFallback();
    } catch (e) {
      logDiagnostic(
        CadenceAuthDiagnosticCategory.oauthConfigError,
        'Unexpected exception during GoogleSignIn (${e.runtimeType})',
      );
      return await _invokePlatformNativeAccountChooserOrBrowserFallback();
    }
  }

  /// FALLBACK SOLUTION: External Browser OAuth 2.0 Authorization Code Flow with PKCE
  /// Opens Chrome Custom Tabs / System Browser (never an embedded WebView) and
  /// exchanges the callback code with IdentityToolkit `verifyAssertion`.
  Future<CadenceUserProfile?> signInWithExternalBrowserOAuth() async {
    logDiagnostic(
      CadenceAuthDiagnosticCategory.authFlowInfo,
      'Starting External Browser OAuth 2.0 CODE_FLOW with deep-link callback',
    );
    try {
      final sessionId = _generateRandomSessionId();
      final result = await _nativeChannel.invokeMethod<Map<dynamic, dynamic>>(
        'startExternalBrowserOAuth',
        <String, dynamic>{
          'sessionId': sessionId,
          'clientId': _oauthClientId,
          'authHandlerUrl': _firebaseAuthHandler,
        },
      );
      if (result != null) {
        return CadenceUserProfile.fromJson(Map<String, dynamic>.from(result));
      }
      return null;
    } on CadenceAuthException {
      rethrow;
    } catch (e) {
      logDiagnostic(
        CadenceAuthDiagnosticCategory.missingRedirectCallback,
        'External browser OAuth callback failed (${e.runtimeType})',
      );
      throw const CadenceAuthException(
        category: CadenceAuthDiagnosticCategory.missingRedirectCallback,
        userMessage:
            'Could not complete Google Sign-In in the external browser. Please try again.',
        diagnosticDetail: 'External browser OAuth channel invocation failed',
      );
    }
  }

  Future<CadenceUserProfile?>
      _invokePlatformNativeAccountChooserOrBrowserFallback() async {
    try {
      final res = await _nativeChannel.invokeMethod<Map<dynamic, dynamic>>(
        'pickGoogleAccountNatively',
      );
      if (res != null) {
        return CadenceUserProfile.fromJson(Map<String, dynamic>.from(res));
      }
      return null;
    } catch (e) {
      throw const CadenceAuthException(
        category: CadenceAuthDiagnosticCategory.shaFingerprintMismatch,
        userMessage:
            'Google Sign-In could not verify the account credential. Try "Sign in via Chrome Browser" or verify SHA-1 configuration.',
        diagnosticDetail: 'Native AccountManager and GoogleSignIn both failed',
      );
    }
  }

  Future<CadenceUserProfile> _validateAndBuildProfile({
    required String uid,
    required String email,
    String? displayName,
    String? photoUrl,
    String? idToken,
    String? accessToken,
    required String authSource,
  }) async {
    String resolvedName = displayName?.trim() ?? '';
    String? resolvedPhoto = photoUrl?.trim();
    String resolvedUid = uid.trim();

    // Query Google OAuth2 v3 userinfo when accessToken is available to ensure fresh name & photo
    if (accessToken != null && accessToken.isNotEmpty) {
      try {
        final resp = await http
            .get(
              Uri.parse('https://www.googleapis.com/oauth2/v3/userinfo'),
              headers: <String, String>{
                'Authorization': 'Bearer $accessToken',
                'Accept': 'application/json',
              },
            )
            .timeout(const Duration(seconds: 6));

        if (resp.statusCode == 200) {
          final data = jsonDecode(resp.body) as Map<String, dynamic>;
          final uName = (data['name'] ?? data['given_name'] ?? '').toString().trim();
          final uPic = (data['picture'] ?? '').toString().trim();
          final uSub = (data['sub'] ?? '').toString().trim();
          if (uName.isNotEmpty) resolvedName = uName;
          if (uPic.isNotEmpty) resolvedPhoto = uPic;
          if (uSub.isNotEmpty) resolvedUid = uSub;
          logDiagnostic(
            CadenceAuthDiagnosticCategory.authFlowInfo,
            'Validated access token and fetched Google profile from userinfo endpoint',
          );
        } else {
          logDiagnostic(
            CadenceAuthDiagnosticCategory.backendValidationFailure,
            'Google userinfo endpoint returned HTTP ${resp.statusCode}',
          );
        }
      } catch (e) {
        logDiagnostic(
          CadenceAuthDiagnosticCategory.networkError,
          'Network warning while querying Google userinfo (${e.runtimeType})',
        );
      }
    }

    // Validate with Firebase IdentityToolkit if idToken or accessToken is present
    if ((idToken != null && idToken.isNotEmpty) ||
        (accessToken != null && accessToken.isNotEmpty)) {
      try {
        final postBody = idToken != null && idToken.isNotEmpty
            ? 'id_token=${Uri.encodeQueryComponent(idToken)}&providerId=google.com'
            : 'access_token=${Uri.encodeQueryComponent(accessToken!)}&providerId=google.com';
        final resp = await http
            .post(
              Uri.parse(
                'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=$_firebaseApiKey',
              ),
              headers: const <String, String>{
                'Content-Type': 'application/json',
              },
              body: jsonEncode(<String, dynamic>{
                'postBody': postBody,
                'requestUri': 'https://cadence.run.place',
                'returnIdpCredential': true,
                'returnSecureToken': true,
              }),
            )
            .timeout(const Duration(seconds: 8));

        if (resp.statusCode == 200) {
          final body = jsonDecode(resp.body) as Map<String, dynamic>;
          final localId = (body['localId'] ?? '').toString().trim();
          final fbName = (body['displayName'] ?? '').toString().trim();
          final fbPhoto = (body['photoUrl'] ?? '').toString().trim();
          if (localId.isNotEmpty) resolvedUid = localId;
          if (resolvedName.isEmpty && fbName.isNotEmpty) resolvedName = fbName;
          if ((resolvedPhoto == null || resolvedPhoto.isEmpty) &&
              fbPhoto.isNotEmpty) {
            resolvedPhoto = fbPhoto;
          }
          logDiagnostic(
            CadenceAuthDiagnosticCategory.authFlowInfo,
            'Established verified Firebase session via IdentityToolkit signInWithIdp',
          );
        } else {
          logDiagnostic(
            CadenceAuthDiagnosticCategory.backendValidationFailure,
            'IdentityToolkit signInWithIdp returned HTTP ${resp.statusCode}',
          );
        }
      } catch (e) {
        logDiagnostic(
          CadenceAuthDiagnosticCategory.networkError,
          'IdentityToolkit validation warning (${e.runtimeType})',
        );
      }
    }

    if (resolvedName.isEmpty) {
      resolvedName = email.contains('@') ? email.split('@').first : 'Listener';
    }
    if (resolvedUid.isEmpty) {
      resolvedUid = 'google_${email.toLowerCase().hashCode.abs()}';
    }

    return CadenceUserProfile(
      uid: resolvedUid,
      email: email,
      displayName: resolvedName,
      photoUrl: resolvedPhoto,
      idToken: idToken,
      accessToken: accessToken,
      authSource: authSource,
    );
  }

  String _generateRandomSessionId() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    final rand = Random.secure();
    return List.generate(20, (_) => chars[rand.nextInt(chars.length)]).join();
  }

  Future<void> signOut() async {
    try {
      await _googleSignIn.signOut();
    } catch (_) {}
    try {
      await _nativeChannel.invokeMethod<void>('signOutNative');
    } catch (_) {}
    logDiagnostic(
      CadenceAuthDiagnosticCategory.authFlowInfo,
      'Completed Google Sign-Out and cleared session credentials',
    );
  }
}
