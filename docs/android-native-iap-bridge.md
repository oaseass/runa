# Android Native IAP Bridge Contract

이 문서는 LUNA 웹앱과 Android 네이티브 컨테이너 사이의 결제 브리지 계약이다.
현재 웹앱 쪽 구현은 완료되어 있고, Android 쪽은 이 계약을 그대로 구현하면 된다.

현재 저장소에는 실제 Capacitor Android 셸이 포함되어 있다.

- Android 프로젝트: android/
- 브리지 구현: android/app/src/main/java/com/luna/app/iap/LunaIapPlugin.java
- 앱 진입점 등록: android/app/src/main/java/com/luna/app/MainActivity.java
- Capacitor 설정: capacitor.config.json, capacitor.config.ts
- 원격 앱 URL: https://runa.co.kr

## 목적

- 앱 안에서는 웹 결제가 아니라 Google Play 결제를 실행한다.
- 구매 성공 후 웹앱은 /api/iap/google로 검증하고 entitlement와 주문 전달을 마무리한다.
- 실패와 복원도 analytics에 같은 이름으로 남긴다.

## 브리지 이름

둘 중 하나만 구현되어도 된다.

- window.Capacitor.Plugins.LunaIap
- window.LunaNativeIap

웹앱은 Capacitor plugin을 먼저 찾고, 없으면 window.LunaNativeIap를 fallback으로 사용한다.

## purchase 메서드

시그니처:

```ts
purchase(input: {
  skuId: string
  platform: "android" | "ios"
  productId: string
  basePlanId?: string
  isSubscription: boolean
  orderId?: string
}): Promise<AndroidPurchaseResult | ApplePurchaseResult | string>
```

Android 입력 예시:

```json
{
  "skuId": "vip_monthly",
  "platform": "android",
  "productId": "luna_vip",
  "basePlanId": "monthly",
  "isSubscription": true,
  "orderId": "6d3d6e5e-..."
}
```

Android 반환 형식:

```json
{
  "productId": "luna_vip",
  "purchaseToken": "gp_purchase_token_here",
  "packageName": "com.luna.app"
}
```

주의:

- purchaseToken은 반드시 실제 Google Play purchase token이어야 한다.
- productId는 Google Console 상품 ID와 동일해야 한다.
- subscription 상품이면 basePlanId는 monthly 또는 yearly여야 한다.
- 문자열 JSON으로 반환해도 되지만, object 반환이 더 안전하다.

## restore 메서드

시그니처:

```ts
restore(input: {
  platform: "android" | "ios"
}): Promise<AndroidRestoreResult | AppleRestoreResult | string>
```

Android 반환 형식:

```json
{
  "purchases": [
    {
      "productId": "luna_vip",
      "purchaseToken": "gp_purchase_token_here",
      "isSubscription": true
    },
    {
      "productId": "luna_void_single",
      "purchaseToken": "gp_purchase_token_here",
      "isSubscription": false
    },
    {
      "productId": "luna_void_pack3",
      "purchaseToken": "gp_purchase_token_here",
      "isSubscription": false
    }
  ]
}
```

주의:

- 웹앱은 이 payload를 /api/iap/restore로 그대로 넘긴다.
- restore는 이미 처리된 영수증이어도 idempotent하게 동작한다.

## 웹앱이 기대하는 서버 후처리

purchase 성공 뒤 웹앱은 /api/iap/google에 아래 body를 보낸다.

```json
{
  "productId": "luna_vip",
  "purchaseToken": "gp_purchase_token_here",
  "orderId": "6d3d6e5e-...",
  "isSubscription": true
}
```

서버는 아래를 수행한다.

- Google Play 검증
- subscription은 acknowledge
- void_pack 계열은 consume
- non-consumable one-time 상품은 acknowledge
- entitlement 반영
- orderId가 있으면 주문 paid 처리
- annual_report면 reportJson 생성
- void_single / void_pack 계열이면 VOID 진입 경로 반환
- redirectTo 반환

