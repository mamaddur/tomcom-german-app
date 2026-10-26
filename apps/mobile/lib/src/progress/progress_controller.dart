import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../content/pack_models.dart';

/// FR-203 lesson states.
enum LessonStatus { locked, available, inProgress, passed }

/// Rules from the server (`GET /v1/app/config` → `learning`), kept for offline use.
class LearningRules {
  const LearningRules({
    this.passMark,
    this.sequentialUnlock = true,
    this.dailyGoalMinutes = 10,
  });
  factory LearningRules.fromJson(Map<String, dynamic> j) => LearningRules(
    passMark: (j['passMark'] as num?)?.toDouble(),
    sequentialUnlock: j['sequentialUnlock'] as bool? ?? true,
    dailyGoalMinutes: j['dailyGoalMinutes'] as int? ?? 10,
  );

  /// Current admin pass mark (FR-402); null until the server has been reached, then the
  /// pack's own pass mark applies.
  final double? passMark;
  final bool sequentialUnlock;
  final int dailyGoalMinutes;
  Map<String, dynamic> toJson() => {
    if (passMark != null) 'passMark': passMark,
    'sequentialUnlock': sequentialUnlock,
    'dailyGoalMinutes': dailyGoalMinutes,
  };
}

/// One lesson's progress on this phone.
class LessonRecord {
  LessonRecord({
    required this.level,
    this.screen = 0,
    this.finished = false,
    this.bestScore,
    this.passed = false,
    required this.updatedAt,
  });
  factory LessonRecord.fromJson(Map<String, dynamic> j) => LessonRecord(
    level: j['level'] as String,
    screen: j['screen'] as int? ?? 0,
    finished: j['finished'] as bool? ?? false,
    bestScore: (j['bestScore'] as num?)?.toDouble(),
    passed: j['passed'] as bool? ?? false,
    updatedAt: DateTime.parse(j['updatedAt'] as String),
  );
  final String level;

  /// Last screen the learner reached, to resume there.
  int screen;

  /// All screens seen. The lesson is passed only by its quiz (FR-402, step 5).
  bool finished;
  double? bestScore;
  bool passed;
  DateTime updatedAt;

  Map<String, dynamic> toJson() => {
    'level': level,
    'screen': screen,
    'finished': finished,
    if (bestScore != null) 'bestScore': bestScore,
    'passed': passed,
    'updatedAt': updatedAt.toUtc().toIso8601String(),
  };
}

/// The next lesson to open from the dashboard (FR-202).
/// [quiz] is true when the learner has seen every screen and only the quiz is left.
typedef ContinueTarget = ({
  LessonPack pack,
  PackLesson lesson,
  int screen,
  bool quiz,
});

/// Learning progress, daily goal and streak (FR-201–FR-204). Kept in one small JSON file per
/// learner, so it works offline. Server sync arrives with quiz attempts in step 5.
///
/// Uses synchronous file calls: the file is a few KB, and it keeps widget tests off real
/// async I/O (see apps/mobile/CLAUDE.md).
class ProgressController extends ChangeNotifier {
  ProgressController({required this.dir, DateTime Function()? clock})
    : _clock = clock ?? DateTime.now;

  final Directory dir;
  final DateTime Function() _clock;

  String? _userId;
  final Map<String, LessonRecord> _lessons = {};

  /// Quiz attempts not yet sent to the server (FR-405), each with a client UUID so a resend
  /// is harmless (CLAUDE.md idempotency rule).
  final List<Map<String, dynamic>> _outbox = [];

  /// Learning seconds per IST day (`yyyy-mm-dd`).
  final Map<String, int> _seconds = {};
  LearningRules rules = const LearningRules();

  File get _file => File('${dir.path}/progress-$_userId.json');

  /// Loads the progress of [userId]. Another learner on the same phone gets their own file.
  void open(String userId) {
    if (_userId == userId) return;
    _userId = userId;
    _lessons.clear();
    _seconds.clear();
    _outbox.clear();
    rules = const LearningRules();
    if (_file.existsSync()) {
      try {
        final j = jsonDecode(_file.readAsStringSync()) as Map<String, dynamic>;
        (j['lessons'] as Map<String, dynamic>? ?? {}).forEach(
          (id, v) =>
              _lessons[id] = LessonRecord.fromJson(v as Map<String, dynamic>),
        );
        (j['seconds'] as Map<String, dynamic>? ?? {}).forEach(
          (day, v) => _seconds[day] = v as int,
        );
        for (final a in j['outbox'] as List? ?? const []) {
          _outbox.add(Map<String, dynamic>.from(a as Map));
        }
        if (j['rules'] case final Map<String, dynamic> r) {
          rules = LearningRules.fromJson(r);
        }
      } on FormatException {
        // A damaged file starts fresh rather than blocking the app.
      }
    }
    notifyListeners();
  }

  void _save() {
    if (_userId == null) return;
    dir.createSync(recursive: true);
    final tmp = File('${_file.path}.tmp')
      ..writeAsStringSync(
        jsonEncode({
          'lessons': {for (final e in _lessons.entries) e.key: e.value},
          'seconds': _seconds,
          'outbox': _outbox,
          'rules': rules,
        }),
        flush: true,
      );
    tmp.renameSync(_file.path);
  }

