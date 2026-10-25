import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/l10n/app_localizations.dart';
import 'package:tomcom_german/src/api/api_client.dart';
import 'package:tomcom_german/src/content/content_controller.dart';
import 'package:tomcom_german/src/content/pack_models.dart';
import 'package:tomcom_german/src/content/pack_store.dart';
import 'package:tomcom_german/src/progress/progress_controller.dart';
import 'package:tomcom_german/src/session/session_store.dart';
import 'package:tomcom_german/src/words/words_screen.dart';

import 'fake_api.dart';
import 'fake_audio.dart';

/// FR-306 words for the learner's trade, FR-308 word list and review. In Telugu.
void main() {
  late Directory root;
  late ContentController content;
  late ProgressController progress;

  Map<String, dynamic> vocab(
    String id,
    String german,
    String te,
    List<String> trades,
  ) => {
    'id': id,
    'german': {'text': german, 'audio': 'a-$id'},
    'article': 'der',
    'meaning': {'te': te, 'en': german},
    'tradeTags': trades,
  };

  setUp(() {
    root = Directory.systemTemp.createTempSync('words-');
    final api = ApiClient(
      baseUrl: 'http://api.test',
      store: MemorySessionStore(),
      httpClient: FakeApi().client,
    );
    content = ContentController(
      api: api,
      store: PackStore(() async => root),
      tempDir: () async => root,
      audio: FakeAudio(),
    );
    content.installed['A1'] = LessonPack.fromJson({
      'level': 'A1',
      'version': 1,
      'settings': {'passMark': 0.8, 'questionsPerQuiz': 10},
      'lessons': <Object>[],
      'vocab': [
        vocab('v1', 'Hammer', 'సుత్తి', ['electrician', 'welder']),
        vocab('v2', 'Kabel', 'తీగ', ['electrician']),
        vocab('v3', 'Pflaster', 'ప్లాస్టర్', ['nursing_aide']),
      ],
      'media': <Object>[],
    });
    progress = ProgressController(dir: root)..open('u1');
  });
  tearDown(() => root.deleteSync(recursive: true));

  Future<void> pump(WidgetTester tester) async {
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
        home: WordsScreen(
          content: content,
          progress: progress,
          tradeCode: 'electrician',
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets("shows the words for the learner's trade only (FR-306)", (
    tester,
  ) async {
    await pump(tester);
    expect(find.text('der Hammer'), findsOneWidget);
    expect(find.text('der Kabel'), findsOneWidget);
    expect(find.text('der Pflaster'), findsNothing);
  });

  testWidgets('star a word, then review it with flashcards (FR-308)', (
    tester,
  ) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('star-v1')));
    await tester.pumpAndSettle();
    expect(progress.isSaved('v1'), isTrue);

    await tester.tap(find.text('నా పదాల జాబితా'));
    await tester.pumpAndSettle();
    expect(find.text('1 పదాన్ని సమీక్షించండి'), findsOneWidget);
    await tester.tap(find.byKey(const Key('review')));
    await tester.pumpAndSettle();

    expect(find.text('der Hammer'), findsOneWidget);
    expect(find.text('సుత్తి'), findsNothing);
    await tester.tap(find.byKey(const Key('show-meaning')));
    await tester.pumpAndSettle();
    expect(find.text('సుత్తి'), findsOneWidget);
    await tester.tap(find.byKey(const Key('knew-it')));
    await tester.pumpAndSettle();
    expect(find.text('సమీక్ష పూర్తయింది. చాలా బాగుంది!'), findsOneWidget);
    expect(progress.dueWords, isEmpty);
  });

  testWidgets('a module switched off by the admin disappears (FR-1103)', (
    tester,
  ) async {
    progress.setFeatures({'module.bookmarks': false});
    await pump(tester);
    expect(find.text('నా పదాల జాబితా'), findsNothing);
    expect(find.byKey(const Key('star-v1')), findsNothing);
    expect(find.text('der Hammer'), findsOneWidget);
  });
}
