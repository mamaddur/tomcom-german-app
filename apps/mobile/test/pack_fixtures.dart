import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:tomcom_german/src/content/pack_models.dart';

/// Builds a pack zip like the API's pack builder does. Synthetic content.
({List<int> zip, String sha256}) buildPackZip({
  String level = 'A1',
  int version = 1,
  String title = 'Greetings',
  String mediaPath = 'audio/00000000-0000-4000-8000-000000000101.opus',
  List<int>? audioBytes,
  String? declaredAudioSha,
  bool rich = false,
}) {
  final audio = audioBytes ?? List<int>.generate(2000, (i) => i % 251);
  const audioId = '00000000-0000-4000-8000-000000000101';
  final manifest = {
    'schemaVersion': 1,
    'level': level,
    'version': version,
    'publishedAt': '2026-10-25T00:00:00Z',
    'settings': {'passMark': 0.8, 'questionsPerQuiz': 10},
    'lessons': [
      {
        'id': '00000000-0000-4000-8000-000000000001',
        'order': 1,
        'title': {'te': 'పలకరింపులు', 'en': title},
        'description': {'te': 'పలకరించడం నేర్చుకోండి', 'en': 'Learn greetings'},
        'estMinutes': 15,
        'screens': [
          {
            'id': '00000000-0000-4000-8000-000000000011',
            'order': 1,
            'type': 'explain',
            'body': {'te': 'వివరణ', 'en': 'Explanation'},
            'examples': [
              {'text': 'Guten Morgen!', 'audio': audioId},
            ],
          },
        ],
        if (rich) ...{
          'screens': [
            {
              'id': '00000000-0000-4000-8000-000000000011',
              'order': 1,
              'type': 'explain',
              'body': {
                'te': 'రోజు సమయాన్ని బట్టి పలకరింపు మారుతుంది.',
                'en': 'The greeting depends on the time of day.',
              },
              'examples': [
                {'text': 'Guten Morgen!', 'audio': audioId},
              ],
            },
            {
              'id': '00000000-0000-4000-8000-000000000012',
              'order': 2,
              'type': 'vocab',
              'vocabIds': ['00000000-0000-4000-8000-000000000201'],
            },
            {
              'id': '00000000-0000-4000-8000-000000000013',
              'order': 3,
              'type': 'dialogue',
              'lines': [
                {
                  'speaker': 'Anna',
                  'german': {'text': 'Wie geht es Ihnen?', 'audio': audioId},
                  'meaning': {'te': 'మీరు ఎలా ఉన్నారు?', 'en': 'How are you?'},
                },
              ],
            },
            {
              'id': '00000000-0000-4000-8000-000000000014',
              'order': 4,
              'type': 'practice',
              'prompt': {
                'te': 'ఉదయం పలకరించండి',
                'en': 'Greet someone in the morning',
              },
              'target': {'text': 'Guten Morgen!', 'audio': audioId},
            },
          ],
        },
        'questions': [
          {
            'id': '00000000-0000-4000-8000-000000000301',
            'type': 'mcq',
            'prompt': {'te': 'ప్రశ్న', 'en': 'Question'},
            'payload': {
              'options': ['A', 'B'],
            },
            'answer': 0,
            'explanation': {'te': 'వివరణ', 'en': 'Because'},
            'difficulty': 1,
          },
        ],
      },
    ],
    'vocab': rich
        ? [
            {
              'id': '00000000-0000-4000-8000-000000000201',
              'german': {'text': 'Hammer', 'audio': audioId},
              'article': 'der',
              'plural': 'Hämmer',
              'meaning': {'te': 'సుత్తి', 'en': 'hammer'},
              'tradeTags': ['construction'],
            },
          ]
        : <Object>[],
    'media': [
      {
        'id': audioId,
        'type': 'audio',
        'path': mediaPath,
        'bytes': audio.length,
        'sha256': declaredAudioSha ?? sha256.convert(audio).toString(),
      },
    ],
  };
  final archive = Archive()
    ..addFile(
      ArchiveFile.bytes('manifest.json', utf8.encode(jsonEncode(manifest))),
    )
    ..addFile(ArchiveFile.bytes(mediaPath, audio));
  final zip = ZipEncoder().encodeBytes(archive);
  return (zip: zip, sha256: sha256.convert(zip).toString());
}

/// An in-memory pack with [lessons] one-screen lessons, for progress tests (no zip, no files).
LessonPack memoryPack({String level = 'A1', int lessons = 3}) =>
    LessonPack.fromJson({
      'level': level,
      'version': 1,
      'settings': {'passMark': 0.8, 'questionsPerQuiz': 10},
      'lessons': [
        for (var i = 1; i <= lessons; i++)
          {
            'id': '$level-lesson-$i',
            'order': i,
            'title': {'te': 'పాఠం $i', 'en': 'Lesson $i'},
            'description': {'te': '', 'en': ''},
            'estMinutes': 10,
            'screens': [
              {
                'id': '$level-screen-$i',
                'order': 1,
                'type': 'explain',
                'body': {'te': 'వివరణ $i', 'en': 'Explanation $i'},
                'examples': <Object>[],
              },
            ],
            'questions': <Object>[],
          },
      ],
      'vocab': <Object>[],
      'media': <Object>[],
    });

/// One question of each lesson-quiz type (FR-401), in content-schema shape.
List<Map<String, dynamic>> allQuestionTypes() {
  Map<String, dynamic> q(
    String id,
    String type,
    Map<String, dynamic> payload,
    Object answer,
  ) => {
    'id': id,
    'type': type,
    'prompt': {'te': 'ప్రశ్న $id', 'en': 'Question $id'},
    'payload': payload,
    'answer': answer,
    'explanation': {'te': 'వివరణ $id', 'en': 'Explanation $id'},
    'difficulty': 1,
  };
  return [
    q('q-mcq', 'mcq', {
      'options': ['Hallo', 'Tschüss', 'Danke'],
    }, 0),
    q('q-listen', 'listen_choose', {
      'audio': 'audio-1',
      'options': ['Guten Morgen', 'Gute Nacht'],
    }, 0),
    q('q-gap', 'fill_gap', {
      'text': 'Ich ___ Ravi.',
      'options': ['heiße', 'bist'],
    }, 0),
    q(
      'q-pairs',
      'match_pairs',
      {
        'left': ['Hallo', 'Danke'],
        'right': ['Thanks', 'Hello'],
      },
      [1, 0],
    ),
    q(
      'q-order',
      'word_order',
      {
        'words': ['Ich', 'heiße', 'Ravi'],
      },
      [0, 1, 2],
    ),
  ];
}

/// A level whose first lesson has [questions] (default: one of each type).
LessonPack quizPack({
  List<Map<String, dynamic>>? questions,
  int questionsPerQuiz = 10,
  double passMark = 0.8,
}) {
  final base = memoryPack(lessons: 2);
  return LessonPack(
    level: base.level,
    version: base.version,
    settings: PackSettings(
      passMark: passMark,
      questionsPerQuiz: questionsPerQuiz,
    ),
    lessons: [
      PackLesson(
        id: base.lessons[0].id,
        order: 1,
        title: base.lessons[0].title,
        description: base.lessons[0].description,
        estMinutes: 10,
        tradeTags: const [],
        screens: base.lessons[0].screens,
        questions: [
          for (final j in questions ?? allQuestionTypes())
            QuizQuestion.fromJson(j),
        ],
      ),
      base.lessons[1],
    ],
    vocab: const {},
    media: const {},
  );
}
