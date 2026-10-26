import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config.dart';
import '../session/session_store.dart';
import '../content/pack_models.dart';
import 'models.dart';

/// An error the API returned (`code` from application/problem+json), or `network_error`.
class ApiException implements Exception {
  ApiException(this.status, this.code, [this.extra = const {}]);
  final int status;
  final String code;
  final Map<String, dynamic> extra;

  @override
  String toString() => 'ApiException($status, $code)';
}

/// Talks only to the TOMCOM API (never to vendors). Refreshes the session once on 401.
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required this.store,
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  final String baseUrl;
  final SessionStore store;
  final http.Client _http;

  Future<Map<String, dynamic>> deviceInfo() async => {
    'clientId': await store.deviceId(),
    'platform': defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
    'appVersion': appVersion,
  };

  // ── Sign-in (FR-101, FR-104, FR-107) ──

  Future<void> requestOtp(String phone, String locale) => _send(
    'POST',
    '/v1/auth/otp/request',
    body: {'phone': phone, 'locale': locale},
  );

  Future<OtpVerifyResult> verifyOtp(String phone, String code) async {
    final json = await _send(
      'POST',
      '/v1/auth/otp/verify',
      body: {'phone': phone, 'code': code, 'device': await deviceInfo()},
    );
    final result = OtpVerifyResult.fromJson(json as Map<String, dynamic>);
    if (result.tokens != null) await _saveTokens(result.tokens!);
    return result;
  }

  Future<ConsentNotice> consentNotice(String locale) async =>
      ConsentNotice.fromJson(
        await _send('GET', '/v1/consent/notice?locale=$locale')
            as Map<String, dynamic>,
      );

  Future<void> register({
    required String registrationToken,
    required String locale,
    required int noticeVersion,
    required List<String> purposes,
  }) async {
    final json = await _send(
      'POST',
      '/v1/auth/register',
      body: {
        'registrationToken': registrationToken,
        'locale': locale,
        'consent': {'noticeVersion': noticeVersion, 'purposes': purposes},
        'device': await deviceInfo(),
      },
    );
    await _saveTokens(
      Tokens.fromJson(
        (json as Map<String, dynamic>)['tokens'] as Map<String, dynamic>,
      ),
    );
  }

  Future<void> signOut() async {
    final refresh = await store.read(SessionStore.refreshTokenKey);
    await store.clearSession();
    if (refresh != null) {
      try {
        await _send('POST', '/v1/auth/logout', body: {'refreshToken': refresh});
      } on ApiException {
        // Already signed out on this device; the server session expires on its own.
      }
    }
  }

  // ── Data rights (FR-804, DPDP Act 2023) ──

  /// Everything the server holds about the learner, as pretty-printed JSON.
  Future<String> exportMyData() async =>
      const JsonEncoder.withIndent('  ')
          .convert(await _authed('GET', '/v1/me/export'));

  /// Erases the account on the server, then forgets the session on this phone.
  Future<void> eraseAccount() async {
    await _authed('POST', '/v1/me/erase', body: {'confirm': true});
    await store.clearSession();
  }

  // ── Profile and batch (FR-102, FR-103, FR-106) ──

  Future<Me> me() async =>
      Me.fromJson(await _authed('GET', '/v1/me') as Map<String, dynamic>);

  Future<Me> setLocale(String locale) async => Me.fromJson(
    await _authed('PUT', '/v1/me/locale', body: {'locale': locale})
        as Map<String, dynamic>,
  );

  Future<Me> setProfile(ProfileInput input) async => Me.fromJson(
    await _authed('PUT', '/v1/me/profile', body: input.toJson())
        as Map<String, dynamic>,
  );

  Future<Me> joinBatch(String code) async => Me.fromJson(
    await _authed('POST', '/v1/me/batch', body: {'code': code})
        as Map<String, dynamic>,
  );

  Future<List<ReferenceItem>> districts() =>
      _reference('/v1/reference/districts');
  Future<List<ReferenceItem>> trades() => _reference('/v1/reference/trades');

  Future<List<ReferenceItem>> _reference(String path) async => [
    for (final j in await _send('GET', path) as List<dynamic>)
      ReferenceItem.fromJson(j as Map<String, dynamic>),
  ];

  // ── Dashboard (FR-204, FR-205) ──

  /// Public start-up config; `learning` holds the unlock and daily-goal rules.
  /// Public start-up config. Sends this app's version so the server can ask for an update
  /// (FR-1102); `learning` holds the unlock and daily-goal rules.
  Future<Map<String, dynamic>> appConfig() async {
    final platform = defaultTargetPlatform == TargetPlatform.iOS
        ? 'ios'
        : 'android';
    return await _send(
      'GET',
      '/v1/app/config?platform=$platform&version=$appVersion',
    ) as Map<String, dynamic>;
  }

  Future<List<Announcement>> announcements() async => [
    for (final j in await _authed('GET', '/v1/announcements') as List<dynamic>)
      Announcement.fromJson(j as Map<String, dynamic>),
  ];

  // ── Progress sync (FR-405, NFR-05) ──

  /// Sends quiz attempts and daily learning time; returns the learner's results on the server.
  Future<Map<String, dynamic>> sync({
    required List<Map<String, dynamic>> attempts,
    required List<Map<String, dynamic>> activity,
    List<Map<String, dynamic>> words = const [],
  }) async => await _authed(
    'POST',
    '/v1/sync',
    body: {'attempts': attempts, 'activity': activity, 'words': words},
  ) as Map<String, dynamic>;

  // ── Level checkpoints (FR-404, online only) ──

  Future<List<CheckpointStatus>> checkpoints() async => [
    for (final j in await _authed('GET', '/v1/checkpoints') as List<dynamic>)
      CheckpointStatus.fromJson(j as Map<String, dynamic>),
  ];

  /// Starts an attempt, or resumes the open one.
  Future<CheckpointAttempt> startCheckpoint(String level) async =>
      CheckpointAttempt.fromJson(
        await _authed('POST', '/v1/checkpoints/$level/attempts')
            as Map<String, dynamic>,
      );

  Future<CheckpointAttempt> submitCheckpoint(
    String attemptId, {
    required Map<String, Object?> answers,
    required Map<String, String> writing,
  }) async => CheckpointAttempt.fromJson(
    await _authed(
      'POST',
      '/v1/checkpoints/attempts/$attemptId/submit',
      body: {'answers': answers, 'writing': writing},
    ) as Map<String, dynamic>,
  );

  /// A listening recording of the learner's own open attempt.
  Future<List<int>> checkpointAudio(String attemptId, String mediaId) async =>
      await _authed(
        'GET',
        '/v1/checkpoints/attempts/$attemptId/media/$mediaId',
        raw: true,
      ) as List<int>;

  // ── AI tutor (FR-601, FR-607, FR-608; online only) ──

  /// Throws `tutor_daily_limit` (with `resumesAt`) over the daily limit, `tutor_unavailable` when
  /// no model is connected, and `feature_disabled` when TOMCOM switched the tutor off.
  Future<TutorReply> tutorSend(
    String text,
    String level, {
    String? lessonId,
  }) async => TutorReply.fromJson(
    await _authed(
      'POST',
      '/v1/tutor/messages',
      body: {'text': text, 'level': level, 'lessonId': ?lessonId},
    ) as Map<String, dynamic>,
  );

  Future<List<TutorMessage>> tutorHistory() async => [
    for (final j in await _authed('GET', '/v1/tutor/messages') as List<dynamic>)
      TutorMessage.fromJson(j as Map<String, dynamic>),
  ];

  Future<void> tutorFlag(String messageId, String reason) async {
    await _authed(
      'POST',
      '/v1/tutor/messages/$messageId/flag',
      body: {'reason': reason},
    );
  }

  // ── Certificates (FR-701, FR-702) ──

  Future<List<Certificate>> certificates() async => [
    for (final j
        in await _authed('GET', '/v1/me/certificates') as List<dynamic>)
      Certificate.fromJson(j as Map<String, dynamic>),
  ];

  Future<List<int>> certificatePdf(String id) async =>
      await _authed('GET', '/v1/me/certificates/$id/pdf', raw: true)
          as List<int>;

  // ── Lesson packs (FR-307) ──

  Future<List<PackInfo>> packs() async => [
    for (final j in await _authed('GET', '/v1/packs') as List<dynamic>)
      PackInfo.fromJson(j as Map<String, dynamic>),
  ];

  /// Streams a pack zip to [target], reporting received bytes. Refreshes the session once if needed.
  Future<void> downloadPack(
    PackInfo pack,
    File target, {
    void Function(int received)? onProgress,
  }) async {
    Future<http.StreamedResponse> send() async {
      final req = http.Request(
        'GET',
        Uri.parse('$baseUrl/v1/packs/${pack.level}/${pack.version}/download'),
      );
      req.headers['Authorization'] =
          'Bearer ${await store.read(SessionStore.accessTokenKey)}';
      return _http.send(req);
    }

    http.StreamedResponse res;
    try {
      res = await send();
      if (res.statusCode == 401) {
        await res.stream.drain<void>();
        await _refresh();
        res = await send();
      }
    } on ApiException {
      rethrow;
    } on Exception {
      throw ApiException(0, 'network_error');
    }
    if (res.statusCode != 200) {
      await res.stream.drain<void>();
      throw ApiException(res.statusCode, 'download_failed');
    }
    final sink = target.openWrite();
    var received = 0;
    try {
      await for (final chunk in res.stream) {
        sink.add(chunk);
        received += chunk.length;
        onProgress?.call(received);
      }
    } on Exception {
      throw ApiException(0, 'network_error');
    } finally {
      await sink.close();
    }
  }

  // ── Plumbing ──

  Future<dynamic> _authed(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool raw = false,
  }) async {
    final token = await store.read(SessionStore.accessTokenKey);
    if (token == null) throw ApiException(401, 'session_expired');
    try {
      return await _send(
        method,
        path,
        body: body,
        accessToken: token,
        raw: raw,
      );
    } on ApiException catch (e) {
      if (e.status != 401) rethrow;
      await _refresh();
      return _send(
        method,
        path,
        body: body,
        accessToken: await store.read(SessionStore.accessTokenKey),
        raw: raw,
      );
    }
  }

  Future<void> _refresh() async {
    final refresh = await store.read(SessionStore.refreshTokenKey);
    if (refresh == null) throw ApiException(401, 'session_expired');
    try {
      final json = await _send(
        'POST',
        '/v1/auth/refresh',
        body: {'refreshToken': refresh},
      );
      await _saveTokens(Tokens.fromJson(json as Map<String, dynamic>));
    } on ApiException catch (e) {
      if (e.status == 401) {
        await store.clearSession();
        throw ApiException(401, 'session_expired');
      }
      rethrow;
    }
  }

  Future<void> _saveTokens(Tokens t) async {
    await store.write(SessionStore.accessTokenKey, t.accessToken);
    await store.write(SessionStore.refreshTokenKey, t.refreshToken);
  }

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    String? accessToken,
    bool raw = false,
  }) async {
    final request = http.Request(method, Uri.parse('$baseUrl$path'));
    request.headers['Accept'] = 'application/json';
    if (accessToken != null) {
      request.headers['Authorization'] = 'Bearer $accessToken';
    }
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    final http.Response response;
    try {
      response = await http.Response.fromStream(
        await _http.send(request).timeout(const Duration(seconds: 20)),
      );
    } on Exception {
      throw ApiException(0, 'network_error');
    }
    // Binary downloads (recordings) come back as bytes when they succeed.
    if (raw && response.statusCode < 400) return response.bodyBytes;
    final decoded = response.body.isEmpty
        ? null
        : jsonDecode(utf8.decode(response.bodyBytes));
    if (response.statusCode >= 400) {
      final problem = decoded is Map<String, dynamic>
          ? decoded
          : <String, dynamic>{};
      throw ApiException(
        response.statusCode,
        problem['code'] as String? ?? 'error',
        problem,
      );
    }
    return decoded;
  }
}
