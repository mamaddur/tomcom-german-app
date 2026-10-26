import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/l10n/app_localizations.dart';
import 'package:tomcom_german/src/content/pack_models.dart';
import 'package:tomcom_german/src/progress/progress_controller.dart';
import 'package:tomcom_german/src/quiz/quiz_screen.dart';

import 'fake_audio.dart';
import 'pack_fixtures.dart';

/// Story 2 (pack §2.3), app side: lesson quiz, pass mark, review and retake (FR-401–FR-403).
void main() {
  late Directory dir;
  late ProgressController progress;
  late FakeAudio audio;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('quiz-');
    progress = ProgressController(dir: dir)..open('u1');
    audio = FakeAudio();
  });
  tearDown(() => dir.deleteSync(recursive: true));

  Future<void> pumpQuiz(WidgetTester tester, LessonPack pack) async {
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
        home: QuizScreen(
          pack: pack,
          lesson: pack.lessons.first,
          progress: progress,
          audio: audio,
          mediaFile: (id) async => File('${dir.path}/$id.opus'),
          random: Random(1),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.ensureVisible(f);
    await tester.pump();
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  /// Answers whichever question is showing, right or wrong, then checks it and moves on.
  Future<void> answer(WidgetTester tester, {required bool right}) async {
    String? shown;
    for (final id in ['q-mcq', 'q-listen', 'q-gap', 'q-pairs', 'q-order']) {
      if (find.text('ప్రశ్న $id').evaluate().isNotEmpty) shown = id;
    }
    switch (shown) {
      case 'q-mcq':
        await tap(tester, find.text(right ? 'Hallo' : 'Danke'));
      case 'q-listen':
        await tap(tester, find.byKey(const Key('quiz-play')));
        await tap(tester, find.text(right ? 'Guten Morgen' : 'Gute Nacht'));
      case 'q-gap':
        await tap(tester, find.text(right ? 'heiße' : 'bist'));
        expect(
          find.text(right ? 'Ich heiße Ravi.' : 'Ich bist Ravi.'),
          findsOneWidget,
        );
      case 'q-pairs':
        // Hallo ↔ Hello (right index 1), Danke ↔ Thanks (right index 0).
        await tap(tester, find.byKey(const Key('left-0')));
        await tap(tester, find.byKey(Key(right ? 'right-1' : 'right-0')));
        await tap(tester, find.byKey(const Key('left-1')));
        await tap(tester, find.byKey(Key(right ? 'right-0' : 'right-1')));
      case 'q-order':
        for (final i in right ? [0, 1, 2] : [2, 1, 0]) {
          await tap(tester, find.byKey(Key('word-$i')));
        }
      default:
        fail('no question showing');
    }
    await tap(tester, find.byKey(const Key('quiz-action'))); // check
    expect(
      find.text(right ? 'సరైనది!' : 'సరికాదు. సరైన జవాబు:'),
      findsOneWidget,
    );
    await tap(tester, find.byKey(const Key('quiz-action'))); // next
  }

  testWidgets(
    'all five question types answered right: passed, next lesson opens, attempt saved for sync',
    (tester) async {
      final pack = quizPack();
      await pumpQuiz(tester, pack);
      expect(find.text('5లో 1వ ప్రశ్న'), findsOneWidget);
      for (var i = 0; i < 5; i++) {
        await answer(tester, right: true);
      }
      expect(find.text('100% సరైనవి'), findsOneWidget);
      expect(
        find.text('పాస్ అయ్యారు! తదుపరి పాఠం తెరుచుకుంది.'),
        findsOneWidget,
      );
      expect(progress.statusOf(pack, pack.lessons[1]), LessonStatus.available);
      expect(audio.played, hasLength(1), reason: 'listening question played');

      // FR-405: the attempt waits in the outbox with a client UUID.
      final attempt = progress.pendingAttempts.single;
      expect(
        attempt['id'],
        matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-')),
      );
      expect(attempt['score'], 1.0);
      expect(attempt['answers'], hasLength(5));
    },
  );

  testWidgets(
    'below the pass mark: mistakes are reviewed with the right answer, and a retake can pass',
    (tester) async {
      final pack = quizPack();
      await pumpQuiz(tester, pack);
      for (var i = 0; i < 5; i++) {
        await answer(tester, right: i < 3);
      }
      expect(find.text('60% సరైనవి'), findsOneWidget);
      expect(
        find.text(
          'పాస్ కావడానికి 80% కావాలి. మళ్ళీ ప్రయత్నించండి: ప్రతిసారి ప్రశ్నలు మారుతాయి.',
        ),
        findsOneWidget,
      );
      expect(find.text('మీ తప్పులను చూడండి'), findsOneWidget);
      expect(progress.statusOf(pack, pack.lessons[1]), LessonStatus.locked);

      await tap(tester, find.byKey(const Key('retake')));
      expect(find.text('5లో 1వ ప్రశ్న'), findsOneWidget);
      for (var i = 0; i < 5; i++) {
        await answer(tester, right: true);
      }
      expect(progress.statusOf(pack, pack.lessons[1]), LessonStatus.available);
      expect(progress.recordOf(pack.lessons.first.id)!.bestScore, 1.0);
      expect(progress.pendingAttempts, hasLength(2));
    },
  );

  testWidgets('uses the admin pass mark from the server when known (FR-402)', (
    tester,
  ) async {
    progress.setRules(const LearningRules(passMark: 0.6));
    final pack = quizPack();
    await pumpQuiz(tester, pack);
    for (var i = 0; i < 5; i++) {
      await answer(tester, right: i < 3);
    }
    expect(find.text('పాస్ అయ్యారు! తదుపరి పాఠం తెరుచుకుంది.'), findsOneWidget);
  });

  testWidgets('asks only the configured number of questions (FR-403)', (
    tester,
  ) async {
    await pumpQuiz(tester, quizPack(questionsPerQuiz: 3));
    expect(find.text('3లో 1వ ప్రశ్న'), findsOneWidget);
  });
}
