import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/src/api/api_client.dart';
import 'package:tomcom_german/src/app.dart';
import 'package:tomcom_german/src/onboarding/onboarding_controller.dart';
import 'package:tomcom_german/src/session/session_store.dart';

import 'fake_api.dart';

/// Story 1 (pack §2.3): a new learner signs up in Telugu without help.
void main() {
  late FakeApi fake;
  late MemorySessionStore store;

  Future<void> pumpApp(WidgetTester tester) async {
    final api = ApiClient(
      baseUrl: 'http://api.test',
      store: store,
      httpClient: fake.client,
    );
    await tester.pumpWidget(
      TomcomApp(
        controller: OnboardingController(api: api, store: store),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tapText(WidgetTester tester, String text) async {
    await tester.ensureVisible(find.text(text));
    await tester.pump();
    await tester.tap(find.text(text));
    await tester.pumpAndSettle();
  }

  setUp(() {
    fake = FakeApi();
    store = MemorySessionStore();
  });

  testWidgets(
    'new learner: phone → OTP → language → consent → profile → batch → home, in Telugu',
    (tester) async {
      await pumpApp(tester);

      // Welcome and phone screens show Telugu first, with English below.
      expect(find.text('పని కోసం జర్మన్ నేర్చుకోండి'), findsOneWidget);
      expect(find.text('Learn German for work'), findsOneWidget);
      await tapText(tester, 'ప్రారంభించండి / Start');

      expect(find.text('మీ మొబైల్ నంబర్'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('phone')), '5500000101');
      await tapText(tester, 'కోడ్ పంపండి / Send code');

      // Entering all 6 digits continues automatically.
      expect(find.text('6 అంకెల కోడ్ నమోదు చేయండి'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('otp')), '123456');
      await tester.pumpAndSettle();

      // Story 1: after the OTP the learner reaches language selection. Nothing registered yet.
      expect(find.text('మీ భాషను ఎంచుకోండి'), findsOneWidget);
      expect(fake.routes, isNot(contains('POST /v1/auth/register')));
      await tapText(tester, 'తెలుగు');

      // Consent in Telugu; "I agree" stays disabled until the required items are ticked.
      expect(find.text('మీ సమాచారాన్ని మేము ఎలా ఉపయోగిస్తాము'), findsOneWidget);
      final agree = find.widgetWithText(FilledButton, 'నేను అంగీకరిస్తున్నాను');
      expect(tester.widget<FilledButton>(agree).onPressed, isNull);
      await tester.tap(find.byKey(const Key('purpose-learning')));
      await tester.tap(find.byKey(const Key('purpose-progress_sharing')));
      await tester.pumpAndSettle();
      await tester.ensureVisible(agree);
      await tester.pump();
      await tester.tap(agree);
      await tester.pumpAndSettle();

      // FR-104: account created together with consent, in the chosen language.
      final register = fake.bodyOf('POST /v1/auth/register');
      expect(register['locale'], 'te');
      expect(register['consent'], {
        'noticeVersion': 1,
        'purposes': unorderedEquals(['learning', 'progress_sharing']),
      });
      expect(store.values[SessionStore.refreshTokenKey], isNotNull);

      // FR-103: profile in Telugu.
      expect(find.text('మీ గురించి'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('firstName')), 'రవి');
      await tester.tap(find.byKey(const Key('district')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('వరంగల్').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('trade')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('ఎలక్ట్రీషియన్').last);
      await tester.pumpAndSettle();
      await tapText(tester, 'సేవ్ చేయండి');
      expect(fake.bodyOf('PUT /v1/me/profile'), {
        'firstName': 'రవి',
        'districtCode': 'warangal',
        'tradeCode': 'electrician',
        'selfDeclaredLevel': 'none',
      });

      // FR-106: a wrong code shows a Telugu error; the right code joins.
      expect(find.text('బ్యాచ్ కోడ్'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('batchCode')), 'NOPE-1');
      await tapText(tester, 'చేరండి');
      expect(
        find.text('ఈ కోడ్‌తో బ్యాచ్ లేదు. మీ శిక్షకుడిని అడగండి.'),
        findsOneWidget,
      );
      await tester.enterText(find.byKey(const Key('batchCode')), 'TST-001');
      await tapText(tester, 'చేరండి');

      expect(find.text('స్వాగతం, రవి!'), findsOneWidget);
      expect(find.text('బ్యాచ్: Synthetic batch 1'), findsOneWidget);
    },
  );

  testWidgets('a wrong OTP shows the error in Telugu and English', (
    tester,
  ) async {
    await pumpApp(tester);
    await tapText(tester, 'ప్రారంభించండి / Start');
    await tester.enterText(find.byKey(const Key('phone')), '5500000101');
    await tapText(tester, 'కోడ్ పంపండి / Send code');
    await tester.enterText(find.byKey(const Key('otp')), '000000');
    await tester.pumpAndSettle();
    expect(
      find.text(
        'కోడ్ తప్పు. మళ్ళీ ప్రయత్నించండి.\nWrong code. Please try again.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('a returning learner with a saved session goes straight home', (
    tester,
  ) async {
    fake
      ..registered = true
      ..profileDone = true
      ..batch = 'Synthetic batch 1';
    await store.write(SessionStore.accessTokenKey, 'access-1');
    await store.write(
      SessionStore.refreshTokenKey,
      'refresh-token-1-xxxxxxxxxxxx',
    );
    await pumpApp(tester);
    expect(find.text('స్వాగతం, రవి!'), findsOneWidget);
  });

  testWidgets(
    'changing the language later switches the UI and tells the server (FR-102)',
    (tester) async {
      fake
        ..registered = true
        ..profileDone = true
        ..batch = 'Synthetic batch 1';
      await store.write(SessionStore.accessTokenKey, 'access-1');
      await store.write(
        SessionStore.refreshTokenKey,
        'refresh-token-1-xxxxxxxxxxxx',
      );
      await pumpApp(tester);
      await tester.tap(find.text('English'));
      await tester.pumpAndSettle();
      expect(find.text('Welcome, రవి!'), findsOneWidget);
      expect(fake.bodyOf('PUT /v1/me/locale'), {'locale': 'en'});
    },
  );
}
