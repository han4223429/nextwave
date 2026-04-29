#!/usr/bin/env python3
"""
크롤링 데이터를 Firebase REST API로 직접 업로드합니다.
Firebase CLI 로그인 토큰을 재사용합니다.
"""
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import json, os, re

# ── Firebase 설정 ──
PROJECT_ID = 'nextwave-a24e1'
FIRESTORE_URL = f'https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/opportunities'

# Firebase CLI 토큰 또는 서비스 계정 키에서 access_token 가져오기
def get_access_token():
    # 1. CI 환경: 서비스 계정 키 파일이 있는 경우 (GitHub Actions)
    sa_path = 'serviceAccountKey.json'
    if os.path.exists(sa_path):
        from google.oauth2 import service_account
        from google.auth.transport import requests as auth_requests
        
        scopes = ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/firebase.database']
        creds = service_account.Credentials.from_service_account_file(sa_path, scopes=scopes)
        creds.refresh(auth_requests.Request())
        return creds.token

    # 2. 로컬 환경: Firebase CLI 토큰 사용
    config_path = os.path.expanduser('~/.config/configstore/firebase-tools.json')
    if not os.path.exists(config_path):
        # 다른 가능한 경로 확인
        config_path = os.path.expanduser('~/.config/firebase/config.json')
        
    if os.path.exists(config_path):
        with open(config_path) as f:
            config = json.load(f)
        
        tokens = config.get('tokens', config.get('user', {}).get('tokens', {}))
        access_token = tokens.get('access_token')
        expires_at = tokens.get('expires_at', 0)
        
        # 토큰 유효 시 바로 반환
        if access_token and expires_at > datetime.now().timestamp() * 1000:
            return access_token
        
        # 만료 시 refresh 시도
        refresh_token = tokens.get('refresh_token')
        if refresh_token:
            resp = requests.post('https://oauth2.googleapis.com/token', data={
                'client_id': '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
                'client_secret': 'FhIEOKaBTlqFJjdiWbMHZnvc',
                'refresh_token': refresh_token,
                'grant_type': 'refresh_token',
            })
            if resp.status_code == 200:
                return resp.json()['access_token']
            if access_token: return access_token
            
    raise Exception("인증 토큰 또는 서비스 계정 키를 찾을 수 없습니다.")

# ── 키워드 기반 카테고리 분류 ──
CATEGORY_KEYWORDS = {
    'hackathon': ['해커톤', 'hackathon', 'hack', '메이커톤', '코딩대회'],
    'gamedev': ['게임', 'game', '유니티', 'unity', '언리얼', 'unreal', '게임잼'],
    'dev': ['개발', '프로그래밍', '코딩', 'AI', '인공지능', '앱', '웹', 'SW', '소프트웨어',
            '프론트엔드', '백엔드', '데이터', '클라우드', 'IT', '디지털'],
    'marketing': ['마케팅', '광고', '브랜딩', 'SNS', '콘텐츠', '디지털마케팅',
                  '퍼포먼스', 'PR', '홍보', '미디어', '크리에이터'],
    'contest': ['공모전', '경진대회', '아이디어', '기획', '창업', '스타트업',
                '비즈니스', '사업계획', '피칭', '데모데이'],
    'activity': ['대외활동', '서포터즈', '동아리', '연합', '봉사', '인턴',
                 '체험단', '기자단', '리포터', '앰배서더', '멘토링'],
}
EXCLUDE_KEYWORDS = ['교육', '강의', '수업', '자격증', '시험', '토익', '토플', '학원', '인강']

def classify(title, desc=''):
    text = (title + ' ' + desc).lower()
    for kw in EXCLUDE_KEYWORDS:
        if kw in text:
            return None
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in text:
                return cat
    return 'contest'

# ── 링커리어 크롤링 ──
def crawl_linkareer():
    results = []
    urls = [
        ('https://linkareer.com/list/contest', 'contest'),
        ('https://linkareer.com/list/activity', 'activity'),
    ]
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}

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
                # 중복된 "추천" 태그 제거
                title = re.sub(r'^추천', '', title).strip()
                
                category = classify(title)
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
            print(f"❌ 링커리어 ({default_cat}) 실패: {e}")

    # 중복 제거 (title 기준)
    seen = set()
    unique = []
    for item in results:
        if item['title'] not in seen:
            seen.add(item['title'])
            unique.append(item)
    
    print(f"   → 총 {len(unique)}건 (중복 제거 후)")
    return unique

# ── 올콘 (All-con) 크롤링 ──
def crawl_allcon():
    results = []
    # 공모전, 대외활동 리스트 페이지 (1: 공모전, 2: 대외활동)
    urls = [
        ('https://www.all-con.co.kr/list/contest/1', 'contest'),
        ('https://www.all-con.co.kr/list/contest/2', 'activity')
    ]
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}

    for url, default_cat in urls:
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, 'html.parser')
            # 올콘 리스트 아이템 선택자
            rows = soup.select('.list_card li, .contest_list li, tr')[:20]

            for item in rows:
                title_el = item.select_one('.title a, dt a, h3 a, a')
                if not title_el: continue
                title = title_el.get_text(strip=True)
                if not title or len(title) < 3: continue

                category = classify(title) or default_cat
                
                link_el = item.select_one('a[href]')
                link = ''
                if link_el:
                    href = link_el.get('href', '')
                    if href.startswith('/'): link = 'https://www.all-con.co.kr' + href
                    else: link = href

                results.append({
                    'title': title,
                    'description': '올콘에서 수집된 정보입니다.',
                    'category': category,
                    'deadline': None,
                    'link': link,
                    'source': '올콘',
                })
            print(f"✅ 올콘 ({default_cat}): {len(items)}건 스캔")
        except Exception as e:
            print(f"❌ 올콘 ({default_cat}) 실패: {e}")
    return results

