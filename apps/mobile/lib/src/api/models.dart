/// Typed views of the API responses the app uses. Field names follow apps/api/openapi.json;
/// test/api_contract_test.dart fails if they drift.
library;

import '../content/pack_models.dart';

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
    required this.id,
    required this.uiLocale,
    required this.firstName,
    this.lastName,
    this.profile,
    required this.batchName,
    required this.profileComplete,
    required this.batchJoined,
  });
  factory Me.fromJson(Map<String, dynamic> j) {
    final onboarding = j['onboarding'] as Map<String, dynamic>;
    final batch = j['batch'] as Map<String, dynamic>?;
    return Me(
      id: j['id'] as String,
      uiLocale: j['uiLocale'] as String,
      firstName: j['firstName'] as String?,
      lastName: j['lastName'] as String?,
      profile: j['profile'] == null
          ? null
          : ProfileInfo.fromJson(j['profile'] as Map<String, dynamic>),
      batchName: batch?['name'] as String?,
      profileComplete: onboarding['profileComplete'] as bool,
      batchJoined: onboarding['batchJoined'] as bool,
    );
  }
  final String id;
  final String uiLocale;
  final String? firstName;
  final String? lastName;
  final ProfileInfo? profile;
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

/// A TOMCOM message shown as a banner (FR-205). Text is keyed by locale.
class Announcement {
  Announcement({required this.id, required this.title, required this.body});
  factory Announcement.fromJson(Map<String, dynamic> j) => Announcement(
    id: j['id'] as String,
    title: Map<String, String>.from(j['title'] as Map),
    body: Map<String, String>.from(j['body'] as Map),
  );
  final String id;
  final Map<String, String> title;
  final Map<String, String> body;

  String titleIn(String locale) => title[locale] ?? title['en'] ?? '';
  String bodyIn(String locale) => body[locale] ?? body['en'] ?? '';
}

/// The learner's saved profile (FR-103, FR-802).
class ProfileInfo {
  ProfileInfo({
    required this.districtCode,
    required this.tradeCode,
    this.targetJob,
    required this.selfDeclaredLevel,
  });
  factory ProfileInfo.fromJson(Map<String, dynamic> j) => ProfileInfo(
    districtCode: j['districtCode'] as String,
    tradeCode: j['tradeCode'] as String,
    targetJob: j['targetJob'] as String?,
    selfDeclaredLevel: j['selfDeclaredLevel'] as String,
  );
  final String districtCode;
  final String tradeCode;
  final String? targetJob;
  final String selfDeclaredLevel;
}

/// A checkpoint attempt's state (FR-404).
class CheckpointResult {
  CheckpointResult({
    required this.id,
    required this.status,
    this.total,
    this.sectionScores,
    required this.passMark,
  });
  factory CheckpointResult.fromJson(Map<String, dynamic> j) => CheckpointResult(
    id: j['id'] as String,
    status: j['status'] as String,
    total: (j['total'] as num?)?.toDouble(),
    sectionScores: (j['sectionScores'] as Map?)?.map(
      (k, v) => MapEntry(k as String, (v as num).toDouble()),
    ),
    passMark: (j['passMark'] as num).toDouble(),
  );
  final String id;

  /// in_progress, awaiting_marking, passed, failed or expired.
  final String status;
  final double? total;
  final Map<String, double>? sectionScores;
  final double passMark;
}

/// Per level: can the learner take the checkpoint, and how did it go (FR-404).
class CheckpointStatus {
  CheckpointStatus({
    required this.level,
    required this.available,
    required this.lessons,
    required this.lessonsPassed,
    required this.eligible,
    required this.passed,
    this.latest,
  });
  factory CheckpointStatus.fromJson(Map<String, dynamic> j) => CheckpointStatus(
    level: j['level'] as String,
    available: j['available'] as bool,
    lessons: j['lessons'] as int,
    lessonsPassed: j['lessonsPassed'] as int,
    eligible: j['eligible'] as bool,
    passed: j['passed'] as bool,
    latest: j['latest'] == null
        ? null
        : CheckpointResult.fromJson(j['latest'] as Map<String, dynamic>),
  );
  final String level;
  final bool available;
  final int lessons;
  final int lessonsPassed;
  final bool eligible;
  final bool passed;
  final CheckpointResult? latest;
}

class WritingTask {
  WritingTask({
    required this.id,
    required this.prompt,
    required this.minWords,
    required this.maxWords,
  });
  factory WritingTask.fromJson(Map<String, dynamic> j) {
    final p = j['payload'] as Map<String, dynamic>;
    return WritingTask(
      id: j['id'] as String,
      prompt: L10n.fromJson(j['prompt']),
      minWords: p['minWords'] as int,
      maxWords: p['maxWords'] as int,
    );
  }
  final String id;
  final L10n prompt;
  final int minWords;
  final int maxWords;
}

/// An attempt as the learner sees it: questions without answers while it is open.
class CheckpointAttempt extends CheckpointResult {
  CheckpointAttempt({
    required super.id,
    required super.status,
    super.total,
    super.sectionScores,
    required super.passMark,
    required this.level,
    this.reading = const [],
    this.listening = const [],
    this.writing = const [],
  });
  factory CheckpointAttempt.fromJson(Map<String, dynamic> j) {
    final r = CheckpointResult.fromJson(j);
    final s = j['sections'] as Map<String, dynamic>?;
    List<QuizQuestion> qs(String k) => [
      for (final q in (s?[k] as List?) ?? const [])
        QuizQuestion.fromJson(q as Map<String, dynamic>),
    ];
    return CheckpointAttempt(
      id: r.id,
      status: r.status,
      total: r.total,
      sectionScores: r.sectionScores,
      passMark: r.passMark,
      level: j['level'] as String,
      reading: qs('reading'),
      listening: qs('listening'),
      writing: [
        for (final w in (s?['writing'] as List?) ?? const [])
          WritingTask.fromJson(w as Map<String, dynamic>),
      ],
    );
  }
  final String level;
  final List<QuizQuestion> reading;
  final List<QuizQuestion> listening;
  final List<WritingTask> writing;
}

/// A level certificate (FR-701). [verifyUrl] is what its QR code opens (FR-703).
class Certificate {
  Certificate({
    required this.id,
    required this.code,
    required this.level,
    required this.score,
    required this.issuedAt,
    required this.valid,
    required this.verifyUrl,
  });
  factory Certificate.fromJson(Map<String, dynamic> j) => Certificate(
    id: j['id'] as String,
    code: j['code'] as String,
    level: j['level'] as String,
    score: (j['score'] as num).toDouble(),
    issuedAt: DateTime.parse(j['issuedAt'] as String),
    valid: j['status'] == 'valid',
    verifyUrl: j['verifyUrl'] as String,
  );
  final String id;
  final String code;
  final String level;
  final double score;
  final DateTime issuedAt;
  final bool valid;
  final String verifyUrl;
}
