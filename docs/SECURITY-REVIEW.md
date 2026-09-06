# 보안 검토 및 수정 — 2026-09-06

인증·부원/관리자 권한, 포털의 저장 데이터 렌더링, 출석 무결성, 크롤러 자격 증명 경계를 검토했다. 초기 Codex Security 표준 스캔은 수정 전 작업 트리를 대상으로 완료했으며, 전체 저장소에 대한 전수 검사는 아니다. 이후 변경된 포털·크롤러 소스를 별도로 검토하고 Firestore 규칙은 실제 로컬 에뮬레이터로 검증했다.

## 초기 발견과 수정

| 발견 | 초기 위험도 | 수정과 확인 |
| --- | --- | --- |
| 가입 대기자의 표시명, 부원 사진 URL, 메시지 문서 ID가 HTML 속성·인라인 이벤트에 삽입되는 저장형 XSS | 높음 | `portal.js`의 동적 화면을 DOM 생성, `textContent`, 속성/프로퍼티 대입과 이벤트 리스너로 변경했다. 관리자 이름 입력, 채팅·부원 사진, 문서 삭제, 공지·기회 표시에서 값이 실행 코드로 해석되는 경로를 제거했다. 아바타는 HTTPS URL만 허용한다. 최종 소스에서 수정된 경로를 확인했다. |
| 부원이 임의 문서 ID, 과거·미래 날짜, 조작된 타임스탬프로 출석을 만들 수 있음 | 낮음 | 서버가 계산한 서울 날짜와 `uid_YYYY-MM-DD` ID를 요구하고 `createdAt == request.time`을 검증한다. 타인의 UID, 중복용 ID, 과거 날짜, 위조 시간, 기존 출석의 부원 수정을 거부하는 에뮬레이터 테스트를 통과했다. |

추가로 가입 대기자 정보는 본인과 관리자만 읽도록 제한했다. 표시명·사진 URL·채팅의 타입/길이 및 서버 타임스탬프를 검증하고, 아직 존재하지 않는 본인의 오늘 출석 문서를 조회할 수 있게 수정했다. 가입 승인과 권한 회수는 실시간 프로필 구독에 반영되고, 로그아웃·계정 변경·권한 변경 시 비공개 화면과 구독을 정리한다.

크롤러는 공개 수집과 Firebase 발행을 분리했다. 공개 수집에는 인증 정보가 필요 없으며 HTTPS 출처·리디렉션을 제한하고 응답 크기·재시도를 제한한다. 선택적 DB 발행은 명시한 프로젝트와 일치하는 서비스 계정만 사용하고 기본 동작은 미리보기다. 자동 수집 레코드의 소유권을 트랜잭션 안에서 다시 확인하며 부원 게시물을 덮어쓰거나 문서를 삭제하지 않는다. 기존 Firebase CLI 로그인 토큰 자동 재사용은 제거됐다.

## 실행한 검증

`tests/firestore.rules.test.mjs`의 6개 테스트가 모두 통과했다. 테스트는 승인·거부 결과를 실제 Firestore 규칙 엔진에서 확인한다.

1. 신규 가입의 UID·이메일·초기 권한·타입·서버 시간 검증
2. 자기 프로필 수정 허용과 관리자 권한 상승·역할·시간 위조 차단
3. 가입 대기자 정보 비공개 및 승인된 부원 목록 쿼리 허용
4. 채팅의 승인 여부·작성자·길이·사진 URL·서버 시간 검증
5. 최초 출석 조회, 오늘의 단일 출석 허용, 중복·소급·시간 위조 차단
6. 공지·기회·권한 변경의 관리자 전용 처리와 회수된 계정 접근 차단

검증 환경은 Node.js 24.15.0, Java 21, 공식 Firestore Emulator 1.21.0이었다. 에뮬레이터 JAR의 SHA-256은 Firebase CLI 배포 메타데이터의 값과 일치했다. 한국어 Java 로케일에서는 에뮬레이터의 오류 메시지 리소스가 누락되어 일부 쿼리가 500을 반환하므로 재현 명령에서 영어 로케일을 지정한다. `git diff --check`와 테스트 파일의 JavaScript 구문 검사도 통과했다.

### 재현 방법

Java 21과 Node.js 24를 준비한다. 테스트는 별도의 npm 패키지나 Firebase 로그인·실제 프로젝트 자격 증명을 요구하지 않는다. 저장소 루트에서 공식 에뮬레이터를 임시 디렉터리에 내려받는다.

```sh
curl --fail --location \
  --output /tmp/nextwave-firestore-emulator.jar \
  https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.21.0.jar
shasum -a 256 /tmp/nextwave-firestore-emulator.jar
```

예상 SHA-256: `c3d3680a89d946a90a027365ea14c26c6472a162bcf37f099bbb1ebd66d25e8e`

첫 터미널에서 격리된 데모 에뮬레이터를 실행한다.

```sh
java -Duser.language=en -Duser.country=US \
  -jar /tmp/nextwave-firestore-emulator.jar \
  --host 127.0.0.1 --port 8187 \
  --project_id demo-nextwave-security \
  --single_project_mode --single_project_mode_error \
  --rules "$PWD/firestore.rules"
```

다른 터미널에서 저장소 루트의 테스트를 실행한다.

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8187 \
  node --test tests/firestore.rules.test.mjs
```

테스트는 루프백 호스트만 허용하고 `demo-nextwave-security` 프로젝트만 사용한다. 고유한 테스트 데이터를 에뮬레이터에 생성하며 운영 데이터에는 접근하지 않는다. 완료 후 첫 터미널에서 에뮬레이터를 종료한다.

## 남은 범위와 운영 반영

- 이 작업에서 운영 Firebase 규칙 배포, 서비스 계정/IAM 설정 변경, 실제 데이터 삭제·발행은 실행하지 않았다. 운영 보호는 검증된 `firestore.rules`가 해당 Firebase 프로젝트에 배포된 후 적용된다.
- 실제 Google 로그인 팝업, 승인된 실제 계정의 브라우저 세션, 배포 도메인 허용 설정은 이 보안 검토에서 검증하지 않았다. 로컬 규칙 테스트는 이 연결 상태를 보증하지 않는다.
- 저장형 XSS 수정은 소스 경로를 재검토했다. 실제 사용자 데이터에 공격 문자열을 저장하거나 운영 관리자 세션에서 실행하는 검증은 하지 않았다.
- 외부 Firebase SDK 내부, 이미지·CSS·3D 시각화 전체, 운영 CSP/TLS와 IAM은 이번 범위 밖이다. 초기 스캔의 토큰 사용량은 호스트에서 제공되지 않았다.

규칙의 날짜 계산과 타입 검증에는 Firebase의 [Timestamp 참조](https://firebase.google.com/docs/reference/rules/rules.Timestamp), [String 참조](https://firebase.google.com/docs/reference/rules/rules.String), [필드 접근 제어 문서](https://firebase.google.com/docs/firestore/security/rules-fields)를 참고했다.
