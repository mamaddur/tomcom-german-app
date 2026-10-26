import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/l10n/app_localizations.dart';
import 'package:tomcom_german/src/api/api_client.dart';
import 'package:tomcom_german/src/content/content_controller.dart';
import 'package:tomcom_german/src/content/pack_models.dart';
import 'package:tomcom_german/src/content/pack_store.dart';
import 'package:tomcom_german/src/session/session_store.dart';
import 'package:tomcom_german/src/tutor/tutor_logic.dart';
import 'package:tomcom_german/src/tutor/tutor_screen.dart';

import 'fake_api.dart';
import 'fake_audio.dart';
import 'pack_fixtures.dart';

/// FR-601 tutor chat in Telugu, FR-603 tappable German, FR-607 daily limit, FR-608 report.
void main() {
  group('reply parts and recordings (FR-603)', () {
    test('splits a reply at its German marks', () {
      expect(splitReply('Sag <de>Guten Morgen!</de> am Morgen.'), [
        (text: 'Sag ', german: false),
        (text: 'Guten Morgen!', german: true),
        (text: ' am Morgen.', german: false),
      ]);
      expect(splitReply('nur Text'), [(text: 'nur Text', german: false)]);
      expect(splitReply('<de>Danke</de>'), [(text: 'Danke', german: true)]);
      expect(splitReply('offen <de>ohne Ende'), [
        (text: 'offen <de>ohne Ende', german: false),
      ]);
    });

    test('finds the recording of a phrase in explanations, dialogues and vocabulary', () {
      final pack = LessonPack.fromJson({
        'level': 'A1',
        'version': 1,
        'settings': {'passMark': 0.8, 'questionsPerQuiz': 10},
        'lessons': [
          {
            'id': 'l1',
            'order': 1,
            'title': {'te': 'ఒకటి', 'en': 'One'},
            'description': {'te': '', 'en': ''},
            'estMinutes': 5,
            'screens': [
              {
                'id': 's1',
                'order': 1,
                'type': 'explain',
                'body': {'te': 'వివరణ', 'en': 'Explanation'},
                'examples': [
                  {'text': 'Guten Morgen!', 'audio': 'a-morgen'},
                ],
              },
              {
                'id': 's2',
                'order': 2,
                'type': 'dialogue',
                'lines': [
                  {
                    'speaker': 'Anna',
                    'german': {'text': 'Danke, gut.', 'audio': 'a-danke'},
                    'meaning': {'te': 'ధన్యవాదాలు', 'en': 'Thanks'},
                  },
                ],
              },
            ],
            'questions': <Object>[],
          },
        ],
        'vocab': [
          {
            'id': 'v1',
            'german': {'text': 'Hammer', 'audio': 'a-hammer'},
            'meaning': {'te': 'సుత్తి', 'en': 'hammer'},
            'tradeTags': <String>[],
          },
        ],
        'media': <Object>[],
      });
      final packs = {'A1': pack};
      expect(findRecording(packs, 'guten morgen')?.audioId, 'a-morgen');
      expect(findRecording(packs, 'Danke, gut!')?.audioId, 'a-danke');
      expect(findRecording(packs, 'Hammer')?.audioId, 'a-hammer');
      expect(findRecording(packs, 'Tschüss'), isNull);
      expect(findRecording({}, 'Hammer'), isNull);
    });
  });

  group('tutor screen', () {
    late Directory root;
    late FakeApi fake;
    late FakeAudio audio;
    late ContentController content;

    setUp(() {
      root = Directory.systemTemp.createTempSync('tutor-');
      fake = FakeApi()..registered = true;
      audio = FakeAudio();
      final store = MemorySessionStore();
      store.write(SessionStore.accessTokenKey, 'access-1');
      content = ContentController(
        api: ApiClient(
          baseUrl: 'http://api.test',
          store: store,
          httpClient: fake.client,
        ),
        store: PackStore(() async => root),
        tempDir: () async => root,
        audio: audio,
      );
    });
    tearDown(() => root.deleteSync(recursive: true));

    Future<void> pump(
      WidgetTester tester, {
      String level = 'A1',
      String? lessonId,
    }) async {
      tester.view.physicalSize = const Size(1080, 2200);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('te'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: TutorScreen(content: content, level: level, lessonId: lessonId),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets(
      'starts with questions to tap; an answer shows the German to tap, the demo banner and what is left today',
      (tester) async {
        await pump(tester, level: 'A2', lessonId: 'lesson-1');
        expect(
          find.text(
            'జర్మన్ గురించి ఏదైనా అడగండి. మొదలుపెట్టడానికి ఒక ప్రశ్నను తాకండి.',
          ),
          findsOneWidget,
        );
        expect(find.byKey(const Key('tutor-demo')), findsNothing);

        await tester.tap(find.byKey(const Key('suggest-0')));
        await tester.pumpAndSettle();

        expect(find.text('ఎవరినైనా ఎలా పలకరించాలి?'), findsOneWidget);
        expect(find.byKey(const Key('phrase-Guten Morgen!')), findsOneWidget);
        expect(find.byKey(const Key('tutor-demo')), findsOneWidget);
        expect(find.text('ఈ రోజు 29 సందేశాలు మిగిలాయి'), findsOneWidget);
        // The tutor is told the level and lesson the learner is on (FR-604).
        expect(fake.tutorSent.single, {
          'text': 'ఎవరినైనా ఎలా పలకరించాలి?',
          'level': 'A2',
          'lessonId': 'lesson-1',
        });
      },
    );

    testWidgets('typing sends a message; no demo banner with a real model', (
      tester,
    ) async {
      fake.tutorDemo = false;
      await pump(tester);
      await tester.enterText(find.byKey(const Key('tutor-input')), 'Hallo');
      await tester.tap(find.byKey(const Key('tutor-send')));
      await tester.pumpAndSettle();
      expect(find.text('Hallo'), findsOneWidget);
      expect(find.byKey(const Key('tutor-demo')), findsNothing);
      expect(fake.tutorSent.single['text'], 'Hallo');
    });

    testWidgets('shows the earlier conversation', (tester) async {
      fake.tutorHistory = [
        {
          'id': 'm1',
          'role': 'user',
          'content': 'Hallo',
          'germanPhrases': <String>[],
          'flagged': false,
          'createdAt': '2026-10-25T10:00:00Z',
        },
        {
          'id': 'm2',
          'role': 'assistant',
          'content': 'Sag <de>Hallo!</de>',
          'germanPhrases': ['Hallo!'],
          'flagged': true,
          'createdAt': '2026-10-25T10:00:01Z',
        },
      ];
      await pump(tester);
      expect(find.text('Hallo'), findsOneWidget);
      expect(find.byKey(const Key('phrase-Hallo!')), findsOneWidget);
      // Already reported: the flag is filled in and cannot be tapped again.
      expect(find.byIcon(Icons.flag), findsOneWidget);
    });

    testWidgets('tapping a German phrase plays its lesson recording (FR-603)', (
      tester,
    ) async {
      await tester.runAsync(() async {
        final built = buildPackZip(rich: true);
        final zip = File('${root.path}/p.zip')..writeAsBytesSync(built.zip);
        content.installed['A1'] = await content.store.install(
          'A1',
          1,
          zip,
          built.sha256,
        );
      });
      await pump(tester);
      await tester.tap(find.byKey(const Key('suggest-0')));
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('phrase-Guten Morgen!')));
        await Future<void>.delayed(const Duration(milliseconds: 200));
      });
      expect(audio.played, hasLength(1));
      expect(audio.played.single.path, endsWith('.opus'));
    });

    testWidgets(
      'a phrase without a recording says so instead of staying silent',
      (tester) async {
        fake.tutorAnswer = 'Sag <de>Tschüss</de>';
        await pump(tester);
        await tester.tap(find.byKey(const Key('suggest-1')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('phrase-Tschüss')));
        await tester.pumpAndSettle();
        expect(
          find.text('ఈ వాక్యానికి ఇంకా రికార్డింగ్ లేదు.'),
          findsOneWidget,
        );
        expect(audio.played, isEmpty);
      },
    );

    testWidgets('over the daily limit the box closes with a message (FR-607)', (
      tester,
    ) async {
      fake
        ..tutorFailStatus = 429
        ..tutorFailCode = 'tutor_daily_limit';
      await pump(tester);
      await tester.tap(find.byKey(const Key('suggest-0')));
      await tester.pumpAndSettle();
      expect(
        find.text('ఈ రోజు సందేశాలన్నీ వాడేశారు. రేపు మళ్ళీ రండి.'),
        findsOneWidget,
      );
      expect(
        tester.widget<TextField>(find.byKey(const Key('tutor-input'))).enabled,
        isFalse,
      );
    });

    testWidgets('without a connected model the chat says it is not available', (
      tester,
    ) async {
      fake.tutorFailStatus = 503;
      await pump(tester);
      await tester.tap(find.byKey(const Key('suggest-0')));
      await tester.pumpAndSettle();
      expect(find.text('ట్యూటర్ ఇప్పుడు అందుబాటులో లేదు.'), findsOneWidget);
      expect(find.byKey(const Key('tutor-input')), findsNothing);
    });

    testWidgets('offline: says so and keeps the box open (NFR-05)', (
      tester,
    ) async {
      fake.failRoutes.add('POST /v1/tutor/messages');
      await pump(tester);
      await tester.tap(find.byKey(const Key('suggest-0')));
      await tester.pumpAndSettle();
      expect(
        find.text('ఇంటర్నెట్ లేదు. ట్యూటర్‌కు కనెక్షన్ కావాలి.'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('tutor-input')), findsOneWidget);
    });

    testWidgets('reporting a wrong answer takes two taps (FR-608)', (
      tester,
    ) async {
      await pump(tester);
      await tester.tap(find.byKey(const Key('suggest-0')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('flag-reply-1')));
      await tester.pumpAndSettle();
      expect(find.text('ఏమి తప్పు?'), findsOneWidget);
      await tester.tap(find.byKey(const Key('reason-German is wrong')));
      await tester.pumpAndSettle();
      expect(fake.tutorFlags.single, {'reason': 'German is wrong'});
      expect(
        find.text('ధన్యవాదాలు. ఒక సమీక్షకుడు పరిశీలిస్తారు.'),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.flag), findsOneWidget);
    });
  });
}
