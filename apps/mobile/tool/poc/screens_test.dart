// Renders the learner app's real screens to PNG files for the client proof of concept.
// Synthetic content only. Run: POC_FONTS=<dir> POC_OUT=<dir> flutter test tool/poc/screens_test.dart
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/src/api/api_client.dart';
import 'package:tomcom_german/src/app.dart';
import 'package:tomcom_german/src/content/content_controller.dart';
import 'package:tomcom_german/src/content/pack_models.dart';
import 'package:tomcom_german/src/content/pack_store.dart';
import 'package:tomcom_german/src/onboarding/onboarding_controller.dart';
import 'package:tomcom_german/src/progress/progress_controller.dart';
import 'package:tomcom_german/src/session/session_store.dart';

import '../../test/fake_api.dart';
import '../../test/fake_audio.dart';

final out = Platform.environment['POC_OUT']!;
final fonts = Platform.environment['POC_FONTS']!;
final boundary = GlobalKey();

Future<void> loadFonts() async {
  ByteData bytes(String path) =>
      ByteData.sublistView(Uint8List.fromList(File(path).readAsBytesSync()));
  final roboto = FontLoader('Roboto')
    ..addFont(Future.value(bytes('$fonts/anek-400.ttf')))
    ..addFont(Future.value(bytes('$fonts/anek-700.ttf')));
  await roboto.load();
  final icons = FontLoader('MaterialIcons')
    ..addFont(
      Future.value(
        bytes(
          '/opt/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
        ),
      ),
    );
  await icons.load();
}

/// German text with an audio id; every German text has a recording (FR-302). Files are not needed here.
final audioIds = <String>[];
Map<String, dynamic> g(String text) {
  final id = 'aud-${audioIds.length + 1}';
  audioIds.add(id);
  return {'text': text, 'audio': id};
}

Map<String, dynamic> lesson(
  int n,
  String te,
  String en,
  String teDesc,
  String enDesc, {
  List<Object> screens = const [],
  List<Object> questions = const [],
}) => {
  'id': 'a1-lesson-$n',
  'order': n,
  'title': {'te': te, 'en': en},
  'description': {'te': teDesc, 'en': enDesc},
  'estMinutes': 10 + n * 2,
  'screens': screens.isEmpty
      ? [
          {
            'id': 'a1-$n-s1',
            'order': 1,
            'type': 'explain',
            'body': {'te': teDesc, 'en': enDesc},
            'examples': <Object>[],
          },
        ]
      : screens,
  'questions': questions,
};

Map<String, dynamic> q(
  String id,
  String type,
  String te,
  String en,
  Map<String, dynamic> payload,
  Object answer,
  String teWhy,
  String enWhy,
) => {
  'id': id,
  'type': type,
  'prompt': {'te': te, 'en': en},
  'payload': payload,
  'answer': answer,
  'explanation': {'te': teWhy, 'en': enWhy},
  'difficulty': 1,
};

