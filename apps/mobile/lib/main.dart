import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'src/api/api_client.dart';
import 'src/app.dart';
import 'src/config.dart';
import 'src/content/content_controller.dart';
import 'src/content/pack_store.dart';
import 'src/onboarding/onboarding_controller.dart';
import 'src/player/audio_service.dart';
import 'src/session/session_store.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final store = SecureSessionStore();
  final api = ApiClient(baseUrl: apiBaseUrl, store: store);
  // Packs live in app support storage (not backed up, not visible to other apps).
  final content = ContentController(
    api: api,
    store: PackStore(getApplicationSupportDirectory),
    tempDir: getTemporaryDirectory,
    audio: JustAudioService(),
  );
  runApp(
    TomcomApp(
      controller: OnboardingController(api: api, store: store),
      content: content,
    ),
  );
}
