/// Typed views of the API responses the app uses. Field names follow apps/api/openapi.json;
/// test/api_contract_test.dart fails if they drift.
library;

class Tokens {
  Tokens({required this.accessToken, required this.refreshToken});
  factory Tokens.fromJson(Map<String, dynamic> j) => Tokens(
    accessToken: j['accessToken'] as String,
    refreshToken: j['refreshToken'] as String,
  );
  final String accessToken;
  final String refreshToken;
}

class OtpVerifyResult {
  OtpVerifyResult({
    required this.authenticated,
    this.tokens,
    this.registrationToken,
  });
  factory OtpVerifyResult.fromJson(Map<String, dynamic> j) => OtpVerifyResult(
    authenticated: j['status'] == 'authenticated',
    tokens: j['tokens'] == null
        ? null
        : Tokens.fromJson(j['tokens'] as Map<String, dynamic>),
    registrationToken: j['registrationToken'] as String?,
  );
  final bool authenticated;
  final Tokens? tokens;
  final String? registrationToken;
}

class ConsentPurpose {
  ConsentPurpose({
    required this.id,
    required this.required,
    required this.label,
  });
  factory ConsentPurpose.fromJson(Map<String, dynamic> j) => ConsentPurpose(
    id: j['id'] as String,
    required: j['required'] as bool,
    label: j['label'] as String,
  );
  final String id;
  final bool required;
  final String label;
}

class ConsentNotice {
  ConsentNotice({
    required this.version,
    required this.title,
    required this.text,
    required this.purposes,
  });
  factory ConsentNotice.fromJson(Map<String, dynamic> j) => ConsentNotice(
    version: j['version'] as int,
    title: j['title'] as String,
    text: j['text'] as String,
    purposes: [
      for (final p in j['purposes'] as List<dynamic>)
        ConsentPurpose.fromJson(p as Map<String, dynamic>),
    ],
  );
  final int version;
  final String title;
  final String text;
  final List<ConsentPurpose> purposes;
}

class ReferenceItem {
  ReferenceItem({required this.code, required this.names});
  factory ReferenceItem.fromJson(Map<String, dynamic> j) => ReferenceItem(
    code: j['code'] as String,
    names: Map<String, String>.from(j['name'] as Map<String, dynamic>),
  );
  final String code;
  final Map<String, String> names;
  String nameFor(String locale) => names[locale] ?? names['en'] ?? code;
}

class Me {
  Me({
    required this.uiLocale,
    required this.firstName,
    required this.batchName,
    required this.profileComplete,
    required this.batchJoined,
  });
  factory Me.fromJson(Map<String, dynamic> j) {
    final onboarding = j['onboarding'] as Map<String, dynamic>;
    final batch = j['batch'] as Map<String, dynamic>?;
    return Me(
      uiLocale: j['uiLocale'] as String,
      firstName: j['firstName'] as String?,
      batchName: batch?['name'] as String?,
      profileComplete: onboarding['profileComplete'] as bool,
      batchJoined: onboarding['batchJoined'] as bool,
    );
  }
  final String uiLocale;
  final String? firstName;
  final String? batchName;
  final bool profileComplete;
  final bool batchJoined;
}

class ProfileInput {
  ProfileInput({
    required this.firstName,
    this.lastName,
    required this.districtCode,
    required this.tradeCode,
    this.targetJob,
    required this.selfDeclaredLevel,
  });
  final String firstName;
  final String? lastName;
  final String districtCode;
  final String tradeCode;
  final String? targetJob;
  final String selfDeclaredLevel;

  Map<String, dynamic> toJson() => {
    'firstName': firstName,
    if (lastName != null && lastName!.isNotEmpty) 'lastName': lastName,
    'districtCode': districtCode,
    'tradeCode': tradeCode,
    if (targetJob != null && targetJob!.isNotEmpty) 'targetJob': targetJob,
    'selfDeclaredLevel': selfDeclaredLevel,
  };
}
