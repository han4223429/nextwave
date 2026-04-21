# NextWave Firebase 로그인/관리자 설정 가이드

이 프로젝트는 정적 사이트에서 Firebase 인증 + Firestore로 멤버/관리자 권한을 분기합니다.

## 1) Firebase 웹 설정 연결

1. Firebase 콘솔에서 프로젝트를 생성하고 **웹 앱** 등록
2. 아래 값들을 얻어서 `firebase.config.js`(권장) 또는 `index.html`의 `portalConfig`에 넣기
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

이 레포에 `/.github/workflows/deploy-pages.yml`이 추가되어 있습니다.
- main 브랜치 push 시 자동 배포
- `Settings > Pages`에서 Source를 `GitHub Actions`로 설정하면 배포가 동작합니다.
