# GPS diagnostic Android build

Use `scripts/build-torto-diagnostic.ps1` for outdoor GPS field testing. It builds a release APK with Expo's embedded JavaScript and assets, so it launches without Metro, USB or `adb reverse` after installation.

The dedicated build turns on only the GPS diagnostic Settings card. Diagnostics remain off until enabled manually. Public release builds do not contain the embedded internal marker and therefore do not expose the controls. It keeps the existing Android application ID (`com.aisensei.app`). In the current repository, both `debug` and `release` use `android/app/debug.keystore`, so APKs produced from this checkout are signing-compatible. If the installed APK came from a different checkout or certificate, `adb install -r` will refuse the update instead of deleting application data.

```powershell
Set-Location D:\Projects\AiSensei
.\scripts\build-torto-diagnostic.ps1

# Optional USB install only. The APK itself does not need USB or Metro later.
.\scripts\build-torto-diagnostic.ps1 -Install
```

If installation reports a certificate mismatch, stop. Do not uninstall the existing package because uninstalling would erase its application data. Build with the same signing certificate as the installed APK instead. You may also transfer `android\app\build\outputs\apk\release\app-release.apk` to the phone and install it locally.

On the phone:

1. Open Settings in Torto.
2. Open the **GPS diagnostics** card and turn diagnostics on.
3. Record the measured route, then finish the workout normally.
4. Return to Settings and choose **Export current GPS diagnostics**.
5. Share the JSON to a private location. The ordinary diagnostic events omit route coordinates.

The export reports whether the queue flushed completely, whether detail events were evicted or dropped, and whole-session counters. A `complete: false` export is still useful but must not be treated as a complete reconstruction.
