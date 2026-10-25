import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/src/api/api_client.dart';
import 'package:tomcom_german/src/session/session_store.dart';

import 'fake_api.dart';

void main() {
  test('refreshes an expired access token once and retries', () async {
    final fake = FakeApi()
      ..registered = true
      ..expireAccessTokenOnce = true;
    final store = MemorySessionStore();
    await store.write(SessionStore.accessTokenKey, 'access-1');
    await store.write(
      SessionStore.refreshTokenKey,
      'refresh-token-1-xxxxxxxxxxxx',
    );
    final api = ApiClient(
      baseUrl: 'http://api.test',
      store: store,
      httpClient: fake.client,
    );

    final me = await api.me();
    expect(me.uiLocale, 'te');
    expect(fake.routes, ['GET /v1/me', 'POST /v1/auth/refresh', 'GET /v1/me']);
    expect(store.values[SessionStore.accessTokenKey], 'access-2');
  });

  test(
    'without a session, signed-in calls fail with session_expired',
    () async {
      final api = ApiClient(
        baseUrl: 'http://api.test',
        store: MemorySessionStore(),
        httpClient: FakeApi().client,
      );
      expect(
        api.me(),
        throwsA(
          isA<ApiException>().having((e) => e.code, 'code', 'session_expired'),
        ),
      );
    },
  );

  test('keeps one installation ID', () async {
    final store = MemorySessionStore();
    expect(await store.deviceId(), await store.deviceId());
  });
}
