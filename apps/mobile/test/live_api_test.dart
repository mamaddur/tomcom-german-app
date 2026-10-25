import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/src/api/api_client.dart';
import 'package:tomcom_german/src/api/models.dart';
import 'package:tomcom_german/src/session/session_store.dart';

/// Story 1 against a real dev API (synthetic number, OTP 123456). Skipped unless LIVE_API_URL is set:
///   LIVE_API_URL=http://localhost:3000 flutter test test/live_api_test.dart
void main() {
  final baseUrl = Platform.environment['LIVE_API_URL'];

  test(
    'registers, completes the profile and joins a batch on the real API',
    () async {
      final store = MemorySessionStore();
      final api = ApiClient(baseUrl: baseUrl!, store: store);
      final phone = '55${(Random().nextInt(90000000) + 10000000)}'; // synthetic +9155 range

      await api.requestOtp(phone, 'te');
      final verified = await api.verifyOtp(phone, '123456');
      expect(verified.authenticated, isFalse);

      final notice = await api.consentNotice('te');
      await api.register(
        registrationToken: verified.registrationToken!,
        locale: 'te',
        noticeVersion: notice.version,
        purposes: [
          for (final p in notice.purposes.where((p) => p.required)) p.id,
        ],
      );

      final districts = await api.districts();
      final trades = await api.trades();
      expect(districts, hasLength(33));
      var me = await api.setProfile(
        ProfileInput(
          firstName: 'Test-రవి',
          districtCode: districts.first.code,
          tradeCode: trades.first.code,
          selfDeclaredLevel: 'none',
        ),
      );
      expect(me.profileComplete, isTrue);
      me = await api.joinBatch('tst-001');
      expect(me.batchJoined, isTrue);
      expect((await api.setLocale('en')).uiLocale, 'en');
      await api.signOut();
      expect(store.values[SessionStore.refreshTokenKey], isNull);
    },
    skip: baseUrl == null ? 'set LIVE_API_URL to run against a dev API' : false,
  );
}
