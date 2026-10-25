import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../l10n/app_localizations.dart';
import '../content/pack_models.dart';
import '../player/audio_service.dart';
import '../progress/progress_controller.dart';
import 'question_input.dart';
import 'quiz_logic.dart';

/// The end-of-lesson quiz (FR-401–FR-403). Works offline: questions and answer keys are in the
/// downloaded pack. A pass at or above the pass mark opens the next lesson.
class QuizScreen extends StatefulWidget {
  const QuizScreen({
    super.key,
    required this.pack,
    required this.lesson,
    required this.progress,
    required this.audio,
    required this.mediaFile,
    this.random,
  });

  final LessonPack pack;
  final PackLesson lesson;
  final ProgressController progress;
  final AudioService audio;
  final Future<File?> Function(String mediaId) mediaFile;

  /// Fixed in tests; otherwise a new draw each attempt.
  final Random? random;

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  late final Random _random = widget.random ?? Random();
  late List<QuizQuestion> _questions;
  final List<QuizAnswer> _answers = [];
  final _watch = Stopwatch();
  int _index = 0;
  Object? _response;
  bool _checked = false;
  bool? _passed;

  double get _passMark =>
      widget.progress.rules.passMark ?? widget.pack.settings.passMark;

  @override
  void initState() {
    super.initState();
    _start();
  }

  void _start() {
    _questions = drawQuestions(
      widget.lesson.questions,
      widget.pack.settings.questionsPerQuiz,
      _random,
    );
    _answers.clear();
    _index = 0;
    _response = null;
    _checked = false;
    _passed = null;
    _watch
      ..reset()
      ..start();
  }

  @override
  void dispose() {
    widget.audio.stop();
    super.dispose();
  }

  QuizQuestion get _q => _questions[_index];

  bool get _answered => isAnswered(_q, _response);

  void _check() {
    final response = _q.type == 'match_pairs'
        ? (_response as List<int?>).cast<int>()
        : _response;
    setState(() {
      _answers.add(QuizAnswer(_q, response, isCorrect(_q, response)));
      _checked = true;
    });
  }

  void _next() {
    widget.audio.stop();
    if (_index + 1 < _questions.length) {
      setState(() {
        _index++;
        _response = null;
        _checked = false;
      });
      return;
    }
    _watch.stop();
    final passed = widget.progress.recordQuiz(
      widget.pack,
      widget.lesson,
      scoreOf(_answers),
      passMark: _passMark,
      attemptId: const Uuid().v4(),
      duration: _watch.elapsed,
      answers: [
        for (final a in _answers)
          {
            'questionId': a.question.id,
            'response': a.response,
            'correct': a.correct,
          },
      ],
    );
    setState(() => _passed = passed);
  }

  Future<void> _play(String mediaId) async {
    final file = await widget.mediaFile(mediaId);
    if (file != null) await widget.audio.play(file, speed: 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(
        title: Text('${t.quizTitle} · ${widget.lesson.title.of(locale)}'),
      ),
      body: _passed == null ? _question(t, locale) : _result(t, locale),
    );
  }

  Widget _question(AppLocalizations t, String locale) {
    final q = _q;
    final last = _checked ? _answers.last : null;
    return Column(
      children: [
        LinearProgressIndicator(value: (_index + 1) / _questions.length),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(t.questionOf(_index + 1, _questions.length)),
              const SizedBox(height: 8),
              Text(
                q.prompt.of(locale),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              KeyedSubtree(
                key: ValueKey('${q.id}-$_index'),
                child: _input(t, q),
              ),
              if (last != null) ...[
                const SizedBox(height: 16),
                _Feedback(answer: last, locale: locale),
              ],
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const Key('quiz-action'),
                onPressed: _checked
                    ? _next
                    : _answered
                    ? _check
                    : null,
                child: Text(_checked ? t.next : t.check),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _input(AppLocalizations t, QuizQuestion q) => QuestionInput(
    question: q,
    response: _response,
    enabled: !_checked,
    random: _random,
    onPlay: _play,
    onChanged: (v) => setState(() => _response = v),
  );

  Widget _result(AppLocalizations t, String locale) {
    final wrong = _answers.where((a) => !a.correct).toList();
    final percent = (scoreOf(_answers) * 100).round();
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Icon(
          _passed! ? Icons.emoji_events : Icons.refresh,
          size: 72,
          color: _passed! ? Colors.amber : Colors.blueGrey,
        ),
        const SizedBox(height: 12),
        Text(
          t.quizScore(percent),
          style: Theme.of(context).textTheme.headlineMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          _passed! ? t.quizPassed : t.quizFailed((_passMark * 100).round()),
          textAlign: TextAlign.center,
        ),
        if (wrong.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text(
            t.reviewMistakes,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          for (final a in wrong)
            Card(
              child: ListTile(
                title: Text(a.question.prompt.of(locale)),
                subtitle: Text(
                  '${correctAnswerText(a.question)}\n'
                  '${a.question.explanation.of(locale)}',
                ),
                isThreeLine: true,
              ),
            ),
        ],
        const SizedBox(height: 24),
        if (!_passed!)
          FilledButton.icon(
            key: const Key('retake'),
            icon: const Icon(Icons.refresh),
            label: Text(t.retake),
            onPressed: () => setState(_start),
          ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(t.backToLessons),
        ),
      ],
    );
  }
}

class _Feedback extends StatelessWidget {
  const _Feedback({required this.answer, required this.locale});
  final QuizAnswer answer;
  final String locale;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final ok = answer.correct;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        color: ok ? Colors.green.shade50 : Colors.red.shade50,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              ok ? t.answerCorrect : t.answerWrong,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: ok ? Colors.green.shade800 : Colors.red.shade800,
              ),
            ),
            if (!ok) Text(correctAnswerText(answer.question)),
            const SizedBox(height: 4),
            Text(answer.question.explanation.of(locale)),
          ],
        ),
      ),
    );
  }
}
