# LUNA 개인화 파이프라인 감사 보고서

> 마지막 업데이트: 2025년 (이 파일은 자동 생성됨)

---

## 요약

모든 결과 페이지가 사용자의 실제 출생 데이터 + 실시간 천문학 엔진에서 파생되도록 전면 감사 및 수정 완료.

**이전 상태:**
- `/calendar` — LCG 해시(birthday 무관, 날짜만으로 세팅)
- `/best-days` — 하드코딩된 정적 배열 ("MAR 28", "APR 2"...)
- `/home` 베스트 데이 섹션 — `(d * 7 + m * 13) % 10` 날짜 산술

**현재 상태:**
- 위 3개 모두 `interpretDomains(natalChart, date)` 기반 실제 트랜짓 점수로 교체됨

---

## 페이지별 분류

| 경로 | 상태 | 주석 |
|------|------|------|
| `/home` | ✅ 완전 개인화 | `interpretTransits` + `interpretDomains` → API |
| `/home/detail/*` | ✅ 완전 개인화 | 도메인별 상세 리딩 |
| `/insight/today` | ✅ 완전 개인화 | 날짜별 트랜짓 해석 |
| `/me` | ✅ 완전 개인화 | 출생 차트 해석 |
| `/me?tab=chart` | ✅ 완전 개인화 | 행성 위치 시각화 |
| `/void/*` | ✅ 완전 개인화 + qSeed | 질문별 차별화 |
| `/void/result/[id]` | ✅ 완전 개인화 | 항상 재분석 버튼 표시 |
| `/connections` | ✅ 완전 개인화 | 시나스트리 에너지 연결 |
| `/calendar` | ✅ **수정됨** | `scoreMonthDays()` → API 기반 |
| `/best-days` | ✅ **수정됨** | `getPersonalizedBestDays()` → API 기반 |

---

## 엔진 아키텍처

```
출생 데이터 (birth_date/time/place)
    ↓
computeNatalChart()          — astronomy-engine 행성 위치
    ↓
computeTransitPositions()    — 선택 날짜의 행성 위치
    ↓
interpretTransits(chart, date) → TransitInterpretation
    - headline, lede, dos, donts, activeAspects
interpretDomains(chart, date)  → DomainReading[4]
    - 관계 / 루틴·일 / 사고·표현 / 감정·내면
    - tone: strength | challenge | neutral
```

---

## 새로 추가된 함수 및 API

### `chart-store.ts`
| 함수 | 설명 |
|------|------|
| `scoreMonthDays(userId, year, month)` | 해당 월 전체 일자별 DayScore[] 반환 |
| `getPersonalizedBestDays(userId, count, daysAhead)` | 향후 N일 중 점수 상위 일자 반환 |

### 새 API 라우트
| 경로 | 설명 |
|------|------|
| `GET /api/chart/month?year=YYYY&month=M` | 월별 DayScore[] |
| `GET /api/chart/best-days?count=10&daysAhead=45` | 개인화 베스트 데이 BestDay[] |

---

## 점수 계산 공식

| 도메인 톤 | 점수 |
|----------|------|
| strength | 2점 |
| neutral  | 1점 |
| challenge| 0점 |
| 최대     | 8점 |

`score = Math.round((pts / 8) * 100)`

- `score ≥ 75` → ⭐ 아이콘 추가
- 도메인 아이콘: 관계→♡, 루틴·일→★, 사고·표현→💬, 감정·내면→✦

---

## Phase 6 테스트 결과

```
npx tsx --test src/lib/astrology/__tests__/personalization-audit.ts

✔ Personalization: Calendar (day scores) — 3/3
✔ Personalization: Single-day interpretation — 2/2
✔ Personalization: Best days — 1/1
✔ Personalization: qSeed — void analysis variation — 2/2
✔ Regression: no all-identical month — 1/1

tests 9 | pass 9 | fail 0
```

모든 테스트 통과. 다른 사용자는 같은 날 다른 결과를 받고, 같은 사용자는 다른 달에 다른 결과를 받는다.