LessonPack demoPack() => LessonPack.fromJson({
  'level': 'A1',
  'version': 1,
  'settings': {'passMark': 0.8, 'questionsPerQuiz': 4},
  'lessons': [
    lesson(
      1,
      'పలకరింపులు',
      'Greetings',
      'పలకరించడం నేర్చుకోండి',
      'Learn to greet people',
      screens: [
        {
          'id': 'a1-1-s1',
          'order': 1,
          'type': 'explain',
          'body': {
            'te': 'రోజు సమయాన్ని బట్టి పలకరింపు మారుతుంది. ఉదయం "Guten Morgen" అంటారు.',
            'en': 'The greeting depends on the time of day. In the morning say "Guten Morgen".',
          },
          'examples': [g('Guten Morgen!'), g('Guten Abend!')],
        },
        {
          'id': 'a1-1-s2',
          'order': 2,
          'type': 'dialogue',
          'lines': [
            {
              'speaker': 'Anna',
              'german': g('Guten Morgen! Wie geht es Ihnen?'),
              'meaning': {
                'te': 'శుభోదయం! మీరు ఎలా ఉన్నారు?',
                'en': 'Good morning! How are you?',
              },
            },
            {
              'speaker': 'Ravi',
              'german': g('Danke, gut. Und Ihnen?'),
              'meaning': {
                'te': 'ధన్యవాదాలు, బాగున్నాను. మీరు?',
                'en': 'Thanks, fine. And you?',
              },
            },
          ],
        },
        {
          'id': 'a1-1-s3',
          'order': 3,
          'type': 'practice',
          'prompt': {
            'te': 'ఉదయం ఎవరినైనా పలకరించండి',
            'en': 'Greet someone in the morning',
          },
          'target': g('Guten Morgen!'),
        },
      ],
      questions: [
        q(
          'q1',
          'mcq',
          '"Good morning" అంటే జర్మన్‌లో ఏమిటి?',
          'How do you say "Good morning" in German?',
          {
            'options': ['Guten Morgen', 'Gute Nacht', 'Danke'],
          },
          0,
          '"Guten Morgen" అంటే శుభోదయం.',
          '"Guten Morgen" means good morning.',
        ),
        q(
          'q2',
          'fill_gap',
          'ఖాళీని పూరించండి',
          'Fill the gap',
          {
            'text': 'Ich ___ Ravi.',
            'options': ['heiße', 'bist'],
          },
          0,
          '"Ich heiße" అంటే నా పేరు.',
          '"Ich heiße" means my name is.',
        ),
        q(
          'q3',
          'match_pairs',
          'జతచేయండి',
          'Match the pairs',
          {
            'left': ['Hallo', 'Danke'],
            'right': ['ధన్యవాదాలు', 'నమస్కారం'],
          },
          [1, 0],
          'Hallo = నమస్కారం, Danke = ధన్యవాదాలు.',
          'Hallo = hello, Danke = thanks.',
        ),
        q(
          'q4',
          'word_order',
          'వాక్యాన్ని సరిగా అమర్చండి',
          'Put the sentence in order',
          {
            'words': ['Ich', 'heiße', 'Ravi'],
          },
          [0, 1, 2],
          'నా పేరు రవి.',
          'My name is Ravi.',
        ),
      ],
    ),
    lesson(
      2,
      'మిమ్మల్ని పరిచయం చేసుకోండి',
      'Introducing yourself',
      'మీ పేరు, ఊరు, పని చెప్పండి',
      'Say your name, where you are from and your job',
    ),
    lesson(
      3,
      'సంఖ్యలు 1 నుండి 10',
      'Numbers 1 to 10',
      'ఒకటి నుండి పది వరకు',
      'From one to ten',
    ),
    lesson(
      4,
      'రోజులు, సమయం',
      'Days and time',
      'వారం రోజులు, సమయం అడగడం',
      'Days of the week and asking the time',
    ),
    lesson(
      5,
      'పని ప్రదేశంలో',
      'At the workplace',
      'పనిముట్లు, der / die / das',
      'Tools and der / die / das',
    ),
    lesson(
      6,
      'భద్రత, సూచనలు',
      'Safety and instructions',
      'హెచ్చరికలు, పని సూచనలు',
      'Warnings and work instructions',
    ),
  ],
  'vocab': [
    {
      'id': 'v1',
      'german': g('Hammer'),
      'article': 'der',
      'plural': 'Hämmer',
      'meaning': {'te': 'సుత్తి', 'en': 'hammer'},
      'tradeTags': ['electrician', 'welder'],
    },
    {
      'id': 'v2',
      'german': g('Kabel'),
      'article': 'das',
      'plural': 'Kabel',
      'meaning': {'te': 'తీగ', 'en': 'cable'},
      'tradeTags': ['electrician'],
    },
    {
      'id': 'v3',
      'german': g('Schalter'),
      'article': 'der',
      'plural': 'Schalter',
      'meaning': {'te': 'స్విచ్', 'en': 'switch'},
      'tradeTags': ['electrician'],
    },
  ],
  'media': [
    for (final id in audioIds)
      {
        'id': id,
        'type': 'audio',
        'path': 'audio/$id.opus',
        'bytes': 1,
        'sha256': '0' * 64,
      },
  ],
});

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    WidgetsApp.debugAllowBannerOverride =
        false; // no red DEBUG ribbon in the client images
    Directory(out).createSync(recursive: true);
    await loadFonts();
  });

  Future<void> shoot(WidgetTester tester, String name) async {
    await tester.pump(const Duration(milliseconds: 400));
    await tester.runAsync(() async {
      final b =
          boundary.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await b.toImage(pixelRatio: 2);
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      File('$out/$name.png').writeAsBytesSync(data!.buffer.asUint8List());
    });
  }

  Future<void> pumpApp(
    WidgetTester tester,
    FakeApi fake,
    ProgressController progress,
    Directory root, {
    LessonPack? pack,
  }) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final store = MemorySessionStore();
    if (fake.registered) {
      await store.write(SessionStore.accessTokenKey, 'access-1');
      await store.write(
        SessionStore.refreshTokenKey,
        'refresh-token-1-xxxxxxxxxxxx',
      );
    }
    final api = ApiClient(
      baseUrl: 'http://api.test',
      store: store,
      httpClient: fake.client,
    );
    final content = ContentController(
      api: api,
      store: PackStore(() async => root),
      tempDir: () async => root,
      audio: FakeAudio(),
    );
    if (pack != null) content.installed['A1'] = pack;
    await tester.pumpWidget(
      RepaintBoundary(
        key: boundary,
        child: TomcomApp(
          controller: OnboardingController(api: api, store: store),
          content: content,
          progress: progress,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('sign-up screens', (tester) async {
    final root = Directory.systemTemp.createTempSync('poc-a-');
    addTearDown(() => root.deleteSync(recursive: true));
    final fake = FakeApi();
    await pumpApp(tester, fake, ProgressController(dir: root), root);
    await shoot(tester, '01-welcome');
    await tester.tap(find.text('ప్రారంభించండి / Start'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('phone')), '5500000101');
    await tester.pump();
    await shoot(tester, '02-phone');
    await tester.tap(find.text('కోడ్ పంపండి / Send code'));
    await tester.pumpAndSettle();
    await shoot(tester, '03-otp');
    await tester.enterText(find.byKey(const Key('otp')), '123456');
    await tester.pumpAndSettle();
    await shoot(tester, '04-language');
  });

  testWidgets('learner screens', (tester) async {
    final root = Directory.systemTemp.createTempSync('poc-b-');
    addTearDown(() => root.deleteSync(recursive: true));
    final fake = FakeApi()
      ..registered = true
      ..profileDone = true
      ..batch = 'Synthetic batch 1'
      ..announcements = [
        {
          'id': 'a1',
          'title': {'te': 'ఈ ఆదివారం తరగతి ఉంది', 'en': 'Class this Sunday'},
          'body': {
            'te': 'ఉదయం 10 గంటలకు, కొత్త పాఠం',
            'en': '10 am, new lesson',
          },
          'startsAt': '2026-10-25T00:00:00Z',
          'endsAt': null,
        },
      ];
    final pack = demoPack();
    final progress = ProgressController(dir: root)
      ..open('u1')
      ..recordQuiz(pack, pack.lessons[0], 1.0, passMark: 0.8)
      ..recordQuiz(pack, pack.lessons[1], 0.9, passMark: 0.8)
      ..recordQuiz(pack, pack.lessons[2], 1.0, passMark: 0.8)
      ..addLearningTime(const Duration(minutes: 6));
    await pumpApp(tester, fake, progress, root, pack: pack);
    await shoot(tester, '05-home');

    await tester.tap(find.byKey(const Key('level-A1')));
    await tester.pumpAndSettle();
    await shoot(tester, '06-lessons');

    await tester.tap(find.byKey(const Key('lesson-a1-lesson-1')));
    await tester.pumpAndSettle();
    await shoot(tester, '07-lesson-explain');
    await tester.tap(find.byKey(const Key('next')));
    await tester.pumpAndSettle();
    await shoot(tester, '08-lesson-dialogue');
    await tester.tap(find.byKey(const Key('next')));
    await tester.pumpAndSettle();
    await shoot(tester, '09-lesson-practice');
    await tester.tap(find.byKey(const Key('next')));
    await tester.pumpAndSettle();
    await shoot(tester, '10-quiz-intro');
    await tester.tap(find.byKey(const Key('start-quiz')));
    await tester.pumpAndSettle();
    await shoot(tester, '11-quiz-question');
  });

  testWidgets('profile and word list', (tester) async {
    final root = Directory.systemTemp.createTempSync('poc-c-');
    addTearDown(() => root.deleteSync(recursive: true));
    final fake = FakeApi()
      ..registered = true
      ..profileDone = true
      ..batch = 'Synthetic batch 1';
    final pack = demoPack();
    final progress = ProgressController(dir: root)
      ..open('u1')
      ..recordQuiz(pack, pack.lessons[0], 1.0, passMark: 0.8)
      ..recordQuiz(pack, pack.lessons[1], 0.9, passMark: 0.8)
      ..recordQuiz(pack, pack.lessons[2], 1.0, passMark: 0.8)
      ..addLearningTime(const Duration(minutes: 12))
      ..toggleWord('v1');
    await pumpApp(tester, fake, progress, root, pack: pack);
    if (find.byKey(const Key('words')).evaluate().isNotEmpty) {
      await tester.ensureVisible(find.byKey(const Key('words')));
      await tester.tap(find.byKey(const Key('words')));
      await tester.pumpAndSettle();
      await shoot(tester, '12-words');
      Navigator.of(tester.element(find.byType(Scaffold).last)).pop();
      await tester.pumpAndSettle();
    }
    await tester.tap(find.byKey(const Key('my-profile')));
    await tester.pumpAndSettle();
    await shoot(tester, '13-profile');
  });

  testWidgets('tutor chat', (tester) async {
    final root = Directory.systemTemp.createTempSync('poc-d-');
    addTearDown(() => root.deleteSync(recursive: true));
    final fake = FakeApi()
      ..registered = true
      ..profileDone = true
      ..batch = 'Synthetic batch 1'
      ..tutorRemaining = 27
      ..tutorAnswer = 'అద్భుతం! "ధన్యవాదాలు" అంటే <de>Danke</de>. దానికి సమాధానం: <de>Bitte</de>.'
      ..tutorHistory = [
        {
          'id': 'm1',
          'role': 'user',
          'content': 'ఎవరినైనా ఎలా పలకరించాలి?',
          'germanPhrases': <String>[],
          'flagged': false,
          'createdAt': '2026-10-26T04:00:00Z',
        },
        {
          'id': 'm2',
          'role': 'assistant',
          'content': 'బాగుంది! ముందుగా ఉదయం పలకరింపు నేర్చుకుందాం: <de>Guten Morgen!</de> అంటే "శుభోదయం". మీరూ చెప్పి చూడండి.',
          'germanPhrases': ['Guten Morgen!'],
          'flagged': false,
          'createdAt': '2026-10-26T04:00:02Z',
        },
      ];
    final pack = demoPack();
    final progress = ProgressController(dir: root)
      ..open('u1')
      ..recordQuiz(pack, pack.lessons[0], 1.0, passMark: 0.8)
      ..recordQuiz(pack, pack.lessons[1], 0.9, passMark: 0.8)
      ..addLearningTime(const Duration(minutes: 8));
    await pumpApp(tester, fake, progress, root, pack: pack);
    await tester.scrollUntilVisible(
      find.byKey(const Key('tutor')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const Key('tutor')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('tutor-input')),
      'ధన్యవాదాలు ఎలా చెప్పాలి?',
    );
    await tester.tap(find.byKey(const Key('tutor-send')));
    await tester.pumpAndSettle();
    await shoot(tester, '14-tutor');
  });
}
