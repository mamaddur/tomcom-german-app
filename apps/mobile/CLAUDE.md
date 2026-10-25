# CLAUDE.md — apps/mobile (Flutter learner app)

Read the root `CLAUDE.md` first; its rules apply here. Flutter SDK 3.47.8 (this machine: `/opt/flutter/bin`).

## Commands
| Task | Command |
|---|---|
| Generate localisations (after editing ARB files) | `flutter gen-l10n` |
| Analyze / format | `flutter analyze` / `dart format lib test` |
| Tests | `flutter test` |
| Run on a device or emulator | `flutter run` (needs Android SDK or Xcode; not installed on the build machine yet) |

## Conventions
- Targets: Android 8.0 (minSdk 26) with 2 GB RAM, iOS 15. Keep the install under 40 MB (NFR-02); lesson media comes in downloaded packs, never in the app bundle.
- Every user-facing string goes in `lib/l10n/app_en.arb` (with an `@key` description) and `app_te.arb`. The parity test enforces both. Telugu text needs review by the Telugu language reviewer before release.
- Telugu is the default locale (BR-02). Use icons plus Telugu labels and minimal typing (NFR-18).
- The app talks only to our API. No vendor SDKs (LLM, speech, SMS) in the app; push uses FCM/APNs tokens registered through the API.
- Never log PII. Use the app logger (added in step 2), never `print`.
