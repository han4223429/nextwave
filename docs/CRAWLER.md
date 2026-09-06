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

`--pages 1..10`, `--detail-limit 1..50`, `--output path.json`으로 수집 범위와 출력 경로를 지정할 수 있습니다. 수집은 HTTPS, 고정 출처 호스트, 응답 크기 제한, 20초 timeout, 최대 3회 요청, 호스트별 1.5초 간격, robots.txt를 적용합니다. 출처가 실패하면 기존 파일을 빈 목록으로 덮어쓰지 않습니다. JSON은 임시 파일 작성 후 원자적으로 교체합니다.

## 자동 갱신과 실제 배포

**현재 상태 — 2026-09-07:** 사이트와 최신 공고 JSON은 GitHub `main`에 업로드했습니다. 아래 예약 수집 workflow는 로컬 파일로 준비·검증했으나 아직 원격에 등록하지 않았습니다. 기존 Git 인증에 `workflow` scope가 없어 해당 파일을 분리했으며, 연결된 GitHub 앱을 통한 등록도 자동 승인 검토가 저장소·Pages의 예약 쓰기 권한에 대한 명시적 승인 부족을 이유로 차단했습니다. 정확한 `contents:write`·`pages:write` 권한과 매시간 등록 승인을 요청한 상태입니다. 승인 전에는 수동 실행·공개 JSON 업로드 경로만 사용할 수 있고, 자동 수집이 활성화됐다고 간주하지 않습니다.

등록할 `.github/workflows/crawl.yml`은 기본 브랜치에서 **매시간 17분** 실행하며 등록 후 Actions → Refresh portal opportunities → Run workflow로 즉시 실행할 수도 있습니다. 정적 포털에서 새로고침 버튼을 눌렀을 때는 배포된 최신 JSON을 다시 읽는 것이며 외부 사이트를 직접 크롤링하는 것은 아닙니다.

운영 저장소의 기본 브랜치에 변경을 merge/push한 뒤 다음을 확인합니다.

1. GitHub Actions를 활성화하고 workflow에 선언된 `contents: write`·`pages: write` 권한을 허용합니다. 브랜치 보호 정책이 bot push를 막는 경우 운영 정책에 맞는 bot/PR 전달 방식을 설정합니다.
2. workflow는 JSON만 commit한 뒤 기존 Pages 설정을 읽습니다. `build_type: legacy`이고 배포 원본이 기본 브랜치의 `/`이면 Pages build API를 자동 호출합니다. 별도 `CRAWLER_REBUILD_PAGES` 변수나 개인 토큰은 필요하지 않습니다. 다른 브랜치·하위 폴더 또는 `build_type: workflow`이면 기존 설정을 변경하지 않고 빌드를 건너뛴 이유를 실행 요약에 표시합니다. 이 경우 별도의 배포 경로가 새 snapshot을 게시하도록 연결해야 합니다. Pages 설정 조회나 빌드 요청 자체가 실패하면 snapshot commit은 보존되고 workflow는 실패로 표시됩니다.
3. Run workflow로 한 차례 실행하고 수집 요약, commit, Pages 배포, 공개 `/data/opportunities.json`의 `generatedAt`을 확인합니다.

