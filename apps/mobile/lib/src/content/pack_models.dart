/// The lesson pack as the app reads it offline. Shapes follow packages/content-schema.
library;

/// Text keyed by locale (ADR-007). Falls back to English, then any language.
class L10n {
  const L10n(this.values);
  factory L10n.fromJson(Object? json) =>
      L10n(Map<String, String>.from((json as Map?) ?? const {}));
  final Map<String, String> values;
  String of(String locale) =>
      values[locale] ??
      values['en'] ??
      (values.isEmpty ? '' : values.values.first);
}

/// German text with its native-speaker recording (FR-302).
class German {
  const German({required this.text, required this.audioId});
  factory German.fromJson(Map<String, dynamic> j) =>
      German(text: j['text'] as String, audioId: j['audio'] as String);
  final String text;
  final String audioId;
}

sealed class LessonScreen {
  const LessonScreen(this.id, this.order);
  final String id;
  final int order;

  factory LessonScreen.fromJson(Map<String, dynamic> j) {
    final id = j['id'] as String;
    final order = j['order'] as int;
    switch (j['type']) {
      case 'explain':
        return ExplainScreen(
          id,
          order,
          body: L10n.fromJson(j['body']),
          examples: [
            for (final e in (j['examples'] as List?) ?? const [])
              German.fromJson(e as Map<String, dynamic>),
          ],
        );
      case 'vocab':
        return VocabScreen(
          id,
          order,
          vocabIds: List<String>.from(j['vocabIds'] as List),
        );
      case 'dialogue':
        return DialogueScreen(
          id,
          order,
          lines: [
            for (final l in j['lines'] as List)
              DialogueLine(
                speaker: (l as Map<String, dynamic>)['speaker'] as String,
                german: German.fromJson(l['german'] as Map<String, dynamic>),
                meaning: L10n.fromJson(l['meaning']),
              ),
          ],
        );
      case 'practice':
        return PracticeScreen(
          id,
          order,
          prompt: L10n.fromJson(j['prompt']),
          target: German.fromJson(j['target'] as Map<String, dynamic>),
        );
    }
    throw FormatException('unknown screen type ${j['type']}');
  }
}

class ExplainScreen extends LessonScreen {
  const ExplainScreen(
    super.id,
    super.order, {
    required this.body,
    required this.examples,
  });
  final L10n body;
  final List<German> examples;
}

class VocabScreen extends LessonScreen {
  const VocabScreen(super.id, super.order, {required this.vocabIds});
  final List<String> vocabIds;
}

class DialogueLine {
  const DialogueLine({
    required this.speaker,
    required this.german,
    required this.meaning,
  });
  final String speaker;
  final German german;
  final L10n meaning;
}

class DialogueScreen extends LessonScreen {
  const DialogueScreen(super.id, super.order, {required this.lines});
  final List<DialogueLine> lines;
}

class PracticeScreen extends LessonScreen {
  const PracticeScreen(
    super.id,
    super.order, {
    required this.prompt,
    required this.target,
  });
  final L10n prompt;
  final German target;
}

class QuizQuestion {
  const QuizQuestion({
    required this.id,
    required this.type,
    required this.prompt,
    required this.payload,
    required this.answer,
    required this.explanation,
    required this.difficulty,
  });
  factory QuizQuestion.fromJson(Map<String, dynamic> j) => QuizQuestion(
    id: j['id'] as String,
    type: j['type'] as String,
    prompt: L10n.fromJson(j['prompt']),
    payload: Map<String, dynamic>.from(j['payload'] as Map),
    answer: j['answer'],
    explanation: L10n.fromJson(j['explanation']),
    difficulty: j['difficulty'] as int,
  );
  final String id;
  final String type;
  final L10n prompt;
  final Map<String, dynamic> payload;
  final Object? answer;
  final L10n explanation;
  final int difficulty;
}

