# MyAmin Android app

This Android WebView client loads the production MyAmin website and supports its existing web login/session, GPS prompts, camera/microphone permissions, file upload, external UPI/tel/mail links, downloads, Android back navigation, and a notification channel.

## Build
The GitHub Actions workflow `.github/workflows/android-apk.yml` builds a debug APK and uploads it as a workflow artifact. Debug APKs are for testing and are not release-signed for public distribution.

## Push notification status
The Android notification permission and channel are prepared, but **remote push delivery is not configured yet**. Real booking notifications to customers and Amins require Firebase Cloud Messaging credentials (or a complete Web Push/VAPID backend), secure server-side event delivery, and end-to-end tests. The app must not display fake booking notifications.
