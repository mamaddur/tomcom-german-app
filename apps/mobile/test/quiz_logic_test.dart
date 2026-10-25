import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/src/content/pack_models.dart';
import 'package:tomcom_german/src/quiz/quiz_logic.dart';

import 'pack_fixtures.dart';

void main() {
  final questions = {
    for (final j in allQuestionTypes())
      j['id'] as String: QuizQuestion.fromJson(j),
  };
  QuizQuestion q(String id) => questions[id]!;

  test('checks each question type against its answer key (FR-401)', () {
    expect(isCorrect(q('q-mcq'), 0), isTrue);
    expect(isCorrect(q('q-mcq'), 1), isFalse);
    expect(isCorrect(q('q-listen'), 0), isTrue);
    expect(isCorrect(q('q-gap'), 1), isFalse);
    expect(isCorrect(q('q-pairs'), [1, 0]), isTrue);
    expect(isCorrect(q('q-pairs'), [0, 1]), isFalse);
    expect(isCorrect(q('q-order'), [0, 1, 2]), isTrue);
    expect(isCorrect(q('q-order'), [1, 0, 2]), isFalse);
    expect(isCorrect(q('q-order'), null), isFalse);
  });

  test('shows the right answer as text for feedback and review', () {
    expect(correctAnswerText(q('q-mcq')), 'Hallo');
    expect(correctAnswerText(q('q-gap')), 'Ich heiße Ravi.');
    expect(correctAnswerText(q('q-pairs')), 'Hallo = Hello\nDanke = Thanks');
    expect(correctAnswerText(q('q-order')), 'Ich heiße Ravi');
  });

  test('draws at most the configured number, and retakes differ (FR-403)', () {
    final bank = [
      for (var i = 0; i < 20; i++)
        QuizQuestion.fromJson({...allQuestionTypes().first, 'id': 'q$i'}),
    ];
    final random = Random(7);
    final first = drawQuestions(bank, 10, random);
    final second = drawQuestions(bank, 10, random);
    expect(first, hasLength(10));
    expect(first.map((q) => q.id).toSet(), hasLength(10));
    expect(
      first.map((q) => q.id),
      isNot(orderedEquals(second.map((q) => q.id))),
    );
    expect(drawQuestions(bank.take(3).toList(), 10, random), hasLength(3));
  });

  test('scores the share of correct answers', () {
    final a = q('q-mcq');
    expect(scoreOf([QuizAnswer(a, 0, true), QuizAnswer(a, 1, false)]), 0.5);
    expect(scoreOf(const []), 0);
  });
}
