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

/// FR-201–FR-205: the learner's dashboard, in Telugu.
void main() {
  late Directory root;
  late FakeApi fake;
  late ContentController content;
  late ProgressController progress;
  late ApiClient api;
  late MemorySessionStore store;

  Future<void> pumpApp(WidgetTester tester) async {
    await tester.pumpWidget(
      TomcomApp(
        controller: OnboardingController(api: api, store: store),
        content: content,
        progress: progress,
      ),
    );
    await tester.pumpAndSettle();
  }

  setUp(() async {
    root = Directory.systemTemp.createTempSync('dashboard-');
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

  testWidgets('shows a TOMCOM announcement in Telugu, and closes it (FR-205)', (
    tester,
  ) async {
    fake.announcements = [
      {
        'id': 'a1',
        'title': {'te': 'రేపు తరగతి లేదు', 'en': 'No class tomorrow'},
        'body': {'te': 'ఇంటి నుండి నేర్చుకోండి', 'en': 'Learn from home'},
        'startsAt': '2026-10-25T00:00:00Z',
        'endsAt': null,
      },
    ];
    await pumpApp(tester);
    expect(find.text('రేపు తరగతి లేదు'), findsOneWidget);
    expect(find.text('ఇంటి నుండి నేర్చుకోండి'), findsOneWidget);
    await tester.tap(find.byTooltip('మూసివేయండి'));
    await tester.pumpAndSettle();
    expect(find.text('రేపు తరగతి లేదు'), findsNothing);
  });

  testWidgets(
    'continue card opens the next lesson; levels show their progress (FR-201, FR-202)',
    (tester) async {
      final pack = memoryPack();
      content.installed['A1'] = pack;
      progress
        ..open('u1')
        ..recordQuiz(pack, pack.lessons.first, 0.9, passMark: 0.8);
      await pumpApp(tester);

      expect(find.text('A1 · పాఠం 2'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(const Key('level-A1')),
          matching: find.text('33% పాస్'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('level-A2')),
          matching: find.text('డౌన్‌లోడ్ చేయలేదు'),
        ),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('continue')));
      await tester.pumpAndSettle();
      expect(find.text('వివరణ 2'), findsOneWidget);
      expect(progress.statusOf(pack, pack.lessons[1]), LessonStatus.inProgress);
    },
  );

  testWidgets('daily goal and streak use the server goal (FR-204)', (
    tester,
  ) async {
    fake.learning = {
      'passMark': 0.8,
      'sequentialUnlock': true,
      'dailyGoalMinutes': 15,
    };
    progress
      ..open('u1')
      ..addLearningTime(const Duration(minutes: 6));
    await pumpApp(tester);
    expect(find.text('ఈ రోజు: 15 నిమిషాల్లో 6'), findsOneWidget);
    expect(find.text('ఇంకా వరుస రోజులు లేవు'), findsOneWidget);
  });

  testWidgets('offline: the dashboard still shows progress, without a banner', (
    tester,
  ) async {
    fake.failRoutes.addAll({'GET /v1/app/config', 'GET /v1/announcements'});
    fake.announcements = [
      {
        'id': 'a1',
        'title': {'te': 'శీర్షిక', 'en': 'Title'},
        'body': {'te': 'విషయం', 'en': 'Body'},
        'startsAt': '2026-10-25T00:00:00Z',
        'endsAt': null,
      },
    ];
    final pack = memoryPack();
    content.installed['A1'] = pack;
    await pumpApp(tester);
    expect(find.text('A1 · పాఠం 1'), findsOneWidget);
    expect(find.byIcon(Icons.campaign), findsNothing);
  });
}
