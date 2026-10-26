import '../content/pack_models.dart';

/// A piece of a tutor reply: plain text, or a German phrase to tap and hear (FR-603).
typedef ReplyPart = ({String text, bool german});

/// Splits a reply on its `<de>…</de>` marks. Unclosed marks stay plain text.
List<ReplyPart> splitReply(String reply) {
  final parts = <ReplyPart>[];
  var rest = reply;
  final open = RegExp(r'<de>([\s\S]*?)</de>');
  while (true) {
    final m = open.firstMatch(rest);
    if (m == null) break;
    if (m.start > 0) {
      parts.add((text: rest.substring(0, m.start), german: false));
    }
    parts.add((text: m.group(1)!.trim(), german: true));
    rest = rest.substring(m.end);
  }
  if (rest.isNotEmpty) parts.add((text: rest, german: false));
  return parts;
}

String _normal(String s) => s
    .toLowerCase()
    .replaceAll(RegExp(r'[!?.,;:"“”]'), '')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

/// Finds the lesson recording of a German phrase in the downloaded packs. The tutor has no
/// speech of its own until a speech vendor is connected, so only phrases that appear in a
/// lesson (explanations, dialogues, practice, vocabulary) can be played.
({String level, String audioId})? findRecording(
  Map<String, LessonPack> packs,
  String phrase,
) {
  final wanted = _normal(phrase);
  for (final entry in packs.entries) {
    ({String level, String audioId})? hit(German g) => _normal(g.text) == wanted
        ? (level: entry.key, audioId: g.audioId)
        : null;
    for (final lesson in entry.value.lessons) {
      for (final screen in lesson.screens) {
        final found = switch (screen) {
          ExplainScreen() => screen.examples.map(hit).nonNulls.firstOrNull,
          DialogueScreen() =>
            screen.lines.map((l) => hit(l.german)).nonNulls.firstOrNull,
          PracticeScreen() => hit(screen.target),
          _ => null,
        };
        if (found != null) return found;
      }
    }
    for (final v in entry.value.vocab.values) {
      final found = hit(v.german);
      if (found != null) return found;
    }
  }
  return null;
}
