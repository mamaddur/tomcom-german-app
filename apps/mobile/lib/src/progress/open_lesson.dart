import 'package:flutter/material.dart';

import '../content/content_controller.dart';
import '../content/pack_models.dart';
import '../player/lesson_player_screen.dart';
import '../quiz/quiz_screen.dart';
import 'progress_controller.dart';

/// Opens a lesson in the player and records progress and learning time. At the end the learner
/// takes the quiz (FR-401); a lesson without questions passes when it is finished.
Future<void> openLesson(
  BuildContext context, {
  required ContentController content,
  required ProgressController progress,
  required LessonPack pack,
  required PackLesson lesson,
  int screen = 0,
}) => Navigator.of(context).push(
  MaterialPageRoute<void>(
    builder: (context) => LessonPlayerScreen(
      pack: pack,
      lesson: lesson,
      initialScreen: screen,
      mediaFile: (id) => content.store.mediaFile(pack.level, id),
      audio: content.audio,
      passMark: progress.rules.passMark ?? pack.settings.passMark,
      onScreen: (i) {
        progress.recordScreen(pack, lesson, i);
        if (i >= lesson.screens.length && lesson.questions.isEmpty) {
          progress.recordQuiz(pack, lesson, 1, passMark: 0);
        }
      },
      onTime: progress.addLearningTime,
      words: progress.feature('module.bookmarks') ? progress : null,
      onStartQuiz: lesson.questions.isEmpty
          ? null
          : () => Navigator.of(context).pushReplacement(
              quizRoute(
                content: content,
                progress: progress,
                pack: pack,
                lesson: lesson,
              ),
            ),
    ),
  ),
);

/// Opens the quiz of a lesson whose screens are all seen (continue card).
Future<void> openQuiz(
  BuildContext context, {
  required ContentController content,
  required ProgressController progress,
  required LessonPack pack,
  required PackLesson lesson,
}) => Navigator.of(context).push(
  quizRoute(content: content, progress: progress, pack: pack, lesson: lesson),
);

MaterialPageRoute<void> quizRoute({
  required ContentController content,
  required ProgressController progress,
  required LessonPack pack,
  required PackLesson lesson,
}) => MaterialPageRoute<void>(
  builder: (_) => QuizScreen(
    pack: pack,
    lesson: lesson,
    progress: progress,
    audio: content.audio,
    mediaFile: (id) => content.store.mediaFile(pack.level, id),
  ),
);