## 현재 운영 가격 정책

- VOID 1회권: 500원
- VOID 3회권: 1500원
- VOID 10회권: 5000원
- 연간 리포트: 3000원
- 영역 보고서: 3000원
- VIP 월간: 9900원
- VIP 연간: 79000원
- VIP 월간/연간 모두 매월 1일 KST 기준 VOID 30회 크레딧 지급
- VIP 월 크레딧은 이월되지 않음

성공 응답 예시:

```json
{
  "ok": true,
  "skuId": "vip_monthly",
  "redirectTo": "/home",
  "entitlement": {
    "isVip": true,
    "voidCredits": 0,
    "annualReportOwned": 0,
    "areaReportsOwned": 0
  }
}
```

## redirectTo 규칙

- vip_monthly, vip_yearly: /home
- annual_report: /store/report/:orderId
- area_reading: /store/report/:orderId
- void_single, void_pack_3, void_pack_10: /void

## analytics 이벤트

웹앱은 아래 이벤트를 자동 기록한다.

- native_iap_purchase_started
- native_iap_purchase_verified
- native_iap_purchase_failed
- native_iap_restore_started
- native_iap_restore_completed
- native_iap_restore_failed
- native_iap_bridge_missing

Android QA에서는 recent events에 위 이벤트와 Google IAP 검증 결과가 같은 흐름으로 찍혀야 한다.

## Android 구현 체크리스트

- Google Play Billing에서 subscription과 inapp 상품 조회 가능
- purchaseToken 추출 가능
- luna_vip는 monthly/yearly base plan 구분 가능
- restore 시 owned purchase 목록 반환 가능
- 브리지 결과를 object 또는 JSON string으로 반환 가능
- 실패 시 reject 또는 명확한 error message 반환

현재 저장소 기준 완료 상태:

- purchase 구현 완료
- restore 구현 완료
- Capacitor plugin name = LunaIap 등록 완료
- server.url 기반 원격 WebView 셸 구성 완료
- Google Play 서버 acknowledge / consume 후처리 연결 완료

## SKU 매핑

Android Google Play 상품 ID는 아래로 고정한다.

- vip_monthly, vip_yearly -> luna_vip
- annual_report -> luna_annual_report
- area_reading -> luna_area_reading
- void_single -> luna_void_single
- void_pack_3 -> luna_void_pack3
- void_pack_10 -> luna_void_pack10

Apple 상품 ID는 아래로 고정한다.

- vip_monthly -> com.luna.vip.monthly
- vip_yearly -> com.luna.vip.yearly
- annual_report -> com.luna.report.annual
- area_reading -> com.luna.report.area
- void_single -> com.luna.void.single
- void_pack_3 -> com.luna.void.pack3
- void_pack_10 -> com.luna.void.pack10

basePlanId:

- vip_monthly -> monthly
- vip_yearly -> yearly

## 실기기 QA 최소 시나리오

- vip_monthly 구매 후 /home 이동, /api/user/status isVip=true
- annual_report 구매 후 /store/report/:orderId 렌더링
- void_single 구매 후 /void 이동, voidCredits 1 증가
- void_pack_3 구매 후 /void 이동, voidCredits 증가
- restore 후 상태 즉시 반영

## 로컬 Android 빌드

저장소 루트에서 아래 순서로 실행한다.

```bash
npm install
npm run cap:sync
cd android
gradlew.bat assembleDebug
```

참고:

- 이 저장소는 원격 Next 앱을 WebView로 여는 구조라 `native-shell/`은 placeholder만 가진다.
- Capacitor가 일부 Gradle 파일을 Java 21로 생성하므로 `scripts/patch-capacitor-java.cjs`가 Java 17로 자동 보정한다.
- 디버그 APK 출력 경로는 `android/app/build/outputs/apk/debug/app-debug.apk` 이다.

세부 운영 로그 템플릿은 [docs/admin-iap-sandbox-qa-log.md](docs/admin-iap-sandbox-qa-log.md)를 따른다.