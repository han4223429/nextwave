# Design System — NextWave (Bright · Friendly · Future)

> 2026 리디자인. 기존 "터미널/브루탈리스트" 컨셉을 대체합니다.
> 목표: **누구나 다가오기 쉬운(친근)** + **IT 동아리다운 미래지향(3D)** + **진짜 성과로 신뢰**.

## 1. 톤 & 무드
밝은 배경 위 생기 있는 컬러, 둥근 모서리, 부드러운 그림자, 넉넉한 여백.
히어로의 3D 워드마크로 "미래지향" 인상을 주되, 본문은 따뜻하고 읽기 쉽게.

## 2. 컬러
| 토큰 | 값 | 용도 |
|---|---|---|
| `brand` | `#5b6cff` | 메인(인디고-블루) |
| `brand-dark` | `#4338ca` | 강조 텍스트/호버 |
| `brand-light` | `#eef0ff` | 옅은 배경/칩 |
| `accent` | `#ff6b6b` | 포인트(코랄) |
| `mint` | `#18c29c` | 보조(민트) |
| `amber` | `#ffb020` | 수상/하이라이트 |
| `ink` | `#1a1c2e` | 본문 텍스트 |
| `muted` | `#5b6178` | 보조 텍스트 |
| 배경 | `#fbfbff` | 페이지 바탕 |

그라데이션: `brand → #8b5cf6 → accent` (텍스트 `.text-gradient`, 버튼 `.btn-primary`).
배경 오로라: 화면 뒤 은은한 컬러 블롭 3개(`.aurora`).

## 3. 타이포그래피
- **Pretendard Variable** — 본문/제목 전반 (한글 가독성).
- **JetBrains Mono** — 라벨/뱃지/작은 기술 텍스트(`.font-mono`)로 IT 느낌의 악센트.
- 제목은 `font-extrabold`, `tracking-tight`. 본문은 `leading-relaxed`.

## 4. 컴포넌트
- **카드**: `.card`(반투명 글래스 + 부드러운 그림자), 호버 시 `.card-hover`로 살짝 떠오름.
- **버튼**: `.btn-primary`(그라데이션) / `.btn-ghost`(아웃라인). 둥근 `rounded-2xl`.
- **칩/뱃지**: `.pill` + `brand-light`/`white/15`.
- **아이콘**: Material Symbols Rounded + 친근한 이모지.
- 둥근 모서리 적극 사용(`rounded-2xl`/`3xl`/`4xl`). 0px 직각 금지(과거 컨셉과 반대).

## 5. 모션
- 스크롤 등장(`.reveal`), 숫자 카운트업(`[data-count]`), 마퀴 리본(`.marquee`), 둥둥(`.floaty`).
- **3D 히어로**: 글자별 회전(시간+스크롤+마우스). `three-hero.js`.
- `prefers-reduced-motion` 존중 — 모든 애니메이션/3D 회전 자동 정지.

## 6. 다국어
`data-i18n` 속성 + `i18n.js` 사전(ko/en). 🌐 버튼으로 전환, 선택 저장.

## 7. 원칙 (Do / Don't)
**Do** — 진짜 콘텐츠(수상·운영진·활동)를 앞세운다 · 명확한 가입 동선(지원하기 CTA 반복) · 따뜻하고 환영하는 문장.
**Don't** — 가짜 데이터/지표 · 위압적·배타적 표현 · 가독성을 해치는 과한 효과.
