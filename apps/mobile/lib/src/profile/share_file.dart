import 'dart:io';

import 'package:share_plus/share_plus.dart';

/// Hands a file to the phone's share sheet (save to Files, send by WhatsApp or email).
typedef ShareFile = Future<void> Function(File file);

/// Replaced in tests; the share sheet needs a real device.
ShareFile shareFile = (file) async {
  await SharePlus.instance.share(ShareParams(files: [XFile(file.path)]));
};
