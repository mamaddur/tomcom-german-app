import 'package:flutter/material.dart';

import '../content/content_controller.dart';
import '../content/pack_models.dart';
import '../player/lesson_player_screen.dart';
import 'progress_controller.dart';

/// Opens a lesson in the player and records progress and learning time.
Future<void> openLesson(
  BuildContext context, {
  required ContentController content,
  required ProgressController progress,
  required LessonPack pack,
  required PackLesson lesson,
  int screen = 0,
}) => Navigator.of(context).push(
  MaterialPageRoute<void>(
    builder: (_) => LessonPlayerScreen(
      pack: pack,
      lesson: lesson,
      initialScreen: screen,
      mediaFile: (id) => content.store.mediaFile(pack.level, id),
      audio: content.audio,
      onScreen: (i) => progress.recordScreen(pack, lesson, i),
      onTime: progress.addLearningTime,
    ),
  ),
);