# ── 위비티 (Wevity) 크롤링 ──
def crawl_wevity():
    results = []
    # 위비티는 공모전 위주
    url = 'https://www.wevity.com/?c=find&s=1'
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        # 위비티 리스트 아이템 선택자
        items = soup.select('.list li')[:20]

        for item in items:
            title_el = item.select_one('.tit a')
            if not title_el: continue
            title = title_el.get_text(strip=True)
            if not title: continue

            category = classify(title) or 'contest'
            
            href = title_el.get('href', '')
            link = 'https://www.wevity.com/' + href if href else ''

            results.append({
                'title': title,
                'description': '위비티에서 수집된 정보입니다.',
                'category': category,
                'deadline': None,
                'link': link,
                'source': '위비티',
            })
        print(f"✅ 위비티: {len(items)}건 스캔")
    except Exception as e:
        print(f"❌ 위비티 실패: {e}")
    return results

# ── 캠퍼스픽 (Campuspick) 크롤링 ──
def crawl_campuspick():
    results = []
    urls = [
        ('https://www.campuspick.com/activity', 'activity'),
        ('https://www.campuspick.com/contest', 'contest')
    ]
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }

    for url, default_cat in urls:
        try:
            # 캠퍼스픽 보안 우회를 위해 Referer와 더 상세한 헤더 추가
            headers['Referer'] = 'https://www.campuspick.com/'
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, 'html.parser')
            # 캠퍼스픽 아이템 선택자 재확인 (item 클래스를 가진 a 태그 내부의 h3)
            items = soup.select('a.item')[:20]

            for item in items:
                title_el = item.select_one('h3')
                if not title_el: continue
                title = title_el.get_text(strip=True)
                if not title or len(title) < 2: continue

                category = classify(title) or default_cat
                href = item.get('href', '')
                link = 'https://www.campuspick.com' + href if href.startswith('/') else href

                results.append({
                    'title': title,
                    'description': '캠퍼스픽에서 수집된 정보입니다.',
                    'category': category,
                    'deadline': None,
                    'link': link,
                    'source': '캠퍼스픽',
                })
            print(f"✅ 캠퍼스픽 ({default_cat}): {len(items)}건 스캔")
        except Exception as e:
            print(f"❌ 캠퍼스픽 ({default_cat}) 실패: {e}")
    return results

# ── Firestore REST API로 업로드 ──
def upload_to_firestore(items, token):
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }
    
    # 서버의 기존 데이터 확인 (중복 방지)
    existing_titles_norm = set()
    try:
        existing_resp = requests.get(FIRESTORE_URL, headers=headers, params={'pageSize': 100})
        if existing_resp.status_code == 200:
            docs = existing_resp.json().get('documents', [])
            for doc in docs:
                fields = doc.get('fields', {})
                t = fields.get('title', {}).get('stringValue', '')
                if t:
                    # 제목 정규화 (공백 제거)
                    norm_t = re.sub(r'\s+', '', t)
                    existing_titles_norm.add(norm_t)
    except:
        pass
    
    saved, skipped = 0, 0
    for item in items:
        # 현재 아이템 제목 정규화
        norm_title = re.sub(r'\s+', '', item['title'])
        
        if norm_title in existing_titles_norm:
            skipped += 1
            continue
        
        doc = {
            'fields': {
                'title': {'stringValue': item['title']},
                'description': {'stringValue': item['description']},
                'category': {'stringValue': item['category']},
                'link': {'stringValue': item['link'] or ''},
                'source': {'stringValue': item['source']},
                'authorUid': {'stringValue': 'crawler'},
                'authorName': {'stringValue': 'NextWave Bot'},
                'createdAt': {'timestampValue': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')},
            }
        }
        
        resp = requests.post(FIRESTORE_URL, headers=headers, json=doc)
        if resp.status_code in (200, 201):
            saved += 1
            existing_titles_norm.add(norm_title)
            print(f"  ✅ [{item['source']}] {item['title']}")
        else:
            skipped += 1
    
    print(f"\n📊 결과: {saved}건 새로 저장, {skipped}건 중복/실패 스킵")
    return saved

# ── 메인 ──
if __name__ == '__main__':
    print("=" * 50)
    print("🚀 NextWave Mega Crawler (Linkareer, All-con, Wevity, Campuspick)")
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50 + "\n")
    
    print("🔑 Firebase 토큰 가져오는 중...")
    try:
        token = get_access_token()
        print("✅ 토큰 획득 성공!\n")
    except Exception as e:
        print(f"❌ 토큰 획득 실패: {e}")
        exit(1)
    
    all_raw_items = []
    
    # 수집 소스 리스트
    sources = [
        ("링커리어", crawl_linkareer),
        ("올콘", crawl_allcon),
        ("위비티", crawl_wevity),
        ("캠퍼스픽", crawl_campuspick)
    ]
    
    for name, fetch_func in sources:
        print(f"📡 {name} 수집 중...")
        try:
            items = fetch_func()
            all_raw_items.extend(items)
            print("")
        except Exception as e:
            print(f"❌ {name} 오류: {e}\n")
    
    # 클라이언트 측 중복 제거 (제목 정규화 기준)
    seen_norm = set()
    unique_items = []
    for it in all_raw_items:
        norm = re.sub(r'\s+', '', it['title'])
        if norm not in seen_norm:
            seen_norm.add(norm)
            unique_items.append(it)
    
    print(f"📦 총 {len(all_raw_items)}건 수집 → 중복 제거 후 {len(unique_items)}건 선별")
    print(f"🚀 Firestore 업로드 시작...\n")
    
    upload_to_firestore(unique_items, token)
    
    print("\n✅ 모든 사이트 수집 및 동기화 완료!")
