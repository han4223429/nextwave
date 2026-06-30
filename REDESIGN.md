# NextWave 사이트 개편 안내 (2026 리디자인)

기존 "터미널/해커" 컨셉을 **밝고 친근한 + 미래지향 3D** 디자인으로 전면 개편했습니다.
가짜 콘텐츠(가짜 CPU 모니터·가짜 프로젝트·가짜 좌표 등)는 제거하고, **진짜 수상·활동·운영진**을 앞세웠어요.

## ✨ 새로 추가된 것

- **시네마틱 스크롤 3D `NEXTWAVE` 히어로** — 애플/삼성 제품 페이지처럼, 스크롤하면 장면이 단계별로 바뀝니다: ① 완성된 입체 워드마크 → ② 글자들이 폭발하듯 흩어져 이리저리 떠다님 → ③ 다시 모여 재조립. 각 단계마다 하단 캡션이 교체돼요(헤드라인 → 활동 → CTA). (데스크톱 1줄 / 모바일 2줄, WebGL 미지원 시 정적 히어로로 자동 폴백)
- **한국어 / English 전환** — 헤더와 모바일 메뉴의 🌐 버튼. 선택은 브라우저에 저장돼요.
- **FAQ 아코디언, 스크롤 등장 애니메이션, 숫자 카운트업, 맨 위로 버튼, 모집 단계(1·2·3) 안내** 등 신규 섹션/인터랙션.
- **운영진 프로필 모달**(카드 클릭) — 한/영 약력 모두 지원.
- Firebase **로그인 / 부원 승인 / 관리자 패널 / 공지**는 그대로 유지(스타일만 새로).
- **부원 포털(`portal.html`)도 홈과 동일한 밝은 디자인으로 전면 리스킨** — 로그인·채팅·공지·출석·부원명단·기회정보·관리자 전 화면. `portal.css`의 `--p-*` 변수를 홈 팔레트로 리매핑해 `portal.js`가 동적으로 만드는 요소까지 자동 반영. (캐시 무효화를 위해 `portal.html`에서 `portal.css?v=...` 쿼리 사용 — CSS 수정 후 숫자만 올리면 됨)

## 🔧 직접 채워야 하는 설정 (중요)

`script.js` 맨 위 `window.NEXTWAVE_SITE` 값만 채우면 버튼이 자동 연결됩니다.

```js
window.NEXTWAVE_SITE = {
    applyUrl: '',   // 지원서 링크(구글폼·노션). 비우면 '지원하기'가 모집 안내로 스크롤
    instagram: '',  // 인스타그램 URL (비우면 푸터 버튼 숨김)
    email: '',      // 문의 이메일 (비우면 숨김)
    kakaoUrl: ''    // 카카오 오픈채팅 링크 (비우면 숨김)
};
```

> 예) `applyUrl: 'https://forms.gle/xxxx'`, `instagram: 'https://instagram.com/...'`

## 📝 텍스트 / 번역 수정

모든 문구는 `i18n.js`의 사전에서 관리됩니다. `dict.ko`(한국어)와 `dict.en`(영어)에서
같은 키의 값을 고치면 화면에 바로 반영돼요. HTML 요소의 `data-i18n="키"`가 해당 값과 연결됩니다.

- 수상/활동/FAQ 내용 등은 `index.html`에서 직접 고쳐도 되고, 양 언어를 유지하려면 `i18n.js`에서 고치세요.
- 운영진 약력 영어판은 카드의 `data-bio-en` / `data-role-en` 속성에 있어요.

## 🎨 시네마틱 히어로 커스터마이즈 (`three-hero.js` + `index.html`)

- 색상: `palette` 배열 (글자별 색).
- 스크롤 길이(연출이 길수록 천천히): `index.html`의 `#hero-stage` `height:340vh` 값.
- 단계 타이밍: `applyFrame()`의 `e = smooth(0.36,0.60,p) - smooth(0.72,0.94,p)` (폭발 시작/끝 지점).
- 캡션 등장 구간: `index.html` 각 `.hero-cap`의 `data-from` / `data-to` (0~1 스크롤 진행도).
- 흩어짐 범위/속도: 글자 `userData.ex`(목표 위치·회전), `s1~s3`(속도), 떠다님 진폭.
- 글자 크기/두께: `TextGeometry`의 `size` / `height` / `bevel*`.
- 모바일 2줄 전환 기준: `layout()`의 `w < 720`.

## ▶️ 로컬에서 보기

```bash
cd nextwave
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

## 🗂️ 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 메인 랜딩 (구조 + Firebase 인증 스크립트) |
| `styles.css` | 커스텀 스타일·애니메이션 (Tailwind는 CDN) |
| `script.js` | UI 인터랙션 + 사이트 설정(`NEXTWAVE_SITE`) |
| `i18n.js` | 한/영 번역 사전 + 전환 |
| `three-hero.js` | 3D NEXTWAVE 히어로 (Three.js, ES module) |
| `portal.html` | 부원 전용 포털 (밝은 테마로 리스킨) |
| `portal.css` | 포털 스타일 (홈 디자인 시스템, `--p-*` 변수) |
| `portal.js` | 포털 로직 (기존 유지) |
| `*.terminal.backup.*` | 개편 전 원본 백업 (필요 없으면 삭제 가능) |

## ↩️ 되돌리기

- 백업 파일로: `cp index.terminal.backup.html index.html` (css/js도 동일)
- 또는 git으로: `git checkout index.html styles.css script.js`

## 🚀 배포

GitHub `main`에 push하면 GitHub Pages로 배포됩니다(도메인 `wenw.ceo`).
3D·번역 라이브러리는 CDN(jsDelivr)에서 로드되므로 별도 빌드가 필요 없어요.

## ⚙️ 참고

- Tailwind는 Play CDN을 사용해 빌드 단계가 없습니다(콘솔의 "should not be used in production" 경고는 정상). 트래픽이 커지면 Tailwind CLI 빌드로 전환을 권장.
- `prefers-reduced-motion`(동작 줄이기) 설정 사용자는 3D 회전·애니메이션이 자동으로 정지됩니다(접근성).
