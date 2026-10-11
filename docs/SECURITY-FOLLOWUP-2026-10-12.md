# NextWave 보안 후속 확인 — 2026-10-12 KST

이 문서는 `fc0bb6c` 배포 후 저장소 코드와 공개 화면을 대상으로 한 **범위가 제한된 확인**이다. 전체 보안 감사의 통과 판정이 아니다. 운영 Firebase 권한이나 타인 데이터는 조회·변경하지 않았다.

## 확인한 경계

| 영역 | 코드·설정에서 확인한 내용 | 근거 |
| --- | --- | --- |
| 로그인과 회원 권한 | Google ID 토큰은 Firebase `signInWithCredential`로 검증하며, 콜백 값만으로 회원·관리자 권한을 부여하지 않는다. 신규 프로필은 본인 UID·이메일로 `pending`, `isMember=false`, `isAdmin=false`만 생성할 수 있고, 자기 수정으로 권한 필드를 바꿀 수 없다. | `portal.js`의 `initGoogleIdentity`, `handleSignedIn`; `firestore.rules`의 `isSelfCreatedPendingMember`, `isSafeSelfProfileUpdate`; `tests/portal-auth.test.cjs` |
| 비공개 데이터와 관리자 경로 | 메시지·공지·기회 정보 읽기는 승인된 부원, 공지·기회 쓰기와 회원 권한 변경은 관리자만 가능하다. 대기자 프로필은 본인과 관리자만 읽는다. 출석은 서버 기준 서울 날짜와 본인 UID로 제한된다. 클라이언트도 관리자 탭을 막고 권한 변경·로그아웃 시 비공개 구독과 화면을 정리하지만, 실제 강제 경계는 배포된 Firestore 규칙이다. | `firestore.rules`; `portal.js`의 `activateTab`, `stopPrivateData`, `listen`, `adminAction` |
| 공개 설정과 비밀정보 | `firebase.config.js`는 웹 앱 식별용 Firebase 설정 및 공개 Google 웹 클라이언트 ID다. 서비스 계정 개인키가 아니다. 추적 파일의 개인키·일반 토큰 패턴과 자격증명 파일명 확인에서 후보가 없었다. `serviceAccountKey.json`, `*.env`, `*.local`은 무시된다. 선택적 DB 발행은 명시적 프로젝트·서비스 계정이 일치해야 하고 기본은 미리보기다. | `firebase.config.js`; `.gitignore`; `upload_crawl.py` |
| XSS와 외부 URL | 포털의 수집·회원 입력은 DOM 노드와 `textContent`로 표시한다. 외부 링크는 절대 HTTP(S) URL, 아바타는 HTTPS만 허용하고 자격정보가 들어간 URL은 거부한다. 새 탭 링크에는 `noopener noreferrer`를 지정한다. 홈 번역의 `innerHTML`은 현재 저장소의 정적 번역 사전만 사용한다. | `portal.js`의 `el`, `safeURL`, 링크 생성; `i18n.js`; `tests/portal.test.cjs` |
| 수집 요청과 출처 | 수집기는 고정된 다섯 HTTPS 호스트만 사용하고 URL 사용자 정보와 비표준 포트를 거부한다. 교차 호스트 및 `robots.txt` 금지 경로로의 리다이렉트를 거부하고 TLS CA, 응답 크기 3 MB, 요청 시간 20초, 호스트 간격, 제한된 재시도를 적용한다. 출처별 안정 ID와 스냅샷 중복·소유권 검증도 수행한다. | `crawler.py`의 `safe_source_url`, `SafeRedirectHandler`, `PublicFetcher`, `source_item_id`, `validate_snapshot`; `tests/test_crawler.py` |
| 의존성과 CI | Python 의존성은 버전 고정이다. `pip-audit`로 `requirements-crawler.txt`와 `requirements-crawler-publish.txt`를 조회해 당시 알려진 취약점은 보고되지 않았다. 예약 워크플로는 매시간 실행되고 `contents: write`, `pages: write`만 선언하며 JSON만 커밋한다. | 두 requirements 파일; `.github/workflows/crawl.yml` |

## 이번 확인과 수정의 증거

- `node --test tests/portal.test.cjs tests/portal-auth.test.cjs`: 20/20 통과. 저장형 HTML 삽입 경로, URL 검사, 대기자 데이터 노출 방지, 권한 변경 시 콜백 무효화, Google 토큰 처리 등을 확인한다. 테스트는 상위 폴더의 `type: module` 영향을 피한 격리 복사본에서 실행했다.
- `python -m unittest discover -s tests -p 'test_crawler*.py' -v`: 33/33 통과. 새 출처·리다이렉트·중복·마감·소유권 검증을 포함한다. 실제 공개 출처 제한 수집도 네 출처 모두 오류 0건이었다.
- 배포 전 새 `SafeRedirectHandler`에서 다른 호스트나 robots 금지 경로로 이동하는 응답을 차단했고 회귀 테스트를 추가했다. 배포 커밋은 `fc0bb6c4414bf48923c381d8c6b7a97ce7329cd5`다.
- 열려 있던 `https://wenw.ceo/portal.html` 탭을 읽기 전용으로 확인했을 때 `login-screen`만 보였고 회원 포털과 관리자 메뉴는 숨겨져 있었다. 계정 로그인·쓰기·타인 데이터 조회는 하지 않았다.
- 이전 [보안 검토](SECURITY-REVIEW.md)는 공식 Firestore 에뮬레이터에서 규칙 테스트 6개를 통과했다고 기록한다. 현재 `firestore.rules`는 그 뒤 수정되지 않았다. 이번 실행 환경에는 Java 런타임이 없어 에뮬레이터를 재실행하지 못했다.
- Codex Security 표준 스캔은 0개 발견으로 종료했으나 실행 중 작업 트리가 바뀌었다는 경고가 있어 원래 스냅샷의 보조 근거로만 본다. 새 코드에 대한 위 개별 확인을 별도로 수행했다.

## 운영에서 확인이 남은 범위

1. 저장소 규칙이 **실제 Firebase 프로젝트에 배포된 규칙과 일치하는지**, 관리자·승인 부원·가입 대기자의 실제 세션에서 읽기 권한이 예상대로 적용되는지 확인하지 못했다. 현재 열린 탭에 로그인 세션이 없었다.
2. 공개 Firebase 웹 API 키에 Firebase 관련 API 제한이 적용되어 있는지, App Check와 서비스 계정 IAM이 적절한지 콘솔 권한 없이 확인하지 못했다. 웹 API 키의 공개 자체가 관리자 권한을 주지는 않지만, 운영 제한 설정은 별도 검증이 필요하다.
3. CI는 JSON 커밋과 Pages 재빌드 때문에 쓰기 권한이 필요하지만, 단일 수집 job 전체에 토큰 권한이 있고 `checkout`의 자격증명 지속 옵션을 별도로 끄지 않았다. 사용 중인 GitHub Action은 major 버전 태그이며 SHA 고정이 아니다.
4. 브라우저는 Google·Firebase SDK와 외부 폰트/CDN에 의존한다. Firebase SDK URL은 버전 `11.0.2`를 지정하지만 SRI는 없고, 공개 Pages 응답에서 CSP 헤더를 확인하지 못했다. 공급망·CSP 심층 검증은 이번 범위 밖이다.

참고: [Firebase 웹 API 키 설명](https://firebase.google.com/docs/projects/api-keys), [Firestore 규칙과 Admin SDK/IAM 경계](https://firebase.google.com/docs/firestore/security/get-started), [GitHub Actions 토큰 최소 권한](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).
