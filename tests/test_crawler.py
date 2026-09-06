import copy
import json
from pathlib import Path
import tempfile
import unittest

import crawler
from upload_crawl import is_crawler_owned, plan_writes

FIXTURES = Path(__file__).parent / 'fixtures'
NOW = '2026-09-06T16:00:00Z'  # Already September 7 in Korea.


def source_status(status='ok'):
    return [{**crawler.SOURCES['kstartup'], 'status': status, 'checkedAt': NOW, 'itemCount': 1}]


def item(deadline='2026-09-10'):
    result = crawler.parse_kstartup((FIXTURES / 'kstartup-list.html').read_text())[0]
    result['deadline'] = deadline
    return result


def snapshot(deadline='2026-09-10', now=NOW):
    return crawler.merge_snapshot({}, [item(deadline)], source_status(), now)


class ParsingTests(unittest.TestCase):
    def test_only_full_valid_calendar_dates_are_accepted(self):
        for invalid in ('D-3', '상시', '2026-02-30', '2026-13-01', None):
            self.assertIsNone(crawler.valid_date(invalid))
        self.assertEqual(crawler.valid_date('마감일자 2026. 9. 17'), '2026-09-17')

    def test_kstartup_has_stable_id_exact_deadline_and_clean_title(self):
        result = item()
        self.assertEqual(result['id'], 'auto_kstartup_179130')
        self.assertEqual(result['deadline'], '2026-09-10')
        self.assertEqual(result['organizer'], '서울창조경제혁신센터')
        self.assertEqual(result['category'], 'contest')
        self.assertNotIn('새로운게시글', result['title'])
        self.assertIn('schM=view&pbancSn=179130', result['link'])

    def test_changed_kstartup_markup_is_failure_not_empty_success(self):
        with self.assertRaises(ValueError):
            crawler.parse_kstartup('<h1>점검 중</h1>')
        fixture = (FIXTURES / 'kstartup-list.html').read_text()
        with self.assertRaises(ValueError):
            crawler.parse_kstartup(fixture.replace('2026-09-10', '2026-02-30'))

    def test_wevity_reads_explicit_period_not_relative_badge(self):
        result = crawler.parse_wevity_detail((FIXTURES / 'wevity-detail.html').read_text(), 'https://www.wevity.com/?ix=110622')
        self.assertEqual(result['deadline'], '2026-09-17')
        self.assertEqual(result['startDate'], '2026-08-24')
        self.assertEqual(result['category'], 'dev')
        self.assertEqual(result['applicationPeriod'], '2026-08-24 ~ 2026-09-17')

    def test_wevity_filters_school_only_events(self):
        html = (FIXTURES / 'wevity-detail.html').read_text().replace('일반인, 대학생', '청소년, 기타')
        self.assertIsNone(crawler.parse_wevity_detail(html, 'https://www.wevity.com/?ix=110622'))

    def test_source_url_allowlist_and_identity(self):
        for url in ('http://www.wevity.com/?ix=1', 'https://evil.example/?ix=1', 'https://www.wevity.com@evil.example/?ix=1', 'https://www.wevity.com:8000/?ix=1', 'javascript:alert(1)'):
            with self.assertRaises(ValueError):
                crawler.source_item_id('wevity', url)
        with self.assertRaises(ValueError):
            crawler.source_item_id('kstartup', 'https://www.wevity.com/?pbancSn=1')

    def test_wevity_canonicalizes_tracking_pages_and_deduplicates(self):
        html = '<div class="ms-list"><ul class="list"><li><div class="tit"><a href="?ix=1&gp=1">Event</a></div></li><li><div class="tit"><a href="?ix=1&gp=2">Event</a></div></li></ul></div>'
        self.assertEqual(crawler.parse_wevity_links(html), ['https://www.wevity.com/?c=find&s=1&gbn=view&ix=1'])

    def test_short_english_keywords_do_not_match_inside_words(self):
        self.assertEqual(crawler.classify_category('Sailing photo contest'), 'contest')
        self.assertEqual(crawler.classify_category('2026 AI 해커톤'), 'hackathon')

    def test_volunteer_recruitment_and_ai_networking_are_activities(self):
        self.assertEqual(crawler.classify_category('17회 부산평화영화제 자원활동가 모집', '봉사활동'), 'activity')
        self.assertEqual(crawler.classify_category('2026년 용인 오픈이노베이션 교류회 4회차(AI)', '행사ㆍ네트워크'), 'activity')

    def test_video_and_ad_output_take_precedence_over_ai_tools(self):
        self.assertEqual(crawler.classify_category('2026 남이섬 AI 영상 광고 숏폼 가을 공모전', '광고/마케팅'), 'marketing')
        self.assertEqual(crawler.classify_category('문화데이터 활용 영상 제작 AI 챌린지', '광고/마케팅, 웹/모바일/IT'), 'marketing')
        self.assertEqual(crawler.classify_category('AI 제조데이터 분석 경진대회', '기획/아이디어, 게임/소프트웨어'), 'dev')

    def test_institution_name_does_not_override_substantive_program_type(self):
        title = '연구개발특구진흥재단 X 현대차증권 Corporate Venture Connect 오픈이노베이션 배치프로그램 참가기업 모집공고'
        self.assertEqual(crawler.classify_category(title, '행사ㆍ네트워크', 'startup'), 'activity')
        self.assertEqual(crawler.classify_category('온디바이스AI 제품개발·제조 및 기술지원 기업모집공고', '기술개발(R&D)', 'startup'), 'dev')

    def test_source_tag_buffet_does_not_override_ambiguous_title(self):
        self.assertEqual(crawler.classify_category('새로운 프로젝트 참가자 모집', '기획/아이디어, 광고/마케팅, 게임/소프트웨어'), 'contest')
        self.assertEqual(crawler.classify_category('창업 페스티벌 아이디어 경진대회', '시설ㆍ공간ㆍ보육', 'startup'), 'contest')

    def test_robots_uses_specific_group_and_longest_rule(self):
        robots = 'User-agent: *\nAllow: /\nDisallow: /private*\nAllow: /private/public\n'
        self.assertFalse(crawler.robots_allows(robots, 'https://www.wevity.com/private/data'))
        self.assertTrue(crawler.robots_allows(robots, 'https://www.wevity.com/private/public'))
        robots += '\nUser-agent: NextWavePortal\nDisallow: /\n'
        self.assertFalse(crawler.robots_allows(robots, 'https://www.wevity.com/'))


