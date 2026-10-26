import 'dart:math';

import '../content/pack_models.dart';

/// FR-403: a random draw from the lesson's question bank, so a retake differs.
List<QuizQuestion> drawQuestions(
  List<QuizQuestion> bank,
  int count,
  Random random,
) => ([...bank]..shuffle(random)).take(count).toList();

/// Answer keys are indices (content-schema): an option index for mcq, listen_choose and fill_gap;
/// for match_pairs, `answer[i]` is the index in `right` matching `left[i]`; for word_order, the
/// indices of `words` in the right order.
bool isCorrect(QuizQuestion q, Object? response) => switch (q.type) {
  'mcq' || 'listen_choose' || 'fill_gap' => response == q.answer,
  'match_pairs' || 'word_order' =>
    response is List<int> &&
        q.answer is List &&
        _sameList(response, (q.answer as List).cast<int>()),
  _ => false,
};

bool _sameList(List<int> a, List<int> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

/// The correct answer as text, for feedback and the wrong-answer review.
String correctAnswerText(QuizQuestion q) {
  final p = q.payload;
  return switch (q.type) {
    'mcq' ||
    'listen_choose' => (p['options'] as List)[q.answer as int] as String,
    'fill_gap' => (p['text'] as String).replaceFirst(
      '___',
      (p['options'] as List)[q.answer as int] as String,
    ),
    'match_pairs' => [
      for (final (i, r) in (q.answer as List).cast<int>().indexed)
        '${(p['left'] as List)[i]} = ${(p['right'] as List)[r]}',
    ].join('\n'),
    'word_order' => [
      for (final i in (q.answer as List).cast<int>()) (p['words'] as List)[i],
    ].join(' '),
    _ => '',
  };
}

/// One answered question in an attempt.
class QuizAnswer {
  const QuizAnswer(this.question, this.response, this.correct);
  final QuizQuestion question;
  final Object? response;
  final bool correct;
}

/// Share of correct answers, 0–1.
double scoreOf(List<QuizAnswer> answers) => answers.isEmpty
    ? 0
    : answers.where((a) => a.correct).length / answers.length;
