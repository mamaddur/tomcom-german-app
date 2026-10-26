import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The hand-written client must match the API's OpenAPI spec. This fails when an endpoint or a
/// response field the app relies on is renamed or removed in apps/api/openapi.json.
void main() {
  final spec = jsonDecode(
    File('../api/openapi.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final paths = spec['paths'] as Map<String, dynamic>;
  final schemas =
      (spec['components'] as Map<String, dynamic>)['schemas']
          as Map<String, dynamic>;

  const usedEndpoints = {
    '/v1/auth/otp/request': 'post',
    '/v1/auth/otp/verify': 'post',
    '/v1/auth/register': 'post',
    '/v1/auth/refresh': 'post',
    '/v1/auth/logout': 'post',
    '/v1/consent/notice': 'get',
    '/v1/me': 'get',
    '/v1/me/locale': 'put',
    '/v1/me/profile': 'put',
    '/v1/me/batch': 'post',
    '/v1/reference/districts': 'get',
    '/v1/reference/trades': 'get',
    '/v1/packs': 'get',
    '/v1/app/config': 'get',
    '/v1/announcements': 'get',
    '/v1/sync': 'post',
    '/v1/packs/{level}/{version}/download': 'get',
  };

  const usedFields = {
    'OtpVerifyResultDto': ['status', 'tokens', 'registrationToken'],
    'TokensDto': ['accessToken', 'refreshToken'],
    'SessionDto': ['tokens'],
    'ConsentNoticeDto': ['version', 'title', 'text', 'purposes'],
    'ConsentPurposeDto': ['id', 'required', 'label'],
    'ReferenceItemDto': ['code', 'name'],
    'MeDto': ['id', 'uiLocale', 'firstName', 'batch', 'onboarding'],
    'AppConfigDto': ['learning'],
    'LearningRulesDto': ['sequentialUnlock', 'dailyGoalMinutes'],
    'AnnouncementDto': ['id', 'title', 'body'],
    // Every field the app's outbox sends (the API rejects unknown fields).
    'AttemptDto': [
      'id',
      'lessonId',
      'packVersion',
      'score',
      'passed',
      'durationMs',
      'answers',
      'finishedAt',
    ],
    'ActivityDto': ['date', 'seconds'],
    'SyncResponseDto': ['stored', 'lessons', 'activity'],
    'LessonResultDto': ['lessonId', 'bestScore', 'passed'],
    'MeOnboardingDto': ['profileComplete', 'batchJoined'],
    'BatchSummaryDto': ['name'],
    'UpdateProfileDto': [
      'firstName',
      'lastName',
      'districtCode',
      'tradeCode',
      'targetJob',
      'selfDeclaredLevel',
    ],
    'DeviceDto': ['clientId', 'platform', 'appVersion'],
    'PackDto': ['level', 'version', 'bytes', 'sha256', 'lessonCount'],
  };

  usedEndpoints.forEach((path, method) {
    test('$method $path exists', () {
      expect(
        (paths[path] as Map<String, dynamic>?)?.containsKey(method),
        isTrue,
      );
    });
  });

  usedFields.forEach((schema, fields) {
    test('$schema has $fields', () {
      final props =
          ((schemas[schema] as Map<String, dynamic>?)?['properties']
              as Map<String, dynamic>?) ??
          {};
      expect(props.keys, containsAll(fields));
    });
  });
}