class RefreshTests(unittest.TestCase):
    def test_existing_item_is_updated_without_duplicate_or_resetting_first_seen(self):
        old = snapshot(now='2026-09-05T08:00:00Z')
        refreshed = item('2026-10-01')
        refreshed['title'] += ' (기간 연장)'
        result = crawler.merge_snapshot(old, [refreshed], source_status(), NOW)
        self.assertEqual(len(result['items']), 1)
        self.assertEqual(result['items'][0]['deadline'], '2026-10-01')
        self.assertEqual(result['items'][0]['firstSeenAt'], '2026-09-05T08:00:00Z')
        self.assertEqual(result['items'][0]['lastSeenAt'], NOW)

    def test_failed_source_preserves_original_freshness_and_items(self):
        old = snapshot(now='2026-09-05T08:00:00Z')
        result = crawler.merge_snapshot(old, [], source_status('error'), NOW)
        self.assertEqual(result['items'], old['items'])
        self.assertEqual(result['lastSuccessAt'], old['lastSuccessAt'])
        self.assertEqual(result['sources'][0]['lastSuccessAt'], old['sources'][0]['lastSuccessAt'])
        self.assertEqual(result['generatedAt'], NOW)

    def test_expiry_uses_korean_calendar_and_archives_without_deleting(self):
        result = snapshot('2026-09-06')
        self.assertEqual(len(result['items']), 1)
        self.assertEqual(result['items'][0]['status'], 'archived')
        self.assertEqual(result['items'][0]['archivedReason'], 'deadline_passed')

    def test_future_deadline_not_archived_when_it_leaves_sampled_pages(self):
        old = snapshot('2026-12-31', '2026-07-01T00:00:00Z')
        result = crawler.merge_snapshot(old, [], source_status(), NOW)
        self.assertEqual(result['items'][0]['status'], 'active')

    def test_unknown_deadline_archives_only_after_30_days_with_successful_source(self):
        old = snapshot(None, '2026-07-01T00:00:00Z')
        failed = crawler.merge_snapshot(old, [], source_status('error'), NOW)
        self.assertEqual(failed['items'][0]['status'], 'active')
        success = crawler.merge_snapshot(old, [], source_status(), NOW)
        self.assertEqual(success['items'][0]['archivedReason'], 'not_seen_30_days')

    def test_previously_imported_school_only_event_is_archived(self):
        old = snapshot()
        old['items'][0]['audience'] = '청소년, 기타'
        result = crawler.merge_snapshot(old, [], source_status(), NOW)
        self.assertEqual(result['items'][0]['status'], 'archived')
        self.assertEqual(result['items'][0]['archivedReason'], 'audience_not_eligible')

    def test_local_reclassification_preserves_source_facts_and_freshness(self):
        old = snapshot()
        old['items'][0]['title'] = 'AI 영상 광고 공모전'
        old['items'][0]['category'] = 'dev'
        updated = crawler.reclassify_snapshot(old)
        self.assertEqual(updated['items'][0]['category'], 'marketing')
        self.assertEqual(updated['classificationVersion'], crawler.CLASSIFICATION_VERSION)
        self.assertEqual(old['items'][0]['category'], 'dev')
        for key in ('generatedAt', 'lastSuccessAt', 'sources'):
            self.assertEqual(updated[key], old[key])
        for key, value in old['items'][0].items():
            if key != 'category':
                self.assertEqual(updated['items'][0][key], value)

    def test_atomic_snapshot_roundtrip_and_duplicate_detection(self):
        result = snapshot()
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'data.json'
            crawler.write_snapshot(path, result)
            self.assertEqual(crawler.read_snapshot(path), result)
            self.assertFalse(path.with_suffix('.tmp').exists())
        result['items'].append(copy.deepcopy(result['items'][0]))
        with self.assertRaises(ValueError):
            crawler.validate_snapshot(result)


