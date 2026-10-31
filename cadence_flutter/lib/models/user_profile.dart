class CadenceUserProfile {
  final String uid;
  final String email;
  final String displayName;
  final String? photoUrl;
  final String? idToken;
  final String? accessToken;
  final String authSource; // 'android_credential_manager' | 'ios_gid_signin' | 'test_account_picker'

  const CadenceUserProfile({
    required this.uid,
    required this.email,
    required this.displayName,
    this.photoUrl,
    this.idToken,
    this.accessToken,
    this.authSource = 'android_credential_manager',
  });

  String get firstName {
    final trimmed = displayName.trim();
    if (trimmed.isNotEmpty) {
      return trimmed.split(RegExp(r'\s+')).first;
    }
    if (email.contains('@')) {
      final local = email.split('@').first;
      if (local.isNotEmpty) {
        return local[0].toUpperCase() + local.substring(1);
      }
    }
    return 'Listener';
  }

  String get initial {
    final f = firstName;
    return f.isNotEmpty ? f[0].toUpperCase() : 'L';
  }

  CadenceUserProfile copyWith({
    String? uid,
    String? email,
    String? displayName,
    String? photoUrl,
    String? idToken,
    String? accessToken,
    String? authSource,
  }) {
    return CadenceUserProfile(
      uid: uid ?? this.uid,
      email: email ?? this.email,
      displayName: displayName ?? this.displayName,
      photoUrl: photoUrl ?? this.photoUrl,
      idToken: idToken ?? this.idToken,
      accessToken: accessToken ?? this.accessToken,
      authSource: authSource ?? this.authSource,
    );
  }

  Map<String, dynamic> toJson() => {
        'uid': uid,
        'email': email,
        'displayName': displayName,
        'photoUrl': photoUrl,
        'idToken': idToken,
        'accessToken': accessToken,
        'authSource': authSource,
      };

  factory CadenceUserProfile.fromJson(Map<String, dynamic> json) {
    return CadenceUserProfile(
      uid: (json['uid'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      displayName: (json['displayName'] ?? 'Listener').toString(),
      photoUrl: json['photoUrl']?.toString(),
      idToken: json['idToken']?.toString(),
      accessToken: json['accessToken']?.toString(),
      authSource: (json['authSource'] ?? 'android_credential_manager').toString(),
    );
  }
}