GitHub Actions의 기본 `GITHUB_TOKEN`으로 push한 commit만으로는 Pages가 자동 빌드되지 않으므로 명시적인 build 요청을 포함했습니다. [GitHub Pages 설정 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [Pages build API](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build).

이 작업은 workflow 코드를 추가하는 것이며, 로컬 실행만으로 GitHub 예약 작업 또는 원격 배포가 활성화되지는 않습니다. GitHub 일정 지연·사용량 제한·장기 비활성화·출처 장애가 있을 수 있으므로 포털은 실제 마지막 성공 시각을 표시합니다. 수집이 부분 실패해도 상태 JSON을 저장하고 workflow는 최종 실패로 표시합니다.

2026-09-07 배포 준비 중 읽기 전용 확인에서 이 저장소의 Actions는 활성 상태였고 Pages는 `legacy`, `main /`이었습니다. `main`은 보호 브랜치가 아니었습니다. 이 확인은 새 workflow의 원격 실행·배포 성공 기록이 아니며, 첫 실행 결과는 별도로 확인해야 합니다.

## 데이터 계약과 보관 기준

- 최상위: `schemaVersion: 1`, `generatedAt`(최근 시도), `lastSuccessAt`(새 데이터를 얻은 마지막 시각), `refreshIntervalMinutes`, `classificationVersion`(로컬 분류 규칙 버전), `sources`, `items`.
- 출처 상태: `id`, `name`, `url`, `status` (`ok`, `partial`, `error`), `checkedAt`, `lastSuccessAt`(해당 출처 전체 성공), `itemCount`, `errorCount`, 선택적 `error`.
- 공고: `id`, `title`, `description`, `category`, `deadline`, `link`, `source`, `sourceId`, `sourceUrl`, `managedBy: "nextwave-crawler"`, `authorUid: "crawler"`, `firstSeenAt`, `lastSeenAt`, `createdAt`, `status` (`active`, `archived`). 추가 필드: `organizer`, `sourceCategory`, `startDate`, `publishedAt`, `audience`, `applicationPeriod`.
- 카테고리: `startup`, `contest`, `hackathon`, `dev`, `gamedev`, `marketing`, `activity`, `education`, `internship`.
- 분류 규칙 버전 2: AI를 사용하더라도 영상·광고 제작 공고는 마케팅, 자원활동가 모집·교류회는 대외활동으로 분류합니다. 기관명 안의 `연구개발`만으로 개발 공고로 분류하지 않습니다. 여러 분야가 나열된 중개 사이트 태그 대신 제목의 실제 활동을 우선합니다. 2026-09-06 최종 검토에서 기존 snapshot을 저장된 제목·원문 분류로 재분류했으며 ID·마감일·출처·수집 시각은 모두 유지했습니다. 분류 수정은 새 크롤링 성공으로 기록하지 않습니다.
- `deadline: null`은 **마감일 미확인**입니다. 상시 모집으로 추정하지 않습니다. UTC timestamp를 사용하고 만료 판단은 한국 날짜를 기준으로 합니다. 정확한 접수 마감 시각은 원문을 확인합니다.
- 제목이 바뀌거나 마감일이 연장되어도 같은 출처 ID는 같은 항목으로 갱신됩니다. `firstSeenAt`은 유지되고 `lastSeenAt`만 갱신됩니다.
- 기한이 지난 자동 공고는 삭제하지 않고 `deadline_passed`로 보관합니다. 대학생 대상이 아닌 것으로 확인된 공고는 `audience_not_eligible`로 보관합니다.
- 기한이 미확인인 자동 공고가 30일 이상 다시 보이지 않고 해당 출처 수집이 성공한 경우에만 `not_seen_30_days`로 보관합니다. 미래 마감일이 확인된 공고는 목록 몇 페이지에서 빠졌다는 이유로 종료 처리하지 않습니다.
- 실패한 출처의 기존 항목과 마지막 성공/확인 시각은 유지합니다. `generatedAt`을 데이터가 모두 새롭다는 뜻으로 표시하지 않습니다.
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

이전 자동 크롤러 문서는 `authorUid == "crawler"`, `authorName == "NextWave Bot"`, 알려진 이전 출처명을 모두 만족할 때만 `legacy_unverified`로 보관합니다. 회원이 작성한 만료 공고를 삭제하던 이전 정리 코드는 없습니다. 어떤 경로도 문서를 삭제하지 않습니다. 발행 상태는 `crawlerStatus/opportunities`에 기록됩니다. 로컬 작업에서 이 publish 명령은 실행하지 않았습니다.