  void setRules(LearningRules value) {
    rules = value;
    _save();
    notifyListeners();
  }

  LessonRecord? recordOf(String lessonId) => _lessons[lessonId];

  // ── Lesson states (FR-203) and level progress (FR-201) ──

  LessonStatus statusOf(LessonPack pack, PackLesson lesson) {
    final r = _lessons[lesson.id];
    if (r?.passed ?? false) return LessonStatus.passed;
    if (r != null) return LessonStatus.inProgress;
    final i = pack.lessons.indexOf(lesson);
    if (rules.sequentialUnlock && i > 0) {
      final previous = _lessons[pack.lessons[i - 1].id];
      if (!(previous?.passed ?? false)) return LessonStatus.locked;
    }
    return LessonStatus.available;
  }

  /// Share of the level's lessons passed, 0–1.
  double levelProgress(LessonPack pack) => pack.lessons.isEmpty
      ? 0
      : pack.lessons.where((l) => _lessons[l.id]?.passed ?? false).length /
            pack.lessons.length;

  /// FR-202: the lesson started most recently and not passed; otherwise the first open lesson,
  /// in level order. Null when everything installed is passed or nothing is installed.
  ContinueTarget? continueTarget(Iterable<LessonPack> packs) {
    ContinueTarget? latest;
    DateTime? latestAt;
    for (final pack in packs) {
      for (final lesson in pack.lessons) {
        final r = _lessons[lesson.id];
        if (r == null || r.passed) continue;
        if (latestAt == null || r.updatedAt.isAfter(latestAt)) {
          latestAt = r.updatedAt;
          latest = (
            pack: pack,
            lesson: lesson,
            screen: r.finished ? 0 : r.screen,
            quiz: r.finished,
          );
        }
      }
    }
    if (latest != null) return latest;
    for (final pack in packs) {
      for (final lesson in pack.lessons) {
        if (statusOf(pack, lesson) == LessonStatus.available) {
          return (pack: pack, lesson: lesson, screen: 0, quiz: false);
        }
      }
    }
    return null;
  }

  void recordScreen(LessonPack pack, PackLesson lesson, int screen) {
    final r = _lessons.putIfAbsent(
      lesson.id,
      () => LessonRecord(level: pack.level, updatedAt: _clock()),
    );
    r
      ..screen = screen
      ..updatedAt = _clock();
    if (screen >= lesson.screens.length) r.finished = true;
    _save();
    notifyListeners();
  }

  /// Attempts waiting to be sent to the server.
  List<Map<String, dynamic>> get pendingAttempts => List.unmodifiable(_outbox);

  /// Removes attempts the server has stored.
  void markSent(Iterable<String> attemptIds) {
    final ids = attemptIds.toSet();
    _outbox.removeWhere((a) => ids.contains(a['id']));
    _save();
  }

  /// Quiz result (FR-402, FR-405). Best score wins (ADR-008); passing is final.
  /// Returns whether this attempt passed.
  bool recordQuiz(
    LessonPack pack,
    PackLesson lesson,
    double score, {
    required double passMark,
    String? attemptId,
    Duration duration = Duration.zero,
    List<Map<String, dynamic>> answers = const [],
  }) {
    final r = _lessons.putIfAbsent(
      lesson.id,
      () => LessonRecord(level: pack.level, updatedAt: _clock()),
    );
    r
      ..bestScore = r.bestScore == null || score > r.bestScore!
          ? score
          : r.bestScore
      ..passed = r.passed || score >= passMark
      ..updatedAt = _clock();
    if (attemptId != null) {
      _outbox.add({
        'id': attemptId,
        'lessonId': lesson.id,
        'level': pack.level,
        'packVersion': pack.version,
        'score': score,
        'passed': score >= passMark,
        'durationMs': duration.inMilliseconds,
        'answers': answers,
        'finishedAt': _clock().toUtc().toIso8601String(),
      });
    }
    _save();
    notifyListeners();
    return score >= passMark;
  }

  // ── Daily goal and streak (FR-204). Days are IST calendar days. ──

  static String _istDay(DateTime t) {
    final ist = t.toUtc().add(const Duration(hours: 5, minutes: 30));
    return '${ist.year.toString().padLeft(4, '0')}-'
        '${ist.month.toString().padLeft(2, '0')}-'
        '${ist.day.toString().padLeft(2, '0')}';
  }

  void addLearningTime(Duration d) {
    if (d.inSeconds <= 0) return;
    // One sitting counts at most an hour, so a player left open does not fake a streak.
    final seconds = d.inSeconds.clamp(0, 3600);
    final day = _istDay(_clock());
    _seconds[day] = (_seconds[day] ?? 0) + seconds;
    _save();
    notifyListeners();
  }

  int get todayMinutes => (_seconds[_istDay(_clock())] ?? 0) ~/ 60;

  bool _met(String day) => (_seconds[day] ?? 0) >= rules.dailyGoalMinutes * 60;

  bool get goalMetToday => _met(_istDay(_clock()));

  /// Consecutive days with the goal met, ending today (or yesterday, if today is not done yet).
  int get streak {
    var t = _clock();
    if (!_met(_istDay(t))) t = t.subtract(const Duration(days: 1));
    var n = 0;
    while (_met(_istDay(t))) {
      n++;
      t = t.subtract(const Duration(days: 1));
    }
    return n;
  }
}
