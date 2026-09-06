# NextWave Firebase 로그인/관리자 설정 가이드

이 프로젝트는 정적 사이트에서 Firebase 인증 + Firestore로 멤버/관리자 권한을 분기합니다.

## 1) Firebase 웹 설정 연결

1. Firebase 콘솔에서 프로젝트를 생성하고 **웹 앱** 등록
2. 아래 값들을 얻어서 `firebase.config.js`에 넣기
   - apiKey
   - authDomain
   - projectId
   - storageBucket
   - messagingSenderId
   - appId

## 2) Firebase Auth 설정

- `Authentication > Sign-in method`에서 `Google` 사용 설정
- 이메일 도메인 제한이 필요하면 승인 정책 설정

## 3) Firestore 규칙 배포

`firestore.rules`를 프로젝트에 배포하세요.

- `members` 문서는 본인 UID 문서는 읽기 가능
- 관리자(`isAdmin: true`)만 권한 변경 가능

## 4) 최초 관리자 등록

첫 관리자는 다음 중 하나로 등록해야 합니다.

- Firebase 콘솔 > Firestore > `members/{uid}` 문서 생성
- 필드:
  - `uid`: 사용자 UID
  - `email`: 사용자 이메일
  - `displayName`: 표시명(선택)
  - `isMember`: true
  - `isAdmin`: true
  - `role`: "admin"

이후 사이트의 관리자 패널에서 다른 사용자 승인/회수를 처리할 수 있습니다.

## 5) GitHub Pages 배포

현재 Pages 설정은 `main` 브랜치의 `/` 루트를 배포 소스로 사용합니다.

- main 브랜치 push 시 GitHub Pages가 정적 파일을 빌드/배포합니다.
- `Settings > Pages`에서 Source가 `Deploy from a branch`, Branch가 `main / root`인지 확인하세요.
- 매시간 공고 수집 workflow는 새 JSON을 commit한 뒤 Pages 설정을 읽고, 기존 브랜치 배포(`legacy`, 기본 브랜치의 `/`)이면 빌드를 요청합니다. 별도 저장소 변수나 개인 토큰은 필요하지 않습니다. GitHub Actions 토큰의 push만으로는 Pages가 자동 빌드되지 않기 때문에 이 후속 요청을 사용합니다.
- Pages를 다른 브랜치·하위 폴더 또는 별도 배포 workflow로 바꾸면 수집 workflow가 설정을 변경하지 않고 요약에 배포 연결 필요 상태를 남깁니다. 해당 배포 경로도 새 `data/opportunities.json`을 게시하도록 연결하세요.

## 6) 로컬 실행과 사이트 설정

별도 프런트엔드 빌드 없이 실행합니다.

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

`script.js` 상단의 `NEXTWAVE_SITE`에 실제 `applyUrl`, `instagram`, `email`, `kakaoUrl`을 지정합니다. 주소가 없는 연락처는 숨기고 지원서는 준비 중 상태로 표시합니다.

운영 파일은 다음과 같습니다.

- 홈: `index.html`, `styles.css`, `script.js`, `i18n.js`
- WebGL 수면·프로젝트 체험: `kinetic.js`, `project-demo.js`, `rescue-demo.js`, `rescue-demo.css`
- 공통 물결 효과음·SOUND 설정: `water-audio.js`, `sound-ui.js`
- 포털: `portal.html`, `portal.css`, `portal.js`, `firebase.config.js`
- 공통 이미지·공개 수집본: `assets/`, `data/`

홈 수면은 `kinetic.js`가 사진·텍스처 없이 실시간 3D 메시로 생성합니다. RESCUE JET은 `assets/rescue/`의 원본 모델과 `assets/vendor/three/`의 로컬 Three.js 모듈을 클릭할 때 불러옵니다. WebGL을 사용할 수 없어도 사이트 콘텐츠와 구명장치의 원본 이미지는 볼 수 있습니다. 새 배포 시 HTML에서 참조하는 CSS/JS 버전도 함께 갱신합니다.

크롤러 설치·예약 활성화·선택적 Firestore 발행은 [docs/CRAWLER.md](docs/CRAWLER.md)를 참조하세요. 변경된 Firestore 규칙은 실제 프로젝트에 별도 배포해야 합니다. 개인 키 파일은 웹 루트 밖에 둡니다.

## 7) 커스텀 도메인 HTTPS 점검

브라우저에서 `wenw.ceo`에 `주의 요함` 또는 `ERR_CERT_COMMON_NAME_INVALID`가 뜨면 GitHub Pages가 아직 `wenw.ceo` 인증서를 내주지 못한 상태입니다.

1. `Settings > Pages > Custom domain`에 `wenw.ceo`가 등록되어 있는지 확인
2. `Enforce HTTPS`를 켜고, 인증서 발급이 `Certificate issued` 상태가 될 때까지 대기
3. DNS가 아래처럼 유지되는지 확인
   - `wenw.ceo` A: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `www.wenw.ceo` CNAME: `han4223429.github.io`
4. GitHub가 도메인 소유권 TXT 레코드를 요구하면 안내된 `_github-pages-challenge-...` TXT 값을 DNS에 추가

인증서가 발급되기 전까지는 코드가 정상이어도 HTTPS 주소창 경고가 계속 뜹니다.
