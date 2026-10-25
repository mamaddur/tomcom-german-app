import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/src/api/api_client.dart';
import 'package:tomcom_german/src/app.dart';
import 'package:tomcom_german/src/content/content_controller.dart';
import 'package:tomcom_german/src/content/pack_store.dart';
import 'package:tomcom_german/src/onboarding/onboarding_controller.dart';
import 'package:tomcom_german/src/progress/progress_controller.dart';
import 'package:tomcom_german/src/session/session_store.dart';

import 'fake_api.dart';
import 'fake_audio.dart';
import 'pack_fixtures.dart';

/// FR-801 profile statistics and FR-802 editing, in Telugu.
void main() {
  late Directory root;
  late FakeApi fake;
  late ContentController content;
  late ProgressController progress;
  late ApiClient api;
  late MemorySessionStore store;

  setUp(() async {
    root = Directory.systemTemp.createTempSync('profile-');
    fake = FakeApi()
      ..registered = true
      ..profileDone = true
      ..batch = 'Synthetic batch 1';
    store = MemorySessionStore();
    await store.write(SessionStore.accessTokenKey, 'access-1');
    await store.write(
      SessionStore.refreshTokenKey,
      'refresh-token-1-xxxxxxxxxxxx',
    );
    api = ApiClient(
      baseUrl: 'http://api.test',
      store: store,
      httpClient: fake.client,
    );
    content = ContentController(
      api: api,
      store: PackStore(() async => root),
      tempDir: () async => root,
      audio: FakeAudio(),
    );
    progress = ProgressController(dir: root);
  });
  tearDown(() => root.deleteSync(recursive: true));

  Future<void> openProfile(WidgetTester tester) async {
    await tester.pumpWidget(
      TomcomApp(
        controller: OnboardingController(api: api, store: store),
        content: content,
        progress: progress,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('my-profile')));
    await tester.pumpAndSettle();
  }

  String stat(WidgetTester tester, String key) => tester
      .widgetList<Text>(
        find.descendant(of: find.byKey(Key(key)), matching: find.byType(Text)),
      )
      .first
      .data!;

  testWidgets(
    'shows lessons completed, quizzes passed, average score and level progress (FR-801)',
    (tester) async {
      final pack = memoryPack();
      content.installed['A1'] = pack;
      progress
        ..open('u1')
        ..recordScreen(pack, pack.lessons[0], 1)
        ..recordQuiz(pack, pack.lessons[0], 1.0, passMark: 0.8)
        ..recordScreen(pack, pack.lessons[1], 1)
        ..recordQuiz(pack, pack.lessons[1], 0.6, passMark: 0.8);
      await openProfile(tester);

      expect(find.text('రవి'), findsOneWidget);
      expect(find.text('ఎలక్ట్రీషియన్ · వరంగల్'), findsOneWidget);
      expect(stat(tester, 'stat-completed'), '2');
      expect(stat(tester, 'stat-passed'), '1');
      expect(stat(tester, 'stat-average'), '80%');
      expect(find.text('33% పాస్'), findsOneWidget);
    },
  );

  testWidgets('before any quiz the average says "not yet"', (tester) async {
    await openProfile(tester);
    expect(stat(tester, 'stat-average'), 'ఇంకా లేదు');
  });

  testWidgets('edits name and trade and saves them to the server (FR-802)', (
    tester,
  ) async {
    // A tall phone screen, so the whole form fits.
    tester.view
      ..physicalSize = const Size(1080, 2400)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await openProfile(tester);
    await tester.tap(find.byKey(const Key('edit-profile')));
    await tester.pumpAndSettle();

    // The form starts with the saved values.
    expect(
      tester
          .widget<TextFormField>(find.byKey(const Key('firstName')))
          .controller!
          .text,
      'రవి',
    );
    await tester.enterText(find.byKey(const Key('firstName')), 'రాము');
    await tester.enterText(find.byKey(const Key('lastName')), 'కుమార్');
    await tester.tap(find.text('సేవ్ చేయండి'));
    await tester.pumpAndSettle();

    expect(fake.bodyOf('PUT /v1/me/profile'), {
      'firstName': 'రాము',
      'lastName': 'కుమార్',
      'districtCode': 'warangal',
      'tradeCode': 'electrician',
      'selfDeclaredLevel': 'none',
    });
    expect(find.text('ప్రొఫైల్ సేవ్ అయింది.'), findsOneWidget);
    expect(find.text('రాము కుమార్'), findsOneWidget);
  });
}
