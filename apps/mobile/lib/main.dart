import 'package:flutter/material.dart';

import 'src/api/api_client.dart';
import 'src/app.dart';
import 'src/config.dart';
import 'src/onboarding/onboarding_controller.dart';
import 'src/session/session_store.dart';

void main() {
  final store = SecureSessionStore();
  final api = ApiClient(baseUrl: apiBaseUrl, store: store);
  runApp(
    TomcomApp(
      controller: OnboardingController(api: api, store: store),
    ),
  );
}
