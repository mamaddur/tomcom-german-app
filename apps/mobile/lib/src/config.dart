/// Build-time settings. Override with `--dart-define=API_BASE_URL=https://…`.
/// The default reaches a dev API on the host machine from the Android emulator.
const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000',
);
const appVersion = '0.1.0';
