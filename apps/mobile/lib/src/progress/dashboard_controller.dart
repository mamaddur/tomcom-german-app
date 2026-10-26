import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import 'progress_controller.dart';

/// Server data for the dashboard: announcements (FR-205) and the learning rules. Offline, the
/// dashboard keeps the last rules and shows no banner.
class DashboardController extends ChangeNotifier {
  DashboardController({required this.api, required this.progress});

  final ApiClient api;
  final ProgressController progress;
  List<Announcement> announcements = const [];

  /// FR-1102: a newer version exists (not required yet).
  bool updateAvailable = false;
  final Set<String> _dismissed = {};

  List<Announcement> get visible =>
      announcements.where((a) => !_dismissed.contains(a.id)).toList();

  Future<void> refresh() async {
    try {
      final config = await api.appConfig();
      updateAvailable = config['update'] == 'optional';
      if (config['learning'] case final Map<String, dynamic> learning) {
        progress.setRules(LearningRules.fromJson(learning));
      }
      announcements = await api.announcements();
    } on ApiException {
      // Offline or server trouble: keep what we have.
    }
    notifyListeners();
    await syncProgress();
  }

  bool _syncing = false;

  /// Sends the outbox and merges server results. Offline, everything stays queued (NFR-05).
  Future<void> syncProgress() async {
    if (_syncing) return;
    _syncing = true;
    try {
      // At most 100 attempts per request (API limit); the rest go on the next sync.
      final result = await api.sync(
        attempts: progress.pendingAttempts.take(100).toList(),
        activity: progress.activityForSync(),
      );
      progress.applySync(result);
    } on ApiException {
      // Try again on the next refresh.
    } finally {
      _syncing = false;
    }
  }

  void dismiss(String id) {
    _dismissed.add(id);
    notifyListeners();
  }
}
