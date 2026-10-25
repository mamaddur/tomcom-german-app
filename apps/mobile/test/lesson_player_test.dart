import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/l10n/app_localizations.dart';
import 'package:tomcom_german/src/content/pack_models.dart';
import 'package:tomcom_german/src/content/pack_store.dart';
import 'package:tomcom_german/src/player/lesson_player_screen.dart';

import 'fake_audio.dart';
import 'pack_fixtures.dart';

/// FR-301–FR-304: a lesson plays offline, screen by screen, with audio at normal and slow speed.
void main() {
  late Directory root;
  late PackStore store;
  late FakeAudio audio;

  setUp(() {
    root = Directory.systemTemp.createTempSync('player-');
    store = PackStore(() async => root);
    audio = FakeAudio();
  });
  tearDown(() => root.deleteSync(recursive: true));

  Future<LessonPack> installRichPack(WidgetTester tester) async {
    final p = buildPackZip(rich: true);
    final zip = File('${root.path}/p.zip')..writeAsBytesSync(p.zip);
    return (await tester.runAsync(
      () => store.install('A1', 1, zip, p.sha256),
    ))!;
  }

  Future<bool Function()> pumpPlayer(
    WidgetTester tester,
    LessonPack pack, {
    Future<File?> Function(String)? mediaFile,
  }) async {
    var finished = false;
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
        home: LessonPlayerScreen(
          pack: pack,
          lesson: pack.lessons.single,
          mediaFile: mediaFile ?? (id) => store.mediaFile('A1', id),
          audio: audio,
          onFinished: () => finished = true,
        ),
      ),
    );
    await tester.pumpAndSettle();
    return () => finished;
  }

  Future<void> next(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('next')));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'plays German at normal speed, then slow (0.75×) after the switch',
    (tester) async {
      final pack = await installRichPack(tester);
      await pumpPlayer(tester, pack);

      expect(
        find.text('రోజు సమయాన్ని బట్టి పలకరింపు మారుతుంది.'),
        findsOneWidget,
      );
      await tester.tap(find.byTooltip('వినండి: Guten Morgen!'));
      await tester.pumpAndSettle();
      expect(audio.played.single.speed, 1.0);
      expect(audio.played.single.path, endsWith('.opus'));

      await tester.tap(find.byKey(const Key('slow')));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('వినండి: Guten Morgen!'));
      await tester.pumpAndSettle();
      expect(audio.played.last.speed, 0.75);
    },
  );

  testWidgets('shows the English explanation too when asked (FR-303)', (
    tester,
  ) async {
    final pack = await installRichPack(tester);
    await pumpPlayer(tester, pack);
    expect(find.text('The greeting depends on the time of day.'), findsNothing);
    await tester.tap(find.text('English కూడా చూపించు'));
    await tester.pumpAndSettle();
    expect(
      find.text('The greeting depends on the time of day.'),
      findsOneWidget,
    );
  });

  testWidgets(
    'walks through vocabulary, dialogue and practice to the end of the lesson',
    (tester) async {
      final pack = await installRichPack(tester);
      final finished = await pumpPlayer(tester, pack);
      expect(find.text('5లో 1'), findsOneWidget);

      await next(tester);
      expect(find.text('der Hammer'), findsOneWidget);
      expect(find.text('Pl. Hämmer'), findsOneWidget);
      expect(find.text('సుత్తి'), findsOneWidget);

      await next(tester);
      expect(find.text('Anna'), findsOneWidget);
      expect(find.text('మీరు ఎలా ఉన్నారు?'), findsOneWidget);

      await next(tester);
      expect(find.text('ఉదయం పలకరించండి'), findsOneWidget);

      await next(tester);
      expect(find.text('పాఠం పూర్తయింది. చాలా బాగుంది!'), findsOneWidget);
      expect(finished(), isTrue);
      expect(
        audio.stops,
        greaterThan(0),
        reason: 'audio stops when moving between screens',
      );
    },
  );

  testWidgets(
    'tells the learner when a recording is missing instead of failing silently',
    (tester) async {
      final pack = await installRichPack(tester);
      await pumpPlayer(tester, pack, mediaFile: (_) async => null);
      await tester.tap(find.byTooltip('వినండి: Guten Morgen!'));
      await tester.pumpAndSettle();
      expect(find.text('ఈ రికార్డింగ్ అందుబాటులో లేదు.'), findsOneWidget);
      expect(audio.played, isEmpty);
    },
  );
}
