# AgoraX Android App

A thin Capacitor wrapper around the AgoraX web app. The APK loads the live
site in an Android WebView, so the UI is identical to the mobile browser
view — but it installs as a real app, owns its own cookie jar, and surfaces
real Android system notifications via a local-notifications bridge.

## What's in the box

- **Capacitor 6** + `@capacitor/local-notifications`
- **WebView pointed at the configured `server.url`** — by default the staging
  ngrok URL; change in `mobile/capacitor.config.json` for production.
- **Real-time notifications** — when the app is open the web client opens an
  EventSource against `/api/sortition-notifications/stream` and, when running
  natively, fires `LocalNotifications.schedule()` so the user sees a real
  status-bar notification.

Background push (delivery while the app is closed) is **not** wired yet —
that needs Firebase Cloud Messaging. The plumbing is left as a future PR
because it requires Google credentials. See "Future: background push (FCM)"
below.

## Notification events users receive

The server fans out notifications on these events:

| Event                                  | Trigger                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `sortition_assigned`                   | User selected by sortition for a body                                   |
| `sortition_deadline` / `_reminder`     | Approaching response deadline (cron)                                    |
| `proposal_advanced`                    | Proposal status moves (e.g. → community_signal, sortition_synthesis)    |
| `vote_started`                         | Voting opens on a proposal in user's community                          |
| `new_proposal`                         | New proposal submitted in user's community (author excluded)            |
| `new_media`                            | New podcast/video uploaded to a proposal in user's community            |
| `conference_*`, `sortition_room_opened`| LiveKit conference scheduling / starting                                |

All notifications respect the per-type opt-outs at
`/notification-preferences` (Settings → Notifications).

## Install on a phone (sideload)

1. Grab the latest `agorax-*.apk` from
   [Releases](https://github.com/miltosdoc/agoraxdemocracy/releases) on the
   GitHub repo.
2. On the phone, open the .apk from Files or your browser.
3. Android will ask to allow "Install unknown apps" for the source — confirm.
4. Open the app and grant the notification permission when prompted.

## Build locally

Prerequisites:
- JDK 17 (`brew install openjdk@17`)
- Android SDK command-line tools (`brew install --cask android-commandlinetools`)
- Node 20+

```bash
cd mobile
npm install
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npx cap sync android
cd android
JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null || echo /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home) \
  ./gradlew assembleDebug
# APK lands at app/build/outputs/apk/debug/app-debug.apk
```

Install on a connected device:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Pointing the app at a different URL

The WebView URL lives in `mobile/capacitor.config.json` under `server.url`.
After changing it:

```bash
cd mobile
npx cap sync android   # copies the new config into the native project
cd android && ./gradlew assembleDebug
```

For a stable production build, use a real HTTPS domain (e.g. `https://agorax.gr`).
ngrok free URLs rotate on every restart, which is fine for development demos
but means each rebuild ships a different target.

## CI / Release pipeline

`.github/workflows/release-apk.yml` runs on every `v*` tag and on manual
dispatch. On tag pushes it builds the APK and attaches it to a GitHub Release
so users have a downloadable, versioned binary.

To cut a release:

```bash
git tag v0.1.0-mobile
git push origin v0.1.0-mobile
```

The workflow takes ~5 minutes; the APK shows up at
`https://github.com/miltosdoc/agoraxdemocracy/releases/tag/v0.1.0-mobile`.

## Local debugging

The APK has WebView remote debugging enabled by default in debug builds. With
the phone plugged in:

1. Open Chrome on the desktop → `chrome://inspect/#devices`.
2. The AgoraX WebView appears under your phone; click "inspect".
3. You get full DevTools — console, network, sources — against the live site.

This is the fastest way to diagnose "tapping X does nothing" bugs in the app.

## Future: background push (FCM)

When the WebView is paused (app backgrounded, screen off), the SSE stream
disconnects and no notifications arrive. To deliver pushes that wake the app
or just show a system notification while closed, AgoraX needs Firebase Cloud
Messaging.

Sketch of the work, when ready:

1. Create a Firebase project at console.firebase.google.com (free).
2. Add an Android app with package `gr.agorax.app`.
3. Download `google-services.json`, drop it at `mobile/android/app/google-services.json`.
4. Add `@capacitor/push-notifications` to `mobile/package.json`.
5. Server side: install `firebase-admin`, store a `device_tokens(user_id, token, platform)` table,
   and in `createNotification()` POST to FCM if there's a token for that user.
6. Set the Firebase service-account JSON as `FIREBASE_SERVICE_ACCOUNT_PATH` on the Linux box.

This is intentionally not implemented in v1 because step 1 requires Google
credentials only the deploy operator has. See `docs/push-setup.md` for the
web (VAPID) push setup that's already wired.

## File layout

```
mobile/
├── capacitor.config.json     # appId, appName, server.url
├── package.json              # @capacitor/{core,cli,android,local-notifications}
├── www/                      # placeholder index.html — never loads since server.url is set
└── android/                  # gradle project; regenerated by `cap sync`
    └── app/build/outputs/apk/debug/app-debug.apk
```
