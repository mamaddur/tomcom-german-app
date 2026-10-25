import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

/// Persists the session and this installation's ID. Tokens live in the platform keystore.
abstract class SessionStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);

  static const accessTokenKey = 'access_token';
  static const refreshTokenKey = 'refresh_token';
  static const deviceIdKey = 'device_id';
  static const localeKey = 'ui_locale';

  /// A random ID per installation, sent with sign-in so sessions can be listed per device.
  Future<String> deviceId() async {
    final existing = await read(deviceIdKey);
    if (existing != null) return existing;
    final id = const Uuid().v4();
    await write(deviceIdKey, id);
    return id;
  }

  Future<void> clearSession() async {
    await delete(accessTokenKey);
    await delete(refreshTokenKey);
  }
}

class SecureSessionStore extends SessionStore {
  final _storage = const FlutterSecureStorage();

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// For tests.
class MemorySessionStore extends SessionStore {
  final values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}