class PublisherTests(unittest.TestCase):
    def test_member_collision_and_expired_member_data_are_never_changed(self):
        member = {'authorUid': 'real-member', 'managedBy': crawler.MANAGED_BY, 'deadline': '2020-01-01'}
        existing = {'auto_kstartup_179130': member, 'other_member_post': member}
        writes, skipped = plan_writes(snapshot(), existing, NOW)
        self.assertEqual(writes, [])
        self.assertEqual(skipped, ['auto_kstartup_179130'])
        self.assertFalse(is_crawler_owned(member))

    def test_legacy_import_is_archived_and_never_deleted(self):
        legacy = {'authorUid': 'crawler', 'authorName': 'NextWave Bot', 'source': '링커리어', 'title': 'Old import'}
        writes, _ = plan_writes(snapshot(), {'legacy-id': legacy}, NOW)
        archive = next(x for x in writes if x['id'] == 'legacy-id')
        self.assertEqual(archive['kind'], 'archive')
        self.assertEqual(archive['data']['archivedReason'], 'legacy_unverified')
        self.assertNotIn('title', archive['data'])
        self.assertFalse(any(x['kind'] == 'delete' for x in writes))

    def test_publisher_archives_managed_expiry_using_korean_date(self):
        old = snapshot('2026-09-06')['items'][0]
        old['status'] = 'active'
        writes, _ = plan_writes({'items': []}, {old['id']: old}, NOW)
        self.assertEqual(writes[0]['data']['archivedReason'], 'deadline_passed')

    def test_repeated_publish_upserts_same_id_and_preserves_creation_time(self):
        first = snapshot()
        existing = {x['id']: x for x in first['items']}
        writes, _ = plan_writes(first, existing, NOW)
        self.assertEqual([x['id'] for x in writes], ['auto_kstartup_179130'])
        self.assertEqual(writes[0]['data']['createdAt'], existing['auto_kstartup_179130']['createdAt'])


if __name__ == '__main__':
    unittest.main()
