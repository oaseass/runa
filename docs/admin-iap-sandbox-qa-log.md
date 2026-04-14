# Admin IAP Sandbox QA Log

실기기 샌드박스 결제는 로컬 환경으로 대체할 수 없다.
이 문서는 iPhone / Android 실기기에서 스토어 결제를 수행한 뒤, 결제 이벤트가 entitlement와 사용자 화면, 관리자 ops 탭까지 한 번에 이어지는지 남기는 운영 QA 기록이다.

네이티브 브리지 구현 기준은 [docs/android-native-iap-bridge.md](docs/android-native-iap-bridge.md)를 따른다.

## 검증 근거

지금 확인해야 하는 축은 아래로 고정한다.

- 결제 이벤트: Apple / Google 샌드박스 구매 이벤트 수신, 최근 IAP 이벤트 로그 반영
- 브리지 이벤트: native_iap_purchase_started / native_iap_purchase_verified / native_iap_purchase_failed / native_iap_restore_completed
- 권한/상태 반영: /api/user/status, Shop CTA, VIP 배지, VOID 크레딧, /me
- 운영 검수: ops 탭 IAP QA 체크리스트, mismatch 0, pending 0, entitlement 연결 정상

즉 이제는 기능 존재 여부가 아니라, 실제 결제 후 전파가 한 번에 이어지는지를 검증한다.

## QA 순서

### A. iPhone 샌드박스 결제

- 테스트 계정 로그인
- VIP 월간 구매

확인할 것:

- Shop에서 VIP CTA가 구매 완료 상태로 바뀌는지
- 우측 상단 VIP 배지가 즉시 노출되는지
- /me에서 VIP 상태가 반영되는지
- /api/user/status에서 isVip=true인지
- ops 탭 최근 IAP 이벤트에 Apple 이벤트가 찍히는지
- mismatch 0 / pending 0이 유지되는지

### B. Android 샌드박스 결제

- 테스트 계정 로그인
- VOID 3회권 또는 10회권 구매

확인할 것:

- Shop에서 VOID 크레딧 팩 상태가 반영되는지
- /api/user/status에 voidCredits가 증가하는지
- /void 진입 시 크레딧 표시 / 차감이 정상인지
- ops 탭 최근 IAP 이벤트에 Google 이벤트가 찍히는지
- mismatch 0 / pending 0이 유지되는지

### C. 추가 시나리오

- restore purchases
- VIP 만료 후 상태 반영
- VOID 1회 사용 후 즉시 차감
- annual report / area reading 구매 후 게이팅 해제

## 케이스 로그 템플릿

각 케이스마다 아래 블록을 그대로 복제해서 사용한다.

## [플랫폼] [상품명] [날짜/시간]

- 계정:
- 상품:
- 결제 성공 여부:
- recent IAP event 표시:
- /api/user/status 반영:
- Shop CTA 반영:
- VIP 배지 / VOID 크레딧 반영:
- mismatch / pending:
- 비고:
- 캡처:

## 케이스 기록

### iPhone VIP 월간

## [iPhone] [VIP 월간] [YYYY-MM-DD HH:mm]

- 계정:
- 상품: VIP 월간
- 결제 성공 여부:
- recent IAP event 표시:
- /api/user/status 반영:
- Shop CTA 반영:
- VIP 배지 / VOID 크레딧 반영:
- mismatch / pending:
- 비고:
- 캡처:

### Android VOID 팩

## [Android] [VOID 3회권 또는 10회권] [YYYY-MM-DD HH:mm]

- 계정:
- 상품:
- 결제 성공 여부:
- recent IAP event 표시:
- /api/user/status 반영:
- Shop CTA 반영:
- VIP 배지 / VOID 크레딧 반영:
- mismatch / pending:
- 비고:
- 캡처:

### restore purchases

## [공통] [restore purchases] [YYYY-MM-DD HH:mm]

- 계정:
- 상품:
- 결제 성공 여부:
- recent IAP event 표시:
- /api/user/status 반영:
- Shop CTA 반영:
- VIP 배지 / VOID 크레딧 반영:
- mismatch / pending:
- 비고:
- 캡처:

### VIP 만료 후 상태 반영

## [공통] [VIP 만료 후 상태 반영] [YYYY-MM-DD HH:mm]

- 계정:
- 상품:
- 결제 성공 여부:
- recent IAP event 표시:
- /api/user/status 반영:
- Shop CTA 반영:
- VIP 배지 / VOID 크레딧 반영:
- mismatch / pending:
- 비고:
- 캡처:

### VOID 1회 사용 후 즉시 차감

## [공통] [VOID 1회 사용] [YYYY-MM-DD HH:mm]

- 계정:
- 상품:
- 결제 성공 여부:
- recent IAP event 표시:
- /api/user/status 반영:
- Shop CTA 반영:
- VIP 배지 / VOID 크레딧 반영:
- mismatch / pending:
- 비고:
- 캡처:

### annual report / area reading 게이팅 해제

## [공통] [annual report / area reading] [YYYY-MM-DD HH:mm]

- 계정:
- 상품:
- 결제 성공 여부:
- recent IAP event 표시:
- /api/user/status 반영:
- Shop CTA 반영:
- VIP 배지 / VOID 크레딧 반영:
- mismatch / pending:
- 비고:
- 캡처:

## ops 탭 확인 포인트

- recent events
- native_iap_* 이벤트와 실제 결제 결과가 같은 타임라인으로 남는지
- mismatch 0
- pending 0
- entitlement 연결 정상

## 사용자 화면 확인 포인트

- /api/user/status
- Shop CTA
- VIP 배지
- VOID 크레딧
- /me
- /void

## 합격 기준

- recent IAP event 정상 기록
- mismatch 0
- pending 0
- 구매 후 1분 내 상태 반영
- 사용자 화면과 admin ops 탭이 같은 진실을 보여줌

## 최종 판정

- iPhone: Pass / Fail
- Android: Pass / Fail
- restore purchases: Pass / Fail
- VIP 만료 반영: Pass / Fail
- VOID 차감: Pass / Fail
- annual report / area reading: Pass / Fail
- 공통 이슈:
- 후속 조치: