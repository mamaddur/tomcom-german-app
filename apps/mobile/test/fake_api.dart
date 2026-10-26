import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// In-memory stand-in for the TOMCOM API, answering like apps/api does. Records every request.
class FakeApi {
  final requests = <http.Request>[];
  bool registered = false;
  bool profileDone = false;
  String uiLocale = 'te';
  String? batch;
  int accessTokenVersion = 1;

  /// Published packs: level → (version, zip bytes, sha256).
  final packs =
      <String, ({int version, List<int> zip, String sha256, int lessons})>{};
  bool expireAccessTokenOnce = false;

  /// Learning rules served in `GET /v1/app/config` (FR-204, FR-402).
  Map<String, dynamic> learning = {
    'passMark': 0.8,
    'sequentialUnlock': true,
    'dailyGoalMinutes': 10,
  };

  /// Routes (e.g. `GET /v1/announcements`) that fail as if the network were down.
  final failRoutes = <String>{};

  /// What `POST /v1/sync` has received, and the results it returns (FR-405).
  final syncedAttempts = <Map<String, dynamic>>[];
  final serverLessons = <String, ({double best, bool passed})>{};
  final serverActivity = <String, int>{};

  /// Announcements served to the learner (FR-205).
  List<Map<String, dynamic>> announcements = [];

  late final client = MockClient((req) async {
    requests.add(req);
    final body = req.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(req.body) as Map<String, dynamic>;
    final route = '${req.method} ${req.url.path}';
    if (failRoutes.contains(route)) {
      throw http.ClientException('offline (test)', req.url);
    }

    if (req.headers["Authorization"] != null && expireAccessTokenOnce) {
      expireAccessTokenOnce = false;
      return _problem(401, 'access_token_invalid');
    }
    final download = RegExp(r'^GET /v1/packs/(\w+)/(\d+)/download$')
        .firstMatch(route);
    if (download != null) {
      final p = packs[download.group(1)];
      return p == null
          ? _problem(404, 'pack_not_found')
          : http.Response.bytes(
              p.zip,
              200,
              headers: {'content-type': 'application/zip'},
            );
    }
    switch (route) {
      case 'GET /v1/packs':
        return _json(200, [
          for (final e in packs.entries)
            {
              'level': e.key,
              'version': e.value.version,
              'bytes': e.value.zip.length,
              'sha256': e.value.sha256,
              'lessonCount': e.value.lessons,
              'publishedAt': '2026-10-25T00:00:00Z',
            },
        ]);
      case 'POST /v1/auth/otp/request':
        return _json(202, {'expiresInSeconds': 300, 'resendAfterSeconds': 30});
      case 'POST /v1/auth/otp/verify':
        if (body['code'] != '123456') {
          return _problem(400, 'otp_invalid', {'attemptsLeft': 4});
        }
        return registered
            ? _json(200, {
                'status': 'authenticated',
                'tokens': _tokens(),
                'user': _summary(),
              })
            : _json(200, {
                'status': 'registration_required',
                'registrationToken': 'reg-token-xxxxxxxxxxxx',
              });
      case 'GET /v1/consent/notice':
        final te = req.url.queryParameters['locale'] == 'te';
        return _json(200, {
          'version': 1,
          'locale': te ? 'te' : 'en',
          'title': te
              ? 'మీ సమాచారాన్ని మేము ఎలా ఉపయోగిస్తాము'
              : 'How we use your information',
          'text': te ? 'నోటీసు పాఠం' : 'Notice text',
          'purposes': [
            {
              'id': 'learning',
              'required': true,
              'label': te ? 'నాకు జర్మన్ నేర్పండి' : 'Teach me German',
            },
            {
              'id': 'progress_sharing',
              'required': true,
              'label': te ? 'పురోగతిని పంచుకోండి' : 'Share progress',
            },
            {
              'id': 'analytics',
              'required': false,
              'label': te ? 'అనామక డేటా' : 'Anonymous data',
            },
          ],
        });
      case 'POST /v1/auth/register':
        registered = true;
        uiLocale = body['locale'] as String;
        return _json(201, {'tokens': _tokens(), 'user': _summary()});
      case 'POST /v1/auth/refresh':
        accessTokenVersion++;
        return _json(200, _tokens());
      case 'POST /v1/auth/logout':
        return http.Response('', 204);
      case 'GET /v1/me':
        return _json(200, _me());
      case 'PUT /v1/me/locale':
        uiLocale = body['locale'] as String;
        return _json(200, _me());
      case 'PUT /v1/me/profile':
        profileDone = true;
        return _json(200, _me());
      case 'POST /v1/me/batch':
        if (body['code'] != 'TST-001') return _problem(404, 'batch_not_found');
        batch = 'Synthetic batch 1';
        return _json(200, _me());
      case 'GET /v1/app/config':
        return _json(200, {
          'features': <String, bool>{},
          'limits': <String, int>{},
          'learning': learning,
        });
      case 'POST /v1/sync':
        // Like the real API (forbidNonWhitelisted): unknown fields are a 400.
        const fields = {
          'id',
          'lessonId',
          'packVersion',
          'score',
          'passed',
          'durationMs',
          'answers',
          'finishedAt',
        };
        for (final a
            in (body['attempts'] as List).cast<Map<String, dynamic>>()) {
          if (!fields.containsAll(a.keys)) {
            return _problem(400, 'validation_failed');
          }
        }
        for (final a
            in (body['attempts'] as List).cast<Map<String, dynamic>>()) {
          if (syncedAttempts.any((s) => s['id'] == a['id'])) {
            continue;
          }
          syncedAttempts.add(a);
          final old = serverLessons[a['lessonId']];
          final score = (a['score'] as num).toDouble();
          serverLessons[a['lessonId'] as String] = (
            best: old == null || score > old.best ? score : old.best,
            passed: (old?.passed ?? false) || a['passed'] == true,
          );
        }
        for (final d
            in (body['activity'] as List).cast<Map<String, dynamic>>()) {
          final day = d['date'] as String;
          final seconds = d['seconds'] as int;
          if (seconds > (serverActivity[day] ?? 0)) {
            serverActivity[day] = seconds;
          }
        }
        return _json(200, {
          'stored': [for (final a in body['attempts'] as List) a['id']],
          'lessons': [
            for (final e in serverLessons.entries)
              {
                'lessonId': e.key,
                'bestScore': e.value.best,
                'passed': e.value.passed,
              },
          ],
          'activity': [
            for (final e in serverActivity.entries)
              {'date': e.key, 'seconds': e.value},
          ],
        });
      case 'GET /v1/announcements':
        return _json(200, announcements);
      case 'GET /v1/reference/districts':
        return _json(200, [
          {
            'code': 'warangal',
            'name': {'te': 'వరంగల్', 'en': 'Warangal'},
          },
          {
            'code': 'nizamabad',
            'name': {'te': 'నిజామాబాద్', 'en': 'Nizamabad'},
          },
        ]);
      case 'GET /v1/reference/trades':
        return _json(200, [
          {
            'code': 'electrician',
            'name': {'te': 'ఎలక్ట్రీషియన్', 'en': 'Electrician'},
          },
        ]);
    }
    return _problem(404, 'not_found');
  });

