# Google Play 릴리스 준비

목표: `com.luna.app` 을 Google Play 내부 테스트/프로덕션으로 올려 Play Store 자동 업데이트 경로를 사용한다.

## 왜 필요한가

- 현재 APK 직배포는 다운로드와 설치 화면 호출까지만 자동화할 수 있다.
- Play Store 설치본이어야 안드로이드의 자동 업데이트 정책을 활용할 수 있다.

## 현재 저장소에서 준비된 것

- 패키지 ID: `com.luna.app`
- 버전 기준: `src/config/android-update.json`
- Google Billing 의존성 포함
- AAB 빌드 스크립트 추가:
  - `npm run android:play:bundle`
  - `npm run android:play:prepare`
  - 메인 앱은 `consumer` flavor 기준으로 번들 생성

## 필요한 서명 값

아래 4개 값을 Gradle property 또는 환경 변수로 제공해야 한다.

- `RELEASE_STORE_FILE`
- `RELEASE_STORE_PASSWORD`
- `RELEASE_KEY_ALIAS`
- `RELEASE_KEY_PASSWORD`

예시: `android/gradle.properties` 또는 사용자 환경 변수

```properties
RELEASE_STORE_FILE=../keystore/luna-release.jks
RELEASE_STORE_PASSWORD=***
RELEASE_KEY_ALIAS=luna
RELEASE_KEY_PASSWORD=***
```

## 로컬 빌드

버전 유지 빌드:

```bash
npm run android:play:bundle
```

내부 테스트용 임시 서명 번들:

```bash
npm run android:play:bundle:internal
```

버전 증가 후 빌드:

```bash
npm run android:play:prepare
```

출력물:

- `android/app/build/outputs/bundle/consumerRelease/app-consumer-release.aab`
- 내부 테스트용 임시 signed 복사본: `public/downloads/luna-consumer-internal-signed.aab`

## Play Console 업로드 순서

1. Play Console에서 앱 생성
2. 앱 서명 설정 확인
3. `app-release.aab` 업로드
4. 내부 테스트 트랙에 배포
5. 테스트 계정으로 설치 확인
6. 인앱 결제 상품과 앱 버전 연결 점검
7. 프로덕션 승격

## 주의

- 한번 Play Store에 올린 `applicationId` 와 서명 키는 장기적으로 유지해야 한다.
- 직배포 APK와 Play Store 설치본은 업데이트 경로가 다르다. 자동 업데이트를 원하면 Play Store 설치본으로 전환해야 한다.
- 네이티브 코드 수정(예: 하드웨어 뒤로가기)은 웹 배포만으로 반영되지 않으므로, 새 AAB/APK 배포가 필요하다.
- 관리자 전용 앱은 별도 flavor(`admin`)로 분리되며 `com.luna.admin` 패키지로 따로 설치할 수 있다.
- `android:play:bundle:internal`은 로컬 debug keystore로만 서명한다. 내부 테스트용 임시 우회이며 장기 운영용 업로드 키를 대체하지 않는다.