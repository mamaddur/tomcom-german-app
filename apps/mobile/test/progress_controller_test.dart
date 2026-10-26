import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tomcom_german/src/progress/progress_controller.dart';

import 'pack_fixtures.dart';

void main() {
  late Directory dir;
  late DateTime now;
  ProgressController make() =>
      ProgressController(dir: dir, clock: () => now)..open('learner-1');

  setUp(() {
    dir = Directory.systemTemp.createTempSync('progress-');
    // 10:00 IST on 25 Oct 2026.
    now = DateTime.utc(2026, 10, 25, 4, 30);
  });
  tearDown(() => dir.deleteSync(recursive: true));

  group('lesson states (FR-203) and level progress (FR-201)', () {
    test('only the first lesson is open; passing its quiz opens the next', () {
      final p = make();
      final pack = memoryPack();
      final [l1, l2, l3] = pack.lessons;
      expect(p.statusOf(pack, l1), LessonStatus.available);
      expect(p.statusOf(pack, l2), LessonStatus.locked);

      p.recordScreen(pack, l1, 0);
      expect(p.statusOf(pack, l1), LessonStatus.inProgress);
      // Seeing every screen is not passing: the quiz decides (FR-402).
      p.recordScreen(pack, l1, 1);
      expect(p.statusOf(pack, l2), LessonStatus.locked);

      p.recordQuiz(pack, l1, 0.7, passMark: 0.8);
      expect(p.statusOf(pack, l1), LessonStatus.inProgress);
      p.recordQuiz(pack, l1, 0.9, passMark: 0.8);
      expect(p.statusOf(pack, l1), LessonStatus.passed);
      expect(p.statusOf(pack, l2), LessonStatus.available);
      expect(p.statusOf(pack, l3), LessonStatus.locked);
      expect(p.levelProgress(pack), closeTo(1 / 3, 0.001));
    });

    test('best score wins and a pass is never lost by a worse retake', () {
      final p = make();
      final pack = memoryPack();
      final l1 = pack.lessons.first;
      p.recordQuiz(pack, l1, 0.9, passMark: 0.8);
      p.recordQuiz(pack, l1, 0.5, passMark: 0.8);
      expect(p.recordOf(l1.id)!.bestScore, 0.9);
      expect(p.statusOf(pack, l1), LessonStatus.passed);
    });

    test('with sequential unlocking off, every lesson is open', () {
      final p = make()..setRules(const LearningRules(sequentialUnlock: false));
      final pack = memoryPack();
      expect(
        pack.lessons.map((l) => p.statusOf(pack, l)),
        everyElement(LessonStatus.available),
      );
    });

    test('progress survives a restart and stays separate per learner', () {
      final pack = memoryPack();
      make().recordQuiz(pack, pack.lessons.first, 1, passMark: 0.8);
      expect(make().levelProgress(pack), closeTo(1 / 3, 0.001));
      final other = ProgressController(dir: dir, clock: () => now)
        ..open('learner-2');
      expect(other.levelProgress(pack), 0);
    });

    test('a damaged progress file starts fresh instead of crashing', () {
      File('${dir.path}/progress-learner-1.json').writeAsStringSync('{oops');
      expect(make().levelProgress(memoryPack()), 0);
    });
  });

  group('continue card (FR-202)', () {
    test('resumes the most recent unfinished lesson at its screen', () {
      final p = make();
      final a1 = memoryPack();
      final a2 = memoryPack(level: 'A2');
      p.recordScreen(a1, a1.lessons.first, 0);
      now = now.add(const Duration(minutes: 5));
      p.recordScreen(a2, a2.lessons.first, 1);
      final target = p.continueTarget([a1, a2])!;
      expect(target.lesson.id, 'A2-lesson-1');
      // Every screen seen: start again from the top for the quiz.
      expect(target.screen, 0);
    });

    test('otherwise opens the first open lesson; null when all are passed', () {
      final p = make();
      final pack = memoryPack(lessons: 1);
      expect(p.continueTarget([pack])!.lesson.id, 'A1-lesson-1');
      p.recordQuiz(pack, pack.lessons.first, 1, passMark: 0.8);
      expect(p.continueTarget([pack]), isNull);
      expect(p.continueTarget(const []), isNull);
    });
  });

  group('daily goal and streak (FR-204)', () {
    test('counts minutes per IST day against the goal', () {
      final p = make();
      p.addLearningTime(const Duration(minutes: 4));
      expect(p.todayMinutes, 4);
      expect(p.goalMetToday, isFalse);
      p.addLearningTime(const Duration(minutes: 6));
      expect(p.goalMetToday, isTrue);
      expect(p.streak, 1);
    });

    test('the day changes at midnight IST, not UTC', () {
      final p = make();
      now = DateTime.utc(2026, 10, 25, 18, 20); // 23:50 IST on the 25th
      p.addLearningTime(const Duration(minutes: 10));
      now = DateTime.utc(2026, 10, 25, 18, 40); // 00:10 IST on the 26th
      expect(p.todayMinutes, 0);
      expect(p.streak, 1, reason: 'yesterday counts until today ends');
    });

    test('a streak counts consecutive days and breaks after a missed day', () {
      final p = make();
      for (final day in [20, 22, 23, 24]) {
        now = DateTime.utc(2026, 10, day, 6);
        p.addLearningTime(const Duration(minutes: 12));
      }
      now = DateTime.utc(2026, 10, 25, 6);
      expect(p.streak, 3);
      p.addLearningTime(const Duration(minutes: 10));
      expect(p.streak, 4);
      now = DateTime.utc(2026, 10, 27, 6);
      expect(p.streak, 0);
    });

    test('one sitting counts at most an hour', () {
      final p = make();
      p.addLearningTime(const Duration(hours: 5));
      expect(p.todayMinutes, 60);
    });

    test('the goal follows the server setting', () {
      final p = make()..setRules(const LearningRules(dailyGoalMinutes: 20));
      p.addLearningTime(const Duration(minutes: 15));
      expect(p.goalMetToday, isFalse);
    });
  });

  group('server sync (FR-405, NFR-05)', () {
    test('a stored attempt leaves the outbox; results merge best-wins', () {
      final p = make();
      final pack = memoryPack();
      final [l1, l2, _] = pack.lessons;
      p.recordQuiz(pack, l1, 0.7, passMark: 0.8, attemptId: 'a1');
      p.recordQuiz(pack, l1, 0.6, passMark: 0.8, attemptId: 'a2');
      expect(p.pendingAttempts.map((a) => a['id']), ['a1', 'a2']);

      p.applySync({
        'stored': ['a1'],
        'lessons': [
          // Passed on another phone.
          {'lessonId': l1.id, 'bestScore': 0.9, 'passed': true},
          {'lessonId': l2.id, 'bestScore': 0.5, 'passed': false},
        ],
        'activity': <Object>[],
      });
      expect(p.pendingAttempts.map((a) => a['id']), ['a2']);
      expect(p.recordOf(l1.id)!.bestScore, 0.9);
      expect(p.statusOf(pack, l1), LessonStatus.passed);
      expect(p.statusOf(pack, l2), LessonStatus.inProgress);
    });

    test('a weaker server result never lowers what the phone has', () {
      final p = make();
      final pack = memoryPack();
      final l1 = pack.lessons.first;
      p.recordQuiz(pack, l1, 1, passMark: 0.8);
      p.applySync({
        'stored': <Object>[],
        'lessons': [
          {'lessonId': l1.id, 'bestScore': 0.4, 'passed': false},
        ],
        'activity': <Object>[],
      });
      expect(p.recordOf(l1.id)!.bestScore, 1);
      expect(p.statusOf(pack, l1), LessonStatus.passed);
    });

    test(
      'daily time: sends the last 60 days; the larger value wins on merge',
      () {
        final p = make();
        now = DateTime.utc(2026, 7, 1, 6);
        p.addLearningTime(
          const Duration(minutes: 5),
        ); // older than 60 days by 25 Oct
        now = DateTime.utc(2026, 10, 25, 6);
        p.addLearningTime(const Duration(minutes: 3));
        expect(p.activityForSync(), [
          {'date': '2026-10-25', 'seconds': 180},
        ]);
        p.applySync({
          'stored': <Object>[],
          'lessons': <Object>[],
          'activity': [
            {'date': '2026-10-25', 'seconds': 600},
            {'date': '2026-10-24', 'seconds': 700},
          ],
        });
        expect(p.todayMinutes, 10);
        expect(p.streak, 2);
      },
    );
  });

  group('word list with spaced repetition (FR-308)', () {
    test('save, review up the boxes, a miss goes back to tomorrow, remove', () {
      final p = make(); // 25 Oct, 10:00 IST
      p.toggleWord('w1');
      expect(p.isSaved('w1'), isTrue);
      expect(p.dueWords, ['w1'], reason: 'new words are due at once');

      p.reviewWord('w1', knew: true); // box 1 → in 2 days
      expect(p.dueWords, isEmpty);
      now = DateTime.utc(2026, 10, 27, 4, 30);
      expect(p.dueWords, ['w1']);
      p.reviewWord('w1', knew: true); // box 2 → in 4 days
      now = DateTime.utc(2026, 10, 30, 4, 30);
      expect(p.dueWords, isEmpty);
      now = DateTime.utc(2026, 10, 31, 4, 30);
      p.reviewWord('w1', knew: false); // back to box 0, tomorrow
      expect(p.dueWords, isEmpty);
      now = DateTime.utc(2026, 11, 1, 4, 30);
      expect(p.dueWords, ['w1']);

      p.toggleWord('w1');
      expect(p.isSaved('w1'), isFalse);
      expect(p.savedWords, isEmpty);
      // The removal is kept so other phones remove it too.
      expect(p.wordsForSync().single, containsPair('removed', true));
    });

    test('survives a restart, and the newest change from the server wins', () {
      final p = make();
      p.toggleWord('w1');
      expect(make().isSaved('w1'), isTrue);
      p.applySync({
        'stored': <Object>[],
        'lessons': <Object>[],
        'activity': <Object>[],
        'words': [
          // Older than the phone's change: ignored.
          {
            'vocabId': 'w1',
            'box': 4,
            'due': '2026-12-01',
            'removed': true,
            'updatedAt': '2026-10-24T00:00:00Z',
          },
          // Saved on another phone.
          {
            'vocabId': 'w2',
            'box': 1,
            'due': '2026-10-25',
            'removed': false,
            'updatedAt': '2026-10-25T00:00:00Z',
          },
        ],
      });
      expect(p.isSaved('w1'), isTrue);
      expect(p.savedWords, containsAll(['w1', 'w2']));
    });

    test('modules are on until the server turns them off (FR-1103)', () {
      final p = make();
      expect(p.feature('module.bookmarks'), isTrue);
      p.setFeatures({'module.bookmarks': false});
      expect(make().feature('module.bookmarks'), isFalse);
    });
  });
}