class PackLesson {
  const PackLesson({
    required this.id,
    required this.order,
    required this.title,
    required this.description,
    required this.estMinutes,
    required this.tradeTags,
    required this.screens,
    required this.questions,
  });
  factory PackLesson.fromJson(Map<String, dynamic> j) => PackLesson(
    id: j['id'] as String,
    order: j['order'] as int,
    title: L10n.fromJson(j['title']),
    description: L10n.fromJson(j['description']),
    estMinutes: j['estMinutes'] as int,
    tradeTags: List<String>.from((j['tradeTags'] as List?) ?? const []),
    screens: [
      for (final s in j['screens'] as List)
        LessonScreen.fromJson(s as Map<String, dynamic>),
    ]..sort((a, b) => a.order.compareTo(b.order)),
    questions: [
      for (final q in j['questions'] as List)
        QuizQuestion.fromJson(q as Map<String, dynamic>),
    ],
  );
  final String id;
  final int order;
  final L10n title;
  final L10n description;
  final int estMinutes;
  final List<String> tradeTags;
  final List<LessonScreen> screens;
  final List<QuizQuestion> questions;
}

class VocabEntry {
  const VocabEntry({
    required this.id,
    required this.german,
    this.article,
    this.plural,
    required this.meaning,
    this.imageId,
    required this.tradeTags,
  });
  factory VocabEntry.fromJson(Map<String, dynamic> j) => VocabEntry(
    id: j['id'] as String,
    german: German.fromJson(j['german'] as Map<String, dynamic>),
    article: j['article'] as String?,
    plural: j['plural'] as String?,
    meaning: L10n.fromJson(j['meaning']),
    imageId: j['image'] as String?,
    tradeTags: List<String>.from((j['tradeTags'] as List?) ?? const []),
  );
  final String id;
  final German german;
  final String? article;
  final String? plural;
  final L10n meaning;
  final String? imageId;
  final List<String> tradeTags;
}

class MediaRef {
  const MediaRef({
    required this.id,
    required this.type,
    required this.path,
    required this.bytes,
    required this.sha256,
  });
  factory MediaRef.fromJson(Map<String, dynamic> j) => MediaRef(
    id: j['id'] as String,
    type: j['type'] as String,
    path: j['path'] as String,
    bytes: j['bytes'] as int,
    sha256: j['sha256'] as String,
  );
  final String id;
  final String type;
  final String path;
  final int bytes;
  final String sha256;
}

class PackSettings {
  const PackSettings({required this.passMark, required this.questionsPerQuiz});
  final double passMark;
  final int questionsPerQuiz;
}

/// A whole installed level (manifest.json).
class LessonPack {
  const LessonPack({
    required this.level,
    required this.version,
    required this.settings,
    required this.lessons,
    required this.vocab,
    required this.media,
  });
  factory LessonPack.fromJson(Map<String, dynamic> j) {
    final s = j['settings'] as Map<String, dynamic>;
    return LessonPack(
      level: j['level'] as String,
      version: j['version'] as int,
      settings: PackSettings(
        passMark: (s['passMark'] as num).toDouble(),
        questionsPerQuiz: s['questionsPerQuiz'] as int,
      ),
      lessons: [
        for (final l in j['lessons'] as List)
          PackLesson.fromJson(l as Map<String, dynamic>),
      ]..sort((a, b) => a.order.compareTo(b.order)),
      vocab: {
        for (final v in j['vocab'] as List)
          (v as Map<String, dynamic>)['id'] as String: VocabEntry.fromJson(v),
      },
      media: {
        for (final m in j['media'] as List)
          (m as Map<String, dynamic>)['id'] as String: MediaRef.fromJson(m),
      },
    );
  }
  final String level;
  final int version;
  final PackSettings settings;
  final List<PackLesson> lessons;
  final Map<String, VocabEntry> vocab;
  final Map<String, MediaRef> media;
}

/// What the server offers (GET /v1/packs).
class PackInfo {
  const PackInfo({
    required this.level,
    required this.version,
    required this.bytes,
    required this.sha256,
    required this.lessonCount,
  });
  factory PackInfo.fromJson(Map<String, dynamic> j) => PackInfo(
    level: j['level'] as String,
    version: j['version'] as int,
    bytes: j['bytes'] as int,
    sha256: j['sha256'] as String,
    lessonCount: j['lessonCount'] as int,
  );
  final String level;
  final int version;
  final int bytes;
  final String sha256;
  final int lessonCount;
}
