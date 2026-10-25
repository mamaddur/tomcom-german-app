import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/l10n/app_localizations.dart';
import 'package:tomcom_german/src/api/api_client.dart';
import 'package:tomcom_german/src/checkpoint/checkpoint_screen.dart';
import 'package:tomcom_german/src/content/content_controller.dart';
import 'package:tomcom_german/src/content/levels_screen.dart';
import 'package:tomcom_german/src/content/pack_store.dart';
import 'package:tomcom_german/src/progress/progress_controller.dart';
import 'package:tomcom_german/src/session/session_store.dart';

import 'fake_api.dart';
import 'fake_audio.dart';
import 'pack_fixtures.dart';

/// FR-404 in the app: the level checkpoint, online, in Telugu.
void main() {
  late Directory root;
  late FakeApi fake;
  late ApiClient api;
  late FakeAudio audio;

  Map<String, String> l10n(String en) => {'te': '$en (te)', 'en': en};
  Map<String, dynamic> attempt() => {
    'id': 'att-1',
    'status': 'in_progress',
    'total': null,
    'sectionScores': null,
    'passMark': 0.6,
    'startedAt': '2026-10-25T10:00:00Z',
    'submittedAt': null,
    'level': 'A1',
    'expiresAt': '2026-10-25T11:30:00Z',
    'sections': {
      'reading': [
        {
          'id': 'r1',
          'type': 'mcq',
          'prompt': l10n('Reading one'),
          'payload': {
            'options': ['Hallo', 'Tschüss'],
          },
          'difficulty': 1,
        },
      ],
      'listening': [
        {
          'id': 'l1',
          'type': 'listen_choose',
          'prompt': l10n('Listening one'),
          'payload': {
            'audio': 'media-1',
            'options': ['Guten Morgen', 'Gute Nacht'],
          },
          'difficulty': 1,
        },
      ],
      'writing': [
        {
          'id': 'w1',
          'prompt': l10n('Write about your work'),
          'payload': {'minWords': 3, 'maxWords': 20},
          'difficulty': 1,
        },
      ],
    },
  };

  setUp(() async {
    root = Directory.systemTemp.createTempSync('checkpoint-');
    fake = FakeApi();
    audio = FakeAudio();
    final store = MemorySessionStore();
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
  });
  tearDown(() => root.deleteSync(recursive: true));

  Widget wrap(Widget home) => MaterialApp(
    locale: const Locale('te'),
    supportedLocales: AppLocalizations.supportedLocales,
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: home,
  );

  Future<void> open(WidgetTester tester) async {
    await tester.pumpWidget(
      wrap(
        CheckpointScreen(
          api: api,
          level: 'A1',
          audio: audio,
          tempDir: () async => root,
          random: Random(1),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> next(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('checkpoint-next')));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'reading, listening and writing, then submit; writing waits for the trainer',
    (tester) async {
      fake
        ..checkpointAttempt = attempt()
        ..checkpointResult = {
          ...attempt(),
          'status': 'awaiting_marking',
          'sectionScores': {'reading': 1, 'listening': 0},
          'sections': null,
        };
      await open(tester);

      expect(find.text('చదవడం · 1లో 1'), findsOneWidget);
      await tester.tap(find.text('Hallo'));
      await tester.pumpAndSettle();
      await next(tester);

      expect(find.text('వినడం · 1లో 1'), findsOneWidget);
      // The recording comes from the server for this attempt only: real file I/O.
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('quiz-play')));
        for (var i = 0; i < 50 && audio.played.isEmpty; i++) {
          await Future<void>.delayed(const Duration(milliseconds: 20));
        }
      });
      expect(audio.played.single.path, endsWith('cp-media-1.opus'));
      await tester.tap(find.text('Gute Nacht'));
      await tester.pumpAndSettle();
      await next(tester);

      expect(find.text('జర్మన్‌లో రాయండి (3–20 పదాలు).'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('writing-w1')), 'Ich bin');
      await tester.pumpAndSettle();
      expect(find.text('2 పదాలు'), findsOneWidget);
      await next(tester);

      // Too short: submit stays off and says why.
      expect(
        find.text('మీ రాతలో 3–20 పదాలు ఉండాలి (ఇప్పుడు 2).'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(find.byKey(const Key('checkpoint-submit')))
            .onPressed,
        isNull,
      );
      await tester.tap(find.byIcon(Icons.arrow_back));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('writing-w1')),
        'Ich bin Elektriker',
      );
      await next(tester);
      expect(find.text('అన్ని ప్రశ్నలకు జవాబు ఇచ్చారు.'), findsOneWidget);

      await tester.tap(find.byKey(const Key('checkpoint-submit')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('confirm-submit')));
      await tester.pumpAndSettle();

      expect(fake.bodyOf('POST /v1/checkpoints/attempts/att-1/submit'), {
        'answers': {'r1': 0, 'l1': 1},
        'writing': {'w1': 'Ich bin Elektriker'},
      });
      expect(
        find.text('మీ శిక్షకుడు త్వరలో మీ రాతకు మార్కులు వేస్తారు.'),
        findsOneWidget,
      );
      expect(find.text('చదవడం: 100%'), findsOneWidget);
      expect(find.text('వినడం: 0%'), findsOneWidget);
    },
  );

  testWidgets('a pass and a fail are shown with the score', (tester) async {
    final noWriting = jsonDecode(jsonEncode(attempt())) as Map<String, dynamic>;
    (noWriting['sections'] as Map)['writing'] = <Object>[];
    fake
      ..checkpointAttempt = noWriting
      ..checkpointResult = {
        ...noWriting,
        'status': 'failed',
        'total': 0.5,
        'sectionScores': {'reading': 1, 'listening': 0},
        'sections': null,
      };
    await open(tester);
    await next(tester);
    await next(tester);
    expect(
      find.text(
        '1 ప్రశ్నలకు ఇంకా జవాబు ఇవ్వలేదు.'.replaceFirst(
          '1 ప్రశ్నలకు',
          '2 ప్రశ్నలకు',
        ),
      ),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('checkpoint-submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('confirm-submit')));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'ఈసారి పాస్ కాలేదు. 60% కావాలి. మళ్ళీ ప్రయత్నించవచ్చు: ప్రశ్నలు మారుతాయి.',
      ),
      findsOneWidget,
    );
    expect(find.text('50% సరైనవి'), findsOneWidget);
  });

  testWidgets('offline: says the checkpoint needs internet', (tester) async {
    fake.failRoutes.add('POST /v1/checkpoints/A1/attempts');
    await open(tester);
    expect(
      find.text(
        'చెక్‌పాయింట్‌కు ఇంటర్నెట్ కావాలి. కనెక్ట్ అయి మళ్ళీ ప్రయత్నించండి.',
      ),
      findsOneWidget,
    );
  });

  group('on the Levels screen', () {
    Future<void> levels(
      WidgetTester tester,
      Map<String, dynamic> status,
    ) async {
      fake.checkpoints = [status];
      final content = ContentController(
        api: api,
        store: PackStore(() async => root),
        tempDir: () async => root,
        audio: audio,
      );
      content.installed['A1'] = memoryPack();
      final progress = ProgressController(dir: root)..open('u1');
      await tester.pumpWidget(
        wrap(LevelsScreen(content: content, progress: progress)),
      );
      await tester.runAsync(() => content.refresh());
      await tester.pumpAndSettle();
    }

    Map<String, dynamic> status({bool eligible = false, bool passed = false}) =>
        {
          'level': 'A1',
          'available': true,
          'lessons': 3,
          'lessonsPassed': eligible ? 3 : 1,
          'eligible': eligible,
          'passed': passed,
          'latest': passed
              ? {
                  'id': 'a',
                  'status': 'passed',
                  'total': 0.73,
                  'sectionScores': {'reading': 1},
                  'passMark': 0.6,
                  'startedAt': '2026-10-25T10:00:00Z',
                  'submittedAt': '2026-10-25T10:30:00Z',
                }
              : null,
        };

    testWidgets('locked until every lesson is passed', (tester) async {
      await levels(tester, status());
      await tester.scrollUntilVisible(
        find.textContaining('చెక్‌పాయింట్ తెరవడానికి'),
        200,
      );
      expect(
        find.text(
          'చెక్‌పాయింట్ తెరవడానికి అన్ని పాఠాలు పాస్ అవ్వండి (3లో 1 పాస్).',
        ),
        findsOneWidget,
      );
    });

    testWidgets('offered once eligible, and shown as passed afterwards', (
      tester,
    ) async {
      await levels(tester, status(eligible: true));
      await tester.scrollUntilVisible(
        find.byKey(const Key('checkpoint-A1')),
        200,
      );
      expect(find.text('A1 చెక్‌పాయింట్ రాయండి'), findsOneWidget);
    });

    testWidgets('shows the pass with its score', (tester) async {
      await levels(tester, status(eligible: true, passed: true));
      await tester.scrollUntilVisible(
        find.textContaining('చెక్‌పాయింట్ పాస్'),
        200,
      );
      expect(find.text('చెక్‌పాయింట్ పాస్ · 73%'), findsOneWidget);
    });
  });
}
