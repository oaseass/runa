# 관리자 전용 앱

목표: 같은 코드베이스에서 일반 사용자 앱과 별도로, 관리자만 설치해서 사용할 수 있는 안드로이드 전용 앱을 빌드한다.

## 현재 구성

- 일반 사용자 앱 flavor: `consumer`
  - 패키지 ID: `com.luna.app`
  - 시작 URL: `https://runa.co.kr`
- 관리자 앱 flavor: `admin`
  - 패키지 ID: `com.luna.admin`
  - 시작 URL: `https://runa.co.kr/admin/login`

관리자 앱은 기존 관리자 로그인과 동일하게 `ADMIN_USERNAME`, `ADMIN_PASSWORD` 환경 변수 검증을 사용한다.

## 빌드 명령

디버그 APK:

```bash
npm run android:admin:build
```

출력물:

- `android/app/build/outputs/apk/admin/debug/app-admin-debug.apk`
- `public/downloads/luna-admin-android-latest.apk`

로컬 기기 설치:

```bash
npm run android:admin:install
```

Play Console 업로드용 AAB:

```bash
npm run android:admin:bundle
```

내부 테스트용 임시 서명 AAB:

```bash
npm run android:admin:bundle:internal
```

출력물:

- `android/app/build/outputs/bundle/adminRelease/app-admin-release.aab`
- `public/downloads/luna-admin-internal-signed.aab`

## 운영 메모

- 관리자 앱은 별도 패키지 ID라서 일반 앱과 동시에 설치 가능하다.
- 앱 아이콘은 아직 일반 앱과 동일하다. 스토어 등록 전에 관리자 전용 아이콘으로 교체하는 것이 좋다.
- 네이티브 결제, 연락처 같은 플러그인은 그대로 포함되어 있지만 관리자 앱의 주 경로는 `/admin/login` 이하만 사용한다.
- 실제 배포 전에 Play Console에서 `com.luna.admin` 앱을 별도로 생성해야 한다.
- `android:admin:bundle:internal`은 로컬 debug keystore 서명본을 만들기 때문에 내부 테스트용으로만 사용한다.