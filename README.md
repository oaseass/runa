# LUNA

LUNA는 Next.js 웹앱과 Android Capacitor 셸을 함께 운용한다.

## 웹 앱

개발 서버:

```bash
npm run dev
```

프로덕션 빌드:

```bash
npm run build
```

## Android 셸

Android 셸은 `https://runa.co.kr` 를 원격 WebView로 여는 구조다.

- Capacitor 설정: capacitor.config.json
- Android 프로젝트: android/
- Google Play 브리지: android/app/src/main/java/com/luna/app/iap/LunaIapPlugin.java

초기 준비 및 동기화:

```bash
npm install
npm run cap:sync
```

디버그 빌드:

```bash
cd android
gradlew.bat assembleDebug
```

Google Play용 AAB 빌드:

```bash
npm run android:play:bundle
```

버전까지 올린 뒤 Google Play용 AAB 준비:

```bash
npm run android:play:prepare
```

자동 업데이트 배포:

```bash
npm run deploy:prod:android
```

참고:

- `scripts/patch-capacitor-java.cjs` 가 Capacitor Gradle 파일을 Java 17 기준으로 보정한다.
- 디버그 APK 출력은 `android/app/build/outputs/apk/debug/app-debug.apk`.
- Play Store 업로드용 AAB 출력은 `android/app/build/outputs/bundle/release/app-release.aab`.
- `src/config/android-update.json` 이 웹 업데이트 안내와 Android `versionCode` / `versionName` 의 공통 기준이다.
- `npm run deploy:prod:android` 는 버전을 올리고 APK를 `public/downloads/luna-android-latest.apk` 로 게시한 뒤 웹까지 프로덕션 배포한다.
- Play Store 릴리스 서명과 등록 절차는 [docs/google-play-release.md](docs/google-play-release.md) 를 따른다.
- 결제 브리지 계약과 QA 기준은 [docs/android-native-iap-bridge.md](docs/android-native-iap-bridge.md), [docs/admin-iap-sandbox-qa-log.md](docs/admin-iap-sandbox-qa-log.md) 를 따른다.