  List<String> get routes => [
    for (final r in requests) '${r.method} ${r.url.path}',
  ];

  Map<String, dynamic> bodyOf(String route) => jsonDecode(
    requests.lastWhere((r) => '${r.method} ${r.url.path}' == route).body,
  ) as Map<String, dynamic>;

  Map<String, dynamic> _tokens() => {
    'accessToken': 'access-$accessTokenVersion',
    'refreshToken': 'refresh-token-$accessTokenVersion-xxxxxxxxxxxx',
    'expiresInSeconds': 900,
    'tokenType': 'Bearer',
  };

  Map<String, dynamic> _summary() => {
    'id': 'u1',
    'role': 'learner',
    'uiLocale': uiLocale,
    'onboarding': {'profileComplete': profileDone},
  };

  Map<String, dynamic> _me() => {
    'id': 'u1',
    'role': 'learner',
    'uiLocale': uiLocale,
    'firstName': profileDone ? 'రవి' : null,
    'lastName': null,
    'profile': null,
    'batch': batch == null
        ? null
        : {
            'code': 'TST-001',
            'name': batch,
            'enrolledAt': '2026-10-25T00:00:00Z',
          },
    'onboarding': {
      'profileComplete': profileDone,
      'batchJoined': batch != null,
    },
  };

  static http.Response _json(int status, Object body) => http.Response(
    jsonEncode(body),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );

  static http.Response _problem(
    int status,
    String code, [
    Map<String, dynamic> extra = const {},
  ]) => _json(status, {'status': status, 'code': code, ...extra});
}
