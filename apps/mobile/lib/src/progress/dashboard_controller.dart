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
  final Set<String> _dismissed = {};

  List<Announcement> get visible =>
      announcements.where((a) => !_dismissed.contains(a.id)).toList();

  Future<void> refresh() async {
    try {
      final config = await api.appConfig();
      if (config['learning'] case final Map<String, dynamic> learning) {
        progress.setRules(LearningRules.fromJson(learning));
      }
      announcements = await api.announcements();
    } on ApiException {
      // Offline or server trouble: keep what we have.
    }
    notifyListeners();
  }

  void dismiss(String id) {
    _dismissed.add(id);
    notifyListeners();
  }
}
