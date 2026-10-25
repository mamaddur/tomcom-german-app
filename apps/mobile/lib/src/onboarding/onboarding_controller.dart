import 'package:flutter/widgets.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../session/session_store.dart';

enum OnboardingStep {
  loading,
  welcome,
  phone,
  otp,
  language,
  consent,
  profile,
  batch,
  home,
}

/// Story 1 as a state machine: welcome → phone → OTP → language → consent → profile → batch → home.
/// Returning learners skip to the first step they have not completed.
class OnboardingController extends ChangeNotifier {
  OnboardingController({required this.api, required this.store});

  final ApiClient api;
  final SessionStore store;

  static const _batchSkippedKey = 'batch_skipped';
  static const resendWait = Duration(seconds: 30);

  OnboardingStep step = OnboardingStep.loading;
  bool busy = false;
  String? errorCode;

  /// Until the learner picks a language, screens are bilingual and Telugu leads (BR-02).
  Locale locale = const Locale('te');
  String phone = '';
  DateTime? resendAvailableAt;
  String? _registrationToken;
  ConsentNotice? notice;
  List<ReferenceItem> districts = const [];
  List<ReferenceItem> trades = const [];
  Me? me;

  Future<void> start() async {
    final saved = await store.read(SessionStore.localeKey);
    if (saved != null) locale = Locale(saved);
    if (await store.read(SessionStore.refreshTokenKey) == null) {
      _go(OnboardingStep.welcome);
      return;
    }
    await _run(_loadMeAndRoute, onError: () => _go(OnboardingStep.welcome));
  }

  void begin() => _go(OnboardingStep.phone);

  Future<void> submitPhone(String number) => _run(() async {
    await api.requestOtp(number, locale.languageCode);
    phone = number;
    resendAvailableAt = DateTime.now().add(resendWait);
    _go(OnboardingStep.otp);
  });

  Future<void> resendCode() => _run(() async {
    await api.requestOtp(phone, locale.languageCode);
    resendAvailableAt = DateTime.now().add(resendWait);
  });

  Future<void> submitOtp(String code) => _run(() async {
    final result = await api.verifyOtp(phone, code);
    if (result.authenticated) {
      await _loadMeAndRoute();
    } else {
      _registrationToken = result.registrationToken;
      _go(OnboardingStep.language);
    }
  });

  /// FR-102. Before registration only the device remembers it; afterwards the server does too.
  Future<void> chooseLanguage(String code) => _run(() async {
    locale = Locale(code);
    await store.write(SessionStore.localeKey, code);
    if (me != null) {
      me = await api.setLocale(code);
      notifyListeners();
      return;
    }
    notice = await api.consentNotice(code);
    _go(OnboardingStep.consent);
  });

  /// FR-104: the account is created only here, together with the consent record.
  Future<void> agree(Set<String> purposes) => _run(() async {
    await api.register(
      registrationToken: _registrationToken!,
      locale: locale.languageCode,
      noticeVersion: notice!.version,
      purposes: purposes.toList(),
    );
    _registrationToken = null;
    await _loadMeAndRoute();
  });

  Future<void> saveProfile(ProfileInput input) => _run(() async {
    me = await api.setProfile(input);
    await _route();
  });

  /// FR-802: edit the profile later. Returns whether it saved.
  Future<bool> updateProfile(ProfileInput input) async {
    var ok = false;
    await _run(() async {
      me = await api.setProfile(input);
      ok = true;
    });
    return ok;
  }

  /// Districts and trades for the profile form.
  Future<void> loadReference() => _run(() async {
    if (districts.isEmpty) {
      final lists = await Future.wait([api.districts(), api.trades()]);
      districts = lists[0];
      trades = lists[1];
    }
  });

  Future<void> joinBatch(String code) => _run(() async {
    me = await api.joinBatch(code);
    await _route();
  });

  Future<void> skipBatch() async {
    await store.write(_batchSkippedKey, '1');
    _go(OnboardingStep.home);
  }

  /// FR-804: erase the account. Returns whether it worked.
  Future<bool> eraseAccount() async {
    var ok = false;
    await _run(() async {
      await api.eraseAccount();
      ok = true;
    });
    if (ok) {
      me = null;
      phone = '';
      _go(OnboardingStep.welcome);
    }
    return ok;
  }

  Future<void> signOut() async {
    await api.signOut();
    me = null;
    phone = '';
    _go(OnboardingStep.welcome);
  }

  void back() {
    errorCode = null;
    switch (step) {
      case OnboardingStep.phone:
        _go(OnboardingStep.welcome);
      case OnboardingStep.otp:
        _go(OnboardingStep.phone);
      default:
        break;
    }
  }

  Future<void> _loadMeAndRoute() async {
    me = await api.me();
    locale = Locale(me!.uiLocale);
    await store.write(SessionStore.localeKey, me!.uiLocale);
    await _route();
  }

  Future<void> _route() async {
    final m = me!;
    if (!m.profileComplete) {
      if (districts.isEmpty) {
        final lists = await Future.wait([api.districts(), api.trades()]);
        districts = lists[0];
        trades = lists[1];
      }
      _go(OnboardingStep.profile);
    } else if (!m.batchJoined && await store.read(_batchSkippedKey) == null) {
      _go(OnboardingStep.batch);
    } else {
      _go(OnboardingStep.home);
    }
  }

  void _go(OnboardingStep next) {
    step = next;
    notifyListeners();
  }

  Future<void> _run(
    Future<void> Function() action, {
    VoidCallback? onError,
  }) async {
    busy = true;
    errorCode = null;
    notifyListeners();
    try {
      await action();
    } on ApiException catch (e) {
      errorCode = e.code;
      if (e.code == 'session_expired') {
        _go(OnboardingStep.welcome);
      } else if (e.code == 'registration_expired') {
        _registrationToken = null;
        _go(OnboardingStep.phone);
      }
      onError?.call();
    } finally {
      busy = false;
      notifyListeners();
    }
  }
}
