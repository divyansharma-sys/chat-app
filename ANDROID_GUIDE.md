# ChatFlow Android APK Build Guide 📱

ChatFlow is now configured with **Capacitor** to build a native Android APK with full hardware support for WebRTC video/audio calling, camera, microphone, and responsive touch controls.

---

## 🚀 How to Generate the APK

### Method 1: Using Android Studio (Recommended & Easiest)

1. **Install Android Studio**:
   - Download and install [Android Studio](https://developer.android.com/studio) if not already installed.
   - During setup, ensure **Android SDK**, **Android SDK Command-line Tools**, and **Android Virtual Device** are installed.

2. **Open the Project in Android Studio**:
   Open a terminal in the `frontend` folder and run:
   ```bash
   cd frontend
   npm run cap:open
   ```
   *(Or open Android Studio manually $\rightarrow$ Open $\rightarrow$ select the `frontend/android` folder).*

3. **Wait for Gradle Sync**:
   Android Studio will automatically download Gradle and sync project dependencies.

4. **Build APK**:
   - In Android Studio's top menu bar, click **Build** $\rightarrow$ **Build Bundle(s) / APK(s)** $\rightarrow$ **Build APK(s)**.
   - Once build finishes, a notification will appear in the bottom-right corner: **APK(s) generated successfully**.
   - Click **locate** to find your `app-debug.apk` file!
   - You can directly copy this `.apk` to your Android phone and install it.

---

### Method 2: Command Line (CLI) Build

If you have Java (JDK 17 or 21) and Android SDK installed:

```bash
# 1. Navigate to frontend and build the web bundle
cd frontend
npm run cap:sync

# 2. Build the Debug APK using Gradle
cd android
./gradlew assembleDebug
```

Your generated APK will be at:
`frontend/android/app/build/outputs/apk/debug/app-debug.apk`

---

## 🛠️ Helpful NPM Scripts in `frontend/`

- `npm run cap:sync`: Builds the Vite web app and updates the Android assets.
- `npm run cap:open`: Opens the native Android project in Android Studio.
- `npm run cap:build`: Syncs and triggers the native build pipeline.

---

## 🔒 Configured Android Permissions
The native project in [`frontend/android/app/src/main/AndroidManifest.xml`](file:///c:/Users/ds445/OneDrive/Documents/chat/frontend/android/app/src/main/AndroidManifest.xml) has been pre-configured with:
- `CAMERA` (for video calls & photo attachments)
- `RECORD_AUDIO` (for voice messages & audio calls)
- `MODIFY_AUDIO_SETTINGS` (for speakerphone / earpiece routing)
- `INTERNET` & `ACCESS_NETWORK_STATE` (for Firebase & WebRTC signaling)
- `VIBRATE` & `WAKE_LOCK` (for incoming call ringers & ongoing calls)
- `READ_MEDIA_IMAGES` / `READ_MEDIA_AUDIO` / `READ_MEDIA_VIDEO` (for media messaging)
