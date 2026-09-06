# 포털 공고 수집 운영

`crawler.py`는 공개 공고의 **제목·주최기관·분류·접수기간·원문 링크**를 가져와 `data/opportunities.json`을 갱신합니다. 원문 기사·포스터는 복제하지 않습니다. 포털은 이 파일을 읽으므로 Firebase 서비스 계정 없이도 최신 수집 내용을 표시할 수 있습니다.

## 현재 수집 범위

- [K-Startup 모집중 공고](https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do): 공식 공고 목록의 최근 3페이지. 원문의 `pbancSn`, 마감일자, 시작일자, 등록일자, 주관기관을 사용합니다.
- [위비티 공모전](https://www.wevity.com/?c=find&s=1): 현재 첫 목록의 최대 20개 상세 공고. 목록의 상대적인 D-day 대신 상세 접수기간을 읽습니다. 대학생·일반인·제한없음 공고를 포함하고 청소년만 대상으로 하는 공고는 제외합니다. 위비티는 모집 정보를 중개하므로 신청 전 링크의 주최기관 요강을 확인해야 합니다.

두 소스의 실제 HTML 구조와 공개 접근은 2026-09-06에 확인했습니다. 전체 인터넷의 공고를 망라하지 않으며 현재 목록에서 벗어난 공고의 변경을 실시간 보장하지 않습니다. 목록 구조가 바뀌거나 공고가 0건인 응답은 성공으로 위장하지 않고 오류로 기록합니다.

기존 링커리어·올콘·콘테스트코리아의 추측 선택자 및 Firebase CLI 토큰 재사용 경로는 제거했습니다. 새 소스를 추가할 때는 실응답과 회귀용 구조 fixture를 함께 검증해야 합니다.

## 로컬 실행

Python 3.10 이상을 사용합니다. 프로젝트 안에 자격증명을 넣지 마세요.

```bash
python3 -m venv /tmp/nextwave-crawler-venv
/tmp/nextwave-crawler-venv/bin/python -m pip install -r requirements-crawler.txt
/tmp/nextwave-crawler-venv/bin/python crawler.py
/tmp/nextwave-crawler-venv/bin/python crawler.py --validate
/tmp/nextwave-crawler-venv/bin/python -m unittest discover -s tests -p 'test_crawler*.py' -v
```

`--pages 1..10`, `--detail-limit 1..50`, `--output path.json`으로 수집 범위와 출력 경로를 지정할 수 있습니다. 수집은 HTTPS, 고정 출처 호스트, 응답 크기 제한, 20초 timeout, 최대 3회 요청, 호스트별 1.5초 간격, robots.txt를 적용합니다. 출처가 실패해도 유효한 기존 자료는 보존하며, 확정된 마감일이 지난 자동 공고만 제거합니다. JSON은 임시 파일 작성 후 원자적으로 교체합니다.

`crawler.py --prune-expired`는 네트워크·Firebase 연결 없이 저장된 공고의 지난 마감일만 정리합니다. `generatedAt`, `lastSuccessAt`, 출처별 확인 시각과 남은 공고의 원문 정보는 변경하지 않습니다. `--validate`는 형식·소유권·ID뿐 아니라 한국 날짜 기준으로 만료된 자동 공고가 0건인지도 검사합니다. 오래된 snapshot을 검증할 때 만료 항목이 발견되면 먼저 수집 또는 `--prune-expired`를 실행하세요.

## 자동 갱신과 실제 배포

**현재 상태 — 2026-09-07:** 사용자가 승인한 예약 수집 workflow를 `main`에 등록했고 활성 상태를 확인했습니다. [등록 커밋 `9342512`](https://github.com/han4223429/nextwave/commit/9342512b116505eeb87eefa841597119e528cb64)의 [첫 수동 실행](https://github.com/han4223429/nextwave/actions/runs/34044183740)에서 실제 수집·검증·bot commit·기존 Pages 빌드·공개 HTTPS 반영까지 성공했습니다.

`.github/workflows/crawl.yml`은 기본 브랜치에서 **매시간 17분** 실행하도록 등록되어 있으며 Actions → Refresh portal opportunities → Run workflow로 즉시 실행할 수도 있습니다. 정적 포털에서 새로고침 버튼을 눌렀을 때는 배포된 최신 JSON을 다시 읽는 것이며 외부 사이트를 직접 크롤링하는 것은 아닙니다.

운영 저장소의 기본 브랜치에 변경을 merge/push한 뒤 다음을 확인합니다.

1. GitHub Actions를 활성화하고 workflow에 선언된 `contents: write`·`pages: write` 권한을 허용합니다. 브랜치 보호 정책이 bot push를 막는 경우 운영 정책에 맞는 bot/PR 전달 방식을 설정합니다.
2. workflow는 JSON만 commit한 뒤 기존 Pages 설정을 읽습니다. `build_type: legacy`이고 배포 원본이 기본 브랜치의 `/`이면 Pages build API를 자동 호출합니다. 별도 `CRAWLER_REBUILD_PAGES` 변수나 개인 토큰은 필요하지 않습니다. 다른 브랜치·하위 폴더 또는 `build_type: workflow`이면 기존 설정을 변경하지 않고 빌드를 건너뛴 이유를 실행 요약에 표시합니다. 이 경우 별도의 배포 경로가 새 snapshot을 게시하도록 연결해야 합니다. Pages 설정 조회나 빌드 요청 자체가 실패하면 snapshot commit은 보존되고 workflow는 실패로 표시됩니다.
3. Run workflow로 한 차례 실행하고 수집 요약, commit, Pages 배포, 공개 `/data/opportunities.json`의 `generatedAt`을 확인합니다.

GitHub Actions의 기본 `GITHUB_TOKEN`으로 push한 commit만으로는 Pages가 자동 빌드되지 않으므로 명시적인 build 요청을 포함했습니다. [GitHub Pages 설정 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [Pages build API](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build).

GitHub 일정 지연·사용량 제한·장기 비활성화·출처 장애가 있을 수 있으므로 포털은 실제 마지막 성공 시각을 표시합니다. 수집이 부분 실패해도 상태 JSON을 저장하고 workflow는 최종 실패로 표시합니다. 등록된 주기와 첫 수동 실행 성공을 모든 향후 예약 실행의 성공 보장으로 해석하지 않습니다.

첫 실행은 **2026-09-07 01:03:25 KST**에 K-Startup 45건·위비티 13건을 오류 없이 수집했습니다. 기존 기록을 보존한 전체 snapshot은 60건(진행 57·보관 3)이며, 파싱·소유권 테스트 25개와 snapshot 검증이 통과했습니다. `github-actions[bot]`의 [수집 커밋 `cc1d1a0`](https://github.com/han4223429/nextwave/commit/cc1d1a0abe280a7616479400fba33715956a07f8)은 `data/opportunities.json`만 변경했습니다. 같은 커밋의 Pages 빌드는 01:04:08 KST에 완료됐고, [공개 JSON](https://wenw.ceo/data/opportunities.json)의 HTTP 200 응답이 커밋 원문과 바이트 단위로 일치했습니다. Pages는 기존 `legacy`, `main /` 구성을 사용했으며 Firebase에는 연결하거나 쓰지 않았습니다. 이 수치는 첫 실행 당시 기록이며 이후에는 포털·Actions의 실제 시각과 상태를 확인합니다.

## 데이터 계약과 삭제·보관 기준

**실제 삭제 배포 확인 (2026-09-07):** [수정 커밋 `020faf8`](https://github.com/han4223429/nextwave/commit/020faf82f65c58e3d93815cc629525364e25cab6) 이후 [원격 실행 `34045854698`](https://github.com/han4223429/nextwave/actions/runs/34045854698)이 수집·28개 검사·만료 0건 검증·공개 JSON commit·Pages 요청까지 성공했습니다. 01:34:44 KST에 K-Startup 45건·위비티 13건을 오류 없이 확인했고, 최종 JSON은 59건(진행 57·미래 마감의 대상 외 보관 2), 만료 0건입니다. 9월 6일 마감 `auto_wevity_110012`는 실제로 제거됐습니다. [bot 커밋 `a5f7fb4`](https://github.com/han4223429/nextwave/commit/a5f7fb415e6974574265f8bb35e599c10ae74341)는 공개 JSON만 변경했고 Pages는 01:35:26 KST에 완료됐습니다. 배포된 JSON·포털 HTML·JS는 모두 HTTPS 200이며 검증 커밋의 파일과 바이트 단위로 일치했습니다.

- 최상위: `schemaVersion: 1`, `generatedAt`(최근 시도), `lastSuccessAt`(새 데이터를 얻은 마지막 시각), `refreshIntervalMinutes`, `classificationVersion`(로컬 분류 규칙 버전), `sources`, `items`.
- 출처 상태: `id`, `name`, `url`, `status` (`ok`, `partial`, `error`), `checkedAt`, `lastSuccessAt`(해당 출처 전체 성공), `itemCount`, `errorCount`, 선택적 `error`.
- 공고: `id`, `title`, `description`, `category`, `deadline`, `link`, `source`, `sourceId`, `sourceUrl`, `managedBy: "nextwave-crawler"`, `authorUid: "crawler"`, `firstSeenAt`, `lastSeenAt`, `createdAt`, `status` (`active`, `archived`). 추가 필드: `organizer`, `sourceCategory`, `startDate`, `publishedAt`, `audience`, `applicationPeriod`.
- 카테고리: `startup`, `contest`, `hackathon`, `dev`, `gamedev`, `marketing`, `activity`, `education`, `internship`.
- 분류 규칙 버전 2: AI를 사용하더라도 영상·광고 제작 공고는 마케팅, 자원활동가 모집·교류회는 대외활동으로 분류합니다. 기관명 안의 `연구개발`만으로 개발 공고로 분류하지 않습니다. 여러 분야가 나열된 중개 사이트 태그 대신 제목의 실제 활동을 우선합니다. 2026-09-06 최종 검토에서 기존 snapshot을 저장된 제목·원문 분류로 재분류했으며 ID·마감일·출처·수집 시각은 모두 유지했습니다. 분류 수정은 새 크롤링 성공으로 기록하지 않습니다.
- `deadline: null`은 **마감일 미확인**입니다. 상시 모집으로 추정하지 않습니다. UTC timestamp를 사용하고 만료 판단은 한국 날짜를 기준으로 합니다. 정확한 접수 마감 시각은 원문을 확인합니다.
- snapshot에 남아 있는 항목은 제목이 바뀌거나 마감일이 연장되어도 같은 출처 ID로 갱신됩니다. `firstSeenAt`은 유지되고 `lastSeenAt`만 갱신됩니다. 이미 만료되어 삭제한 공고가 연장된 마감일로 다시 수집되면 같은 출처 ID로 새 기록을 만듭니다.
- **한국 날짜보다 이전인 확정 마감일의 자동 공고는 공개 JSON의 `items`에서 실제 제거합니다.** 화면 숨김이나 `deadline_passed` 보관으로 남기지 않습니다. 이전 정책으로 이미 보관된 만료 공고, 이번에 수집한 만료 공고와 실패한 출처의 확정 만료 공고 모두 같은 기준을 적용합니다. 오늘 마감은 오늘까지 유지합니다. 자동 수집은 매 실행마다 이 정리를 수행합니다.
- 삭제에는 `managedBy == "nextwave-crawler"`, `authorUid == "crawler"`, 유효한 정확한 `YYYY-MM-DD` 마감일이 필요합니다. 미확인·잘못된 날짜를 추정해 삭제하지 않습니다. 대학생 대상이 아닌 것으로 확인됐지만 아직 만료되지 않은 공고는 `audience_not_eligible`로 보관합니다.
- 기한이 미확인인 자동 공고가 30일 이상 다시 보이지 않고 해당 출처 수집이 성공한 경우에만 `not_seen_30_days`로 보관합니다. 미래 마감일이 확인된 공고는 목록 몇 페이지에서 빠졌다는 이유로 종료 처리하지 않습니다.
- 실패한 출처에서는 확정 만료 공고를 제외한 기존 항목·항목의 `lastSeenAt`·출처의 `lastSuccessAt`을 유지하고, `checkedAt`은 이번 실패 시각으로 갱신합니다. `generatedAt`을 데이터가 모두 새롭다는 뜻으로 표시하지 않습니다.
- 포털도 한국 날짜를 기준으로 만료된 자동 공고를 캐시에서 제외합니다. 자정 이후 다음 수집까지의 간격이나 수집 지연 중에도 만료 공고가 다시 표시되지 않습니다. 회원이 직접 작성한 공고는 이 자동 삭제 대상에 포함하지 않습니다.
- 사용자 작성 공고는 공용 snapshot에 들어가지 않습니다. 포털의 회원 Firestore 공고와 자동 수집 공고는 별도 소유권으로 병합합니다.

## 선택 사항: Firestore에 발행

공용 snapshot이 기본 데이터 경로입니다. 기존 자동 수집 문서를 정리하거나 Firestore 복사본이 필요한 경우에만 `upload_crawl.py`를 사용합니다. 기본 명령은 로컬 미리보기이며 로그인 토큰이나 자격증명 파일을 자동 탐색하지 않습니다.

```bash
/tmp/nextwave-crawler-venv/bin/python upload_crawl.py
/tmp/nextwave-crawler-venv/bin/python -m pip install -r requirements-crawler-publish.txt
# 실제 프로젝트 ID와 웹 루트 밖의 서비스 계정 파일을 명시: 아래는 읽기와 변경계획만 수행
/tmp/nextwave-crawler-venv/bin/python upload_crawl.py --project YOUR_PROJECT_ID --credentials /secure/path/service-account.json
# 같은 인자에 --publish를 추가해야 실제 반영
```

`FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`로 동일한 값을 지정할 수 있습니다. 서비스 계정의 `project_id`와 명시한 프로젝트가 다르면 거부합니다. 실제 publish는 `opportunities`의 crawler 소유 문서만 upsert/보관하며 회원 소유 ID와 충돌하면 건너뜁니다. 각 쓰기 시 transaction으로 소유권을 재확인합니다.

이전 자동 크롤러 문서는 `authorUid == "crawler"`, `authorName == "NextWave Bot"`, 알려진 이전 출처명을 모두 만족할 때만 `legacy_unverified`로 보관합니다. 회원이 작성한 만료 공고를 삭제하던 이전 정리 코드는 없습니다. 이 선택적 Firestore 발행 코드는 DB 문서를 삭제하지 않고 자동 소유 만료 문서를 보관 처리합니다. 이는 위의 공개 JSON 실제 삭제와 별개입니다. 발행 상태는 `crawlerStatus/opportunities`에 기록됩니다. 로컬 작업에서 이 publish 명령은 실행하지 않았습니다.

현재 공개 포털과 예약 workflow는 JSON을 사용하며 Firestore의 자동 공고 복사본은 화면에 병합하지 않습니다. 따라서 공개 만료 공고를 제거하는 데 DB 쓰기는 필요하지 않습니다. 기존 DB 복사본까지 물리적으로 삭제하려면 대상 프로젝트·자동 소유권·확정 마감일을 별도 확인하고 트랜잭션 안에서 다시 검증하는 DB 정리 경로가 필요합니다. 이번 수정은 그 원격 정리를 실행하거나 회원 작성 자료를 변경하지 않습니다.
