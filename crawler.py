#!/usr/bin/env python3
"""
NextWave Opportunity Crawler
=============================
공모전, 해커톤, 개발, 게임개발, 마케팅, 대외활동 정보를
캠퍼스픽 / 링커리어 등에서 자동으로 수집하여 Firestore에 저장합니다.

카테고리: contest, hackathon, dev, gamedev, marketing, activity
교육/스터디 등 관련 없는 항목은 자동으로 걸러냅니다.

사용법:
  1. pip install requests beautifulsoup4 firebase-admin
  2. Firebase 서비스 계정 키(JSON)를 다운로드
  3. SERVICE_ACCOUNT_KEY 경로를 수정
  4. python crawler.py 로 실행

자동 실행 (무료):
  - GitHub Actions (.github/workflows/crawl.yml)
  - 로컬 cron: crontab -e → 0 8 * * * cd /path/to && python crawler.py

비용: 0원 (Firebase Spark 무료 플랜 + GitHub Actions 무료)
"""

import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import re
import sys

# ====================================================
# Firebase Admin SDK 설정
# ====================================================
try:
    import firebase_admin
    from firebase_admin import credentials, firestore

    SERVICE_ACCOUNT_KEY = 'serviceAccountKey.json'
    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    FIREBASE_AVAILABLE = True
except Exception as e:
    print(f"⚠️  Firebase 연결 실패: {e}")
    print("   → 미리보기 모드로 실행합니다 (DB 저장 안 됨)\n")
    db = None
    FIREBASE_AVAILABLE = False

# ====================================================
# 키워드 기반 카테고리 자동 분류
# ====================================================
CATEGORY_KEYWORDS = {
    'hackathon': ['해커톤', 'hackathon', 'hack', '메이커톤', 'makeathon', '코딩대회'],
    'gamedev': ['게임', 'game', '유니티', 'unity', '언리얼', 'unreal', '게임잼', 'gamejam', '인디게임'],
    'dev': ['개발', '프로그래밍', '코딩', 'AI', '인공지능', '앱', '웹', 'SW', '소프트웨어',
            '프론트엔드', '백엔드', '데이터', '클라우드', 'IT', '디지털'],
    'marketing': ['마케팅', '광고', '브랜딩', 'SNS', '콘텐츠', '디지털마케팅',
                  '퍼포먼스', 'PR', '홍보', '미디어', '크리에이터'],
    'contest': ['공모전', '경진대회', '아이디어', '기획', '창업', '스타트업',
                '비즈니스', '사업계획', '피칭', '데모데이'],
    'activity': ['대외활동', '서포터즈', '동아리', '연합', '봉사', '인턴',
                 '체험단', '기자단', '리포터', '앰배서더', '멘토링'],
}

# 제외 키워드 (교육/스터디/자격증 등)
EXCLUDE_KEYWORDS = ['교육', '강의', '수업', '자격증', '시험', '토익', '토플',
                    '학원', '인강', '자기계발서', '독서', '어학']


def classify_category(title, description=''):
    """제목과 설명을 분석하여 카테고리를 자동 분류합니다."""
    text = (title + ' ' + description).lower()

    # 제외 항목 먼저 체크
    for kw in EXCLUDE_KEYWORDS:
        if kw in text:
            return None  # 제외 대상

    # 카테고리 매칭 (우선순위 순)
    for category, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in text:
                return category

    # 매칭 안 되면 기본적으로 contest (공모전 사이트에서 수집하므로)
    return 'contest'


# ====================================================
# 크롤러: 링커리어 (Linkareer) - 대외활동/공모전
# ====================================================
def crawl_linkareer():
    results = []
    
    # 공모전 + 대외활동 페이지 모두 수집
    urls = [
        ('https://linkareer.com/list/contest', 'contest'),
        ('https://linkareer.com/list/activity', 'activity'),
    ]
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }

    for url, default_cat in urls:
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, 'html.parser')

            items = soup.select('article, .activity-item, .contest-item, [class*="Card"]')[:15]

            for item in items:
                title_el = item.select_one('h2, h3, .title, [class*="title"], [class*="Title"]')
                if not title_el:
                    continue

                title = title_el.get_text(strip=True)
                if not title or len(title) < 3:
                    continue

                # 카테고리 자동 분류
                category = classify_category(title)
                if category is None:
                    continue

                link_el = item.select_one('a[href]')
                link = ''
                if link_el:
                    href = link_el.get('href', '')
                    if href.startswith('/'):
                        link = 'https://linkareer.com' + href
                    elif href.startswith('http'):
                        link = href

                results.append({
                    'title': title,
                    'description': '링커리어에서 수집된 정보입니다.',
                    'category': category,
                    'deadline': None,
                    'link': link,
                    'source': '링커리어',
                })

            print(f"✅ 링커리어 ({default_cat}): {len(items)}건 스캔")
        except Exception as e:
            print(f"❌ 링커리어 ({default_cat}) 크롤링 실패: {e}")

    print(f"   → 링커리어 총 {len(results)}건 (필터링 후)")
    return results


# ====================================================
# Firestore 저장 (중복 방지)
# ====================================================
def save_to_firestore(items):
    if not FIREBASE_AVAILABLE or not db:
        print("\n📋 미리보기 (DB 저장 안 됨):")
        for i, item in enumerate(items, 1):
            cat_emoji = {'contest': '🏆', 'hackathon': '💻', 'dev': '⚙️',
                         'gamedev': '🎮', 'marketing': '📢', 'activity': '🤝'}
            emoji = cat_emoji.get(item['category'], '📌')
            print(f"  {i}. {emoji} [{item['category']}] {item['title']} (마감: {item['deadline'] or '상시'})")
        return

    saved, skipped = 0, 0
    for item in items:
        existing = db.collection('opportunities') \
            .where('title', '==', item['title']).limit(1).get()

        if len(existing) > 0:
            skipped += 1
            continue

        item['createdAt'] = firestore.SERVER_TIMESTAMP
        item['authorUid'] = 'crawler'
        item['authorName'] = 'NextWave Bot'
        db.collection('opportunities').add(item)
        saved += 1

    print(f"\n📊 결과: {saved}건 저장, {skipped}건 중복 스킵")


# ====================================================
# 만료 정보 자동 삭제
# ====================================================
def cleanup_expired():
    if not FIREBASE_AVAILABLE or not db:
        return

    cutoff = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
    try:
        expired = db.collection('opportunities').where('deadline', '<', cutoff).get()
        deleted = sum(1 for doc in expired if doc.reference.delete() or True)
        print(f"🧹 만료 정보 {deleted}건 삭제 완료")
    except Exception as e:
        print(f"❌ 정리 실패: {e}")


# ====================================================
# 메인 실행
# ====================================================
def main():
    print("=" * 50)
    print("🚀 NextWave Opportunity Crawler")
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50 + "\n")

    all_items = []
    all_items.extend(crawl_linkareer())

    print(f"\n📦 총 {len(all_items)}건 수집")

    if all_items:
        save_to_firestore(all_items)

    cleanup_expired()
    print("\n✅ 크롤링 완료!")


if __name__ == '__main__':
    main()
