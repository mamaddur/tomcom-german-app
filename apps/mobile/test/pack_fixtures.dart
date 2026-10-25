import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';

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
