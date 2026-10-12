#!/usr/bin/env python3
"""Fetch public opportunity metadata. Writes a snapshot; never authenticates or mutates Firebase."""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import re
import ssl
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

import certifi
from bs4 import BeautifulSoup

MANAGED_BY = "nextwave-crawler"
CLASSIFICATION_VERSION = 4
USER_AGENT = "NextWavePortal/2.0 (+https://wenw.ceo)"
KST_URL = "https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do"
WEV_URL = "https://www.wevity.com/"
THINKYOU_URL = "https://thinkyou.co.kr/contest/"
HOLA_URL = "https://holaworld.io/hola-it"
HOLA_API = "https://api.holaworld.io/api/events"
DACON_URL = "https://dacon.io/competitions"
NMC_HEALTH_URL = "https://www.nmcpublicedu.or.kr/info.asp"
SOURCES = {
    "kstartup": {"id": "kstartup", "name": "K-Startup", "url": KST_URL},
    "wevity": {"id": "wevity", "name": "위비티", "url": WEV_URL + "?c=find&s=1"},
    "thinkyou": {"id": "thinkyou", "name": "씽유", "url": THINKYOU_URL},
    "hola": {"id": "hola", "name": "Hola IT", "url": HOLA_URL},
    "dacon": {"id": "dacon", "name": "DACON", "url": DACON_URL},
    "nmc_health": {"id": "nmc_health", "name": "국립중앙의료원", "url": NMC_HEALTH_URL},
}
ALLOWED_HOSTS = {"www.k-startup.go.kr", "www.wevity.com", "thinkyou.co.kr", "holaworld.io", "api.holaworld.io", "dacon.io", "www.nmcpublicedu.or.kr"}
CATEGORIES = {"startup", "hackathon", "gamedev", "dev", "marketing", "contest", "activity", "education", "internship"}
HEALTH_SUBJECT = re.compile(r"보건의료|공공의료|의료|임상|디지털\s*헬스|헬스케어|바이오헬스|재활|치매|건강|의약|제약|간호|medical|healthcare|biomedical|rehabilitation", re.I)
COMPETITION_TYPE = re.compile(r"공모전|경진대회|해커톤|데이터톤|챌린지|아이디어\s*대회|contest|competition|challenge|hackathon|datathon", re.I)
KST = timezone(timedelta(hours=9))
MAX_BYTES = 3_000_000


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def valid_date(value):
    """Only an explicit, valid full calendar date is accepted; D-day is not a date."""
    match = re.search(r"(?<!\d)(20\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})(?!\d)", value or "")
    if not match:
        return None
    try:
        return date(*map(int, match.groups())).isoformat()
    except ValueError:
        return None


def safe_source_url(url):
    parsed = urlparse(url)
    if (parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS
            or parsed.username or parsed.password or parsed.port not in (None, 443)):
        raise ValueError("Unsupported source URL")
    return url


def source_item_id(source_id, url):
    safe_source_url(url)
    parsed = urlparse(url)
    expected = {"kstartup": "www.k-startup.go.kr", "wevity": "www.wevity.com",
                "thinkyou": "thinkyou.co.kr", "hola": "holaworld.io", "dacon": "dacon.io", "nmc_health": "www.nmcpublicedu.or.kr"}.get(source_id)
    if source_id not in SOURCES or parsed.hostname != expected:
        raise ValueError("Source and URL do not match")
    if source_id in ("kstartup", "wevity"):
        key = "pbancSn" if source_id == "kstartup" else "ix"
        value = parse_qs(parsed.query).get(key, [""])[0]
        valid = re.fullmatch(r"\d{1,12}", value)
    elif source_id == "hola":
        match = re.fullmatch(r"/hola-it/([a-f0-9]{24})", parsed.path)
        value, valid = (match.group(1), True) if match else ("", False)
    elif source_id == "dacon":
        match = re.fullmatch(r"/competitions/official/(\d{1,12})/overview/?", parsed.path)
        value, valid = (match.group(1), True) if match else ("", False)
    elif source_id == "thinkyou":
        match = re.fullmatch(r"/contest/(\d{1,12})/?", parsed.path)
        value, valid = (match.group(1), not parsed.query) if match else ("", False)
    else:
        value, valid = "public_health_contest", parsed.path == "/info.asp" and not parsed.query
    if not valid:
        raise ValueError("Source record has no stable ID")
    return "auto_" + source_id + "_" + value


def classify_category(title, source_category="", default="contest"):
    """Classify the requested activity/output, not its AI tool or broad source tag list."""
    text = title.lower()
    patterns = [
        ("hackathon", r"해커톤|메이커톤|hackathon|makeathon|코딩대회"),
        ("gamedev", r"게임|유니티|언리얼|\bgame\b|\bunity\b|\bunreal\b"),
        ("education", r"교육|아카데미|부트캠프|강의|워크숍"),
        ("internship", r"인턴|internship"),
        # A volunteer role or networking event stays an activity, including AI events.
        ("activity", r"자원활동가|봉사활동|봉사자|서포터즈|기자단|리포터|앰배서더|대외활동|교류회|멘토링|네트워킹"),
        # AI-assisted ads/videos are still creative/marketing opportunities.
        ("marketing", r"마케팅|광고|브랜딩|홍보|숏폼|영상|콘텐츠"),
        # Avoid matching 개발 inside an institution name such as 연구개발특구진흥재단.
        ("dev", r"소프트웨어|프로그래밍|데이터|인공지능|\bai\b|코딩|\bsw\b|개발자|(?:제품|앱|웹|서비스|기술)\s*개발|(?<![가-힣])개발(?![가-힣])"),
        ("contest", r"공모전|경진대회|챌린지|아이디어|피칭|\bir\b.*대회"),
        ("activity", r"봉사|페스티벌"),
    ]
    for category, pattern in patterns:
        if re.search(pattern, text):
            return category
    # Only an exact, narrow source label may decide an otherwise ambiguous title.
    # A comma-separated aggregator tag buffet must not turn everything into dev/game.
    source_defaults = {
        "봉사활동": "activity", "대외활동/서포터즈": "activity", "행사ㆍ네트워크": "activity",
        "멘토링ㆍ컨설팅ㆍ교육": "education", "창업교육": "education",
        "광고/마케팅": "marketing",
    }
    return source_defaults.get(clean(source_category), default)


def category_for_source(source_id, title, source_category=""):
    # An explicit competition type is stronger evidence than the word "AI" in its title.
    if source_id == "hola" and source_category in ("hackathon", "contest"):
        return source_category
    if source_id == "dacon":
        return "hackathon" if re.search(r"해커톤|hackathon", title, re.I) else "contest"
    if source_id == "nmc_health":
        return "contest"
    return classify_category(title, source_category, "startup" if source_id == "kstartup" else "contest")


def health_topics(title):
    """Label only health competitions, not conferences, courses, or generic agency news."""
    return ["health"] if HEALTH_SUBJECT.search(title) and COMPETITION_TYPE.search(title) else []


def reclassify_snapshot(snapshot):
    """Apply local categorization rules without pretending that sources were fetched again."""
    updated = deepcopy(snapshot)
    for item in updated.get("items", []):
        item["category"] = category_for_source(item["sourceId"], item["title"], item.get("sourceCategory", ""))
        item["topics"] = health_topics(item["title"])
    updated["classificationVersion"] = CLASSIFICATION_VERSION
    return updated


def make_item(source_id, title, link, deadline, organizer="", source_category="", **extra):
    title = clean(title)
    if not 3 <= len(title) <= 400:
        raise ValueError("Invalid title")
    source = SOURCES[source_id]
    return {
        "id": source_item_id(source_id, link), "title": title,
        "description": " · ".join(filter(None, [clean(organizer), clean(source_category)])),
        "category": category_for_source(source_id, title, source_category),
        "topics": health_topics(title),
        "deadline": valid_date(deadline), "link": link,
        "source": source["name"], "sourceId": source_id, "sourceUrl": source["url"],
        "organizer": clean(organizer), "sourceCategory": clean(source_category),
        "managedBy": MANAGED_BY, "authorUid": "crawler", "authorName": "NextWave Bot",
        **extra,
    }


def parse_kstartup(html):
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("#bizPbancList > ul > li")
    if not cards:
        raise ValueError("K-Startup list structure changed or returned no records")
    items = []
    for card in cards:
        anchor = card.select_one(".middle a")
        title = card.select_one(".middle .tit")
        if not anchor or not title:
            raise ValueError("K-Startup record missing title/link")
        match = re.fullmatch(r"javascript:go_view\((\d+)\);?", anchor.get("href", ""))
        if not match:
            raise ValueError("K-Startup record has an unrecognized detail link")
        metadata = [clean(node.get_text(" ", strip=True)) for node in card.select(".bottom .list")]
        def metadata_date(label):
            return valid_date(next((s for s in metadata if s.startswith(label)), ""))
        deadline = metadata_date("마감일자")
        if not deadline:
            raise ValueError("K-Startup deadline missing or invalid")
        flags = [clean(n.get_text(" ", strip=True)) for n in card.select(".top .flag")
                 if "agency" not in n.get("class", []) and "day" not in n.get("class", [])]
        organizer = metadata[1] if len(metadata) >= 2 else ""
        link = KST_URL + "?" + urlencode({"schM": "view", "pbancSn": match.group(1)})
        items.append(make_item("kstartup", title.get_text(" ", strip=True), link, deadline,
                               organizer, " / ".join(flags), startDate=metadata_date("시작일자"),
                               publishedAt=metadata_date("등록일자")))
    return items


def parse_wevity_links(html):
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select(".ms-list .list > li")
    if not cards:
        raise ValueError("Wevity list structure changed or returned no records")
    links = []
    for card in cards:
        anchor = card.select_one(".tit > a[href]")
        if not anchor:
            continue  # table heading
        href = anchor.get("href", "")
        if not href.startswith("?"):
            raise ValueError("Unrecognized Wevity detail link")
        item_id = source_item_id("wevity", WEV_URL + href).rsplit("_", 1)[1]
        link = WEV_URL + "?" + urlencode({"c": "find", "s": "1", "gbn": "view", "ix": item_id})
        if link not in links:
            links.append(link)
    if not links:
        raise ValueError("Wevity returned no detail links")
    return links


def eligible_audience(audience):
    return not audience or any(word in audience for word in ("대학생", "일반인", "누구나", "제한없음"))


def parse_wevity_detail(html, link):
    soup = BeautifulSoup(html, "html.parser")
    title = soup.select_one(".tit-area h6.tit")
    if not title:
        raise ValueError("Wevity detail title is missing")
    fields = {}
    for row in soup.select(".cd-area .info li"):
        label = row.select_one("span.tit")
        if label:
            key = clean(label.get_text(" ", strip=True))
            label.extract()
            for badge in row.select(".cil-dday"):
                badge.decompose()
            fields[key] = clean(row.get_text(" ", strip=True))
    if "접수기간" not in fields:
        raise ValueError("Wevity application period missing")
    periods = fields["접수기간"].split("~")
    start = valid_date(periods[0]) if len(periods) == 2 else None
    deadline = valid_date(periods[-1])
    if not deadline and not re.search(r"상시|수시|소진", fields["접수기간"]):
        raise ValueError("Wevity deadline invalid")
    audience = fields.get("응모대상", "")
    # Do not fill a university startup board with school-only opportunities.
    if not eligible_audience(audience):
        return None
    return make_item("wevity", title.get_text(" ", strip=True), link, deadline,
                     fields.get("주최/주관", ""), fields.get("분야", ""),
                     startDate=start, audience=audience, applicationPeriod=fields["접수기간"])


def parse_thinkyou_list(html):
    """Read only the public listing's title, organizer, period and status."""
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select(".tr .title a[href]")
    if not rows:
        raise ValueError("Thinkyou list structure changed or returned no records")
    items = []
    for anchor in rows:
        match = re.match(r"^/contest/(\d{1,12})/(?:\?|$)", anchor.get("href", ""))
        if not match:
            continue
        row = anchor.find_parent(class_="tr")
        title = row.select_one(".title h3")
        period = row.select_one(".etc")
        state = row.select_one(".statNew")
        if not title or not period or not state:
            raise ValueError("Thinkyou card missing title, period or status")
        dates = re.fullmatch(r"(\d{2})-(\d{2})-(\d{2})\s*~\s*(\d{2})-(\d{2})-(\d{2})", clean(period.get_text(" ", strip=True)))
        if not dates:
            raise ValueError("Thinkyou application period changed")
        y1, m1, d1, y2, m2, d2 = dates.groups()
        start = valid_date(f"20{y1}-{m1}-{d1}")
        deadline = valid_date(f"20{y2}-{m2}-{d2}")
        if not start or not deadline or start > deadline:
            raise ValueError("Thinkyou application dates invalid")
        label = clean(state.get_text(" ", strip=True))
        if label.startswith(("접수중", "마감임박")):
            recruitment = "open"
        elif label.startswith("접수예정"):
            recruitment = "upcoming"
        elif label.startswith("마감"):
            recruitment = "closed"
        else:
            raise ValueError("Thinkyou recruitment state changed")
        organizer_node = row.select_one(".title dd")
        organizer = re.sub(r"^주최\s*:\s*", "", clean(organizer_node.get_text(" ", strip=True))) if organizer_node else ""
        item = make_item("thinkyou", title.get_text(" ", strip=True),
                         f"https://thinkyou.co.kr/contest/{match.group(1)}/", deadline,
                         organizer, "공모전", startDate=start, recruitmentStatus=recruitment,
                         applicationPeriod=f"{start} ~ {deadline}")
        if recruitment == "closed":
            item.update(status="archived", archivedReason="source_closed")
        items.append(item)
    if not items:
        raise ValueError("Thinkyou returned no contest records")
    return items


def hola_date(value):
    """Convert an explicit ISO timestamp to a calendar day in Korea."""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(KST).date().isoformat()
    except (AttributeError, TypeError, ValueError):
        return None


def parse_hola_events(payload):
    """Keep only the public event listing's small metadata, never its HTML content."""
    events = json.loads(payload)
    if not isinstance(events, list) or not events:
        raise ValueError("Hola event list structure changed or returned no records")
    items = []
    for event in events:
        if not isinstance(event, dict) or event.get("eventType") not in ("hackathon", "contest"):
            continue
        if event.get("isDeleted") or event.get("status") != "approved":
            continue
        event_id = event.get("_id", "")
        if not isinstance(event_id, str) or not re.fullmatch(r"[a-f0-9]{24}", event_id):
            raise ValueError("Hola event has no stable ID")
        deadline = hola_date(event.get("applicationEndDate"))
        if not deadline:
            raise ValueError("Hola event has no valid application end date")
        link = HOLA_URL + "/" + event_id
        closed = event.get("isClosed") is True or event.get("_closed") is True
        item = make_item("hola", event.get("title", ""), link, deadline,
                         event.get("organization", ""), event["eventType"],
                         startDate=hola_date(event.get("applicationStartDate")),
                         recruitmentStatus="closed" if closed else "open")
        if closed:
            item.update(status="archived", archivedReason="source_closed")
        items.append(item)
    return items


def parse_dacon_list(html):
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select(".official-comp .comp")
    if not cards:
        raise ValueError("DACON competition list structure changed or returned no records")
    items = []
    for card in cards:
        anchor = card.select_one('a[href]')
        title = card.select_one('.name')
        state = card.select_one('.dday')
        if not anchor or not title or not state:
            raise ValueError("DACON card missing title/link/state")
        href = anchor.get("href", "")
        if not re.fullmatch(r"/competitions/official/\d{1,12}/overview/?", href):
            continue  # Non-official competition routes have a different contract.
        label = clean(state.get_text(" ", strip=True))
        if label not in ("참가신청중", "마감"):
            continue  # Practice/open play does not mean accepting applications.
        item = make_item("dacon", title.get_text(" ", strip=True), "https://dacon.io" + href,
                         None, "", "AI 데이터 경진대회", recruitmentStatus="open" if label == "참가신청중" else "closed")
        if label == "마감":
            item.update(status="archived", archivedReason="source_closed")
        items.append(item)
    return items


def parse_nmc_health_contest(html, today=None):
    """Read the official annual public-health contest rules, not submission forms."""
    soup = BeautifulSoup(html, "html.parser")
    title = clean(soup.title.get_text(" ", strip=True)) if soup.title else ""
    match = re.fullmatch(r"(20\d{2})년 대국민 공공의료 공모전", title)
    if not match:
        raise ValueError("National Medical Center contest title changed")
    text = clean(soup.get_text(" ", strip=True))
    if "대한민국 국민 누구나" not in text or "개인 또는 4인 이내 팀/기관" not in text:
        raise ValueError("National Medical Center eligibility changed")
    period = re.search(r"접수기간\s*(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\.[^~]{0,20}~\s*(\d{1,2})\.\s*(\d{1,2})\.", text)
    if not period or period.group(1) != match.group(1):
        raise ValueError("National Medical Center application period changed")
    year, start_month, start_day, end_month, end_day = period.groups()
    start = valid_date(f"{year}-{start_month}-{start_day}")
    deadline = valid_date(f"{year}-{end_month}-{end_day}")
    if not start or not deadline or start > deadline:
        raise ValueError("National Medical Center application dates invalid")
    end_time = re.search(r"(\d{1,2}):(\d{2})", text[period.end():period.end() + 30])
    closing_hour = int(end_time.group(1)) if end_time else None
    closing_minute = int(end_time.group(2)) if end_time else None
    if closing_hour is not None and (closing_hour >= 24 or closing_minute >= 60):
        raise ValueError("National Medical Center application time invalid")
    close_at = f" {closing_hour:02d}:{closing_minute:02d} KST" if end_time else ""
    if today:
        now = datetime.fromisoformat(today)
        now = now.astimezone(KST) if now.tzinfo else now.replace(tzinfo=KST)
    else:
        now = datetime.now(KST)
    current_day = now.date().isoformat()
    past_closing_time = current_day == deadline and end_time and (now.hour, now.minute) >= (closing_hour, closing_minute)
    state = "upcoming" if current_day < start else "closed" if current_day > deadline or past_closing_time else "open"
    item = make_item("nmc_health", title, NMC_HEALTH_URL, deadline, "보건복지부 / 국립중앙의료원",
                     "공공의료 공모전", startDate=start,
                     audience="대한민국 국민 누구나 · 개인 또는 4인 이내 팀/기관 (전공 제한 명시 없음)",
                     applicationPeriod=f"{start} ~ {deadline}{close_at}", recruitmentStatus=state)
    if state == "closed":
        item.update(status="archived", archivedReason="deadline_passed")
    return [item]


class SafeRedirectHandler(HTTPRedirectHandler):
    def __init__(self, robots):
        super().__init__()
        self.robots = robots

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        safe_source_url(newurl)
        original = urlparse(req.full_url)
        target = urlparse(newurl)
        if original.hostname != target.hostname:
            raise ValueError("Cross-host source redirect is not allowed")
        # The robots file itself may redirect within the same host. Other targets
        # must satisfy that host's already checked robots rules too.
        if original.path != "/robots.txt":
            if target.hostname not in self.robots or not robots_allows(self.robots[target.hostname], newurl):
                raise ValueError("Redirect target is not allowed by robots.txt")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def robots_allows(text, url):
    """Apply longest matching Allow/Disallow rules, including wildcard paths."""
    groups, agents, rules = [], [], []
    for raw in text.splitlines() + ["User-agent: __end__"]:
        line = raw.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        key, value = (part.strip() for part in line.split(":", 1))
        key = key.lower()
        if key == "user-agent":
            if rules:
                groups.append((agents, rules))
                agents, rules = [], []
            agents.append(value.lower())
        elif key in ("allow", "disallow") and agents and value:
            rules.append((key, value))
    specific = [(a, r) for a, r in groups if any(x != "*" and x in USER_AGENT.lower() for x in a)]
    selected = specific or [(a, r) for a, r in groups if "*" in a]
    parsed = urlparse(url)
    path = parsed.path + (("?" + parsed.query) if parsed.query else "")
    matches = []
    for _, entries in selected:
        for key, pattern in entries:
            ending = pattern.endswith("$")
            pattern = pattern[:-1] if ending else pattern
            regex = "^" + re.escape(pattern).replace(r"\*", ".*") + ("$" if ending else "")
            if re.search(regex, path):
                matches.append((len(pattern.replace("*", "")), key == "allow"))
    return max(matches, default=(0, True))[1]


class PublicFetcher:
    def __init__(self, delay=1.5):
        self.robots = {}
        # Use an explicit maintained CA bundle; macOS Python often lacks system roots.
        self.opener = build_opener(SafeRedirectHandler(self.robots), HTTPSHandler(context=ssl.create_default_context(cafile=certifi.where())))
        self.delay = delay
        self.last_request = {}

    def _request(self, url):
        safe_source_url(url)
        host = urlparse(url).hostname
        for attempt in range(3):
            time.sleep(max(0, self.delay - (time.monotonic() - self.last_request.get(host, 0))))
            self.last_request[host] = time.monotonic()
            try:
                request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/json;q=0.9,text/plain;q=0.8"})
                with self.opener.open(request, timeout=20) as response:
                    raw = response.read(MAX_BYTES + 1)
                    if len(raw) > MAX_BYTES:
                        raise ValueError("Source response exceeds size limit")
                    charset = response.headers.get_content_charset() or "utf-8"
                    return raw.decode(charset)
            except HTTPError as exc:
                if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                    raise
                # Bounded Retry-After avoids hammering throttled sources.
                retry_after = exc.headers.get("Retry-After", "")
                time.sleep(min(30, int(retry_after)) if retry_after.isdigit() else 2 ** (attempt + 1))
            except (URLError, TimeoutError):
                if attempt == 2:
                    raise
                time.sleep(2 ** (attempt + 1))

    def get(self, url):
        safe_source_url(url)
        parsed = urlparse(url)
        if parsed.hostname not in self.robots:
            try:
                self.robots[parsed.hostname] = self._request(f"https://{parsed.hostname}/robots.txt")
            except HTTPError as exc:
                if exc.code == 404:
                    self.robots[parsed.hostname] = ""
                else:
                    raise
        if not robots_allows(self.robots[parsed.hostname], url):
            raise ValueError("Source robots.txt disallows this URL")
        return self._request(url)


def crawl_sources(fetcher, pages=3, detail_limit=45):
    items, statuses = [], []
    for source_id, source in SOURCES.items():
        fetched, errors = [], []
        if source_id == "kstartup":
            for page in range(1, pages + 1):
                try:
                    fetched.extend(parse_kstartup(fetcher.get(KST_URL + "?" + urlencode({"page": page}))))
                except Exception as exc:
                    errors.append(f"목록 {page}: {type(exc).__name__}")
        elif source_id == "wevity":
            links = []
            for page in range(1, pages + 1):
                try:
                    url = WEV_URL + "?" + urlencode({"c": "find", "s": "1", "gp": page})
                    links.extend(parse_wevity_links(fetcher.get(url)))
                except Exception as exc:
                    errors.append(f"목록 {page}: {type(exc).__name__}")
            for link in list(dict.fromkeys(links))[:detail_limit]:
                try:
                    item = parse_wevity_detail(fetcher.get(link), link)
                    if item:
                        fetched.append(item)
                except Exception as exc:
                    errors.append(f"상세 {source_item_id(source_id, link)}: {type(exc).__name__}")
        elif source_id == "thinkyou":
            for page in range(1, pages + 1):
                try:
                    url = THINKYOU_URL + "?" + urlencode({"page": page, "pagesize": 45})
                    fetched.extend(parse_thinkyou_list(fetcher.get(url)))
                except Exception as exc:
                    errors.append(f"목록 {page}: {type(exc).__name__}")
        elif source_id == "hola":
            for event_type in ("hackathon", "contest"):
                for page in range(1, 3):
                    try:
                        url = HOLA_API + "?" + urlencode({"eventType": event_type, "page": page})
                        fetched.extend(parse_hola_events(fetcher.get(url)))
                    except Exception as exc:
                        errors.append(f"{event_type} 목록 {page}: {type(exc).__name__}")
        elif source_id == "dacon":
            try:
                fetched.extend(parse_dacon_list(fetcher.get(DACON_URL)))
            except Exception as exc:
                errors.append(f"목록: {type(exc).__name__}")
        elif source_id == "nmc_health":
            try:
                fetched.extend(parse_nmc_health_contest(fetcher.get(NMC_HEALTH_URL)))
            except Exception as exc:
                errors.append(f"공모요강: {type(exc).__name__}")
        fetched = list({item["id"]: item for item in fetched}.values())
        status = {**source, "status": "partial" if fetched and errors else "error" if errors else "ok",
                  "checkedAt": utc_now(), "itemCount": len(fetched), "errorCount": len(errors)}
        if errors:
            status["error"] = "; ".join(errors[:3])
        statuses.append(status)
        items.extend(fetched)
        print(f"{source['name']}: {status['status']}, {len(fetched)}건, 오류 {len(errors)}건", flush=True)
    return items, statuses


def is_expired_public_item(item, today):
    """Only a crawler-owned record with an exact, confirmed past date may be removed."""
    deadline = item.get("deadline")
    return (item.get("managedBy") == MANAGED_BY and item.get("authorUid") == "crawler"
            and isinstance(deadline, str) and valid_date(deadline) == deadline
            and date.fromisoformat(deadline) < today)


def prune_expired_snapshot(snapshot, now=None):
    """Remove expired public imports without claiming a new source check or touching other data."""
    today = datetime.fromisoformat((now or utc_now()).replace("Z", "+00:00")).astimezone(KST).date()
    updated = deepcopy(snapshot)
    updated["items"] = [item for item in updated.get("items", []) if not is_expired_public_item(item, today)]
    return updated


def merge_snapshot(previous, incoming, sources, now=None):
    now = now or utc_now()
    today = datetime.fromisoformat(now.replace("Z", "+00:00")).astimezone(KST).date()
    old_sources = {s["id"]: s for s in previous.get("sources", [])}
    updated_sources = []
    for source in sources:
        source = deepcopy(source)
        source["lastSuccessAt"] = now if source["status"] == "ok" else old_sources.get(source["id"], {}).get("lastSuccessAt")
        updated_sources.append(source)
    records = {x["id"]: deepcopy(x) for x in previous.get("items", []) if x.get("managedBy") == MANAGED_BY}
    for item in incoming:
        old = records.get(item["id"], {})
        records[item["id"]] = {**item, "firstSeenAt": old.get("firstSeenAt", now), "lastSeenAt": now,
                               "createdAt": old.get("createdAt", now), "status": item.get("status", "active")}
        if item.get("status") == "archived":
            records[item["id"]]["archivedAt"] = old.get("archivedAt", now)
    successful = {s["id"] for s in sources if s["status"] == "ok"}
    for item in records.values():
        deadline = valid_date(item.get("deadline"))
        last_seen = datetime.fromisoformat(item["lastSeenAt"].replace("Z", "+00:00")).astimezone(KST).date()
        reason = None
        if not eligible_audience(item.get("audience", "")):
            reason = "audience_not_eligible"
        elif not deadline and item["sourceId"] in successful and (today - last_seen).days > 30:
            reason = "not_seen_30_days"
        if reason:
            item.update(status="archived", archivedReason=reason, archivedAt=item.get("archivedAt", now))
    records = sorted(records.values(), key=lambda x: (x.get("status") != "active", x.get("deadline") or "9999-12-31", x["id"]))
    return prune_expired_snapshot(reclassify_snapshot({"schemaVersion": 1, "generatedAt": now,
            "lastSuccessAt": now if any(s["status"] == "ok" for s in sources) else previous.get("lastSuccessAt"),
            "refreshIntervalMinutes": 60, "sources": updated_sources, "items": records}), now)


def validate_snapshot(snapshot):
    if snapshot.get("schemaVersion") != 1 or not isinstance(snapshot.get("items"), list):
        raise ValueError("Unsupported snapshot schema")
    seen = set()
    for item in snapshot["items"]:
        if item.get("managedBy") != MANAGED_BY or item.get("authorUid") != "crawler":
            raise ValueError("Snapshot contains a non-crawler item")
        if item.get("id") != source_item_id(item["sourceId"], item["link"]) or item["id"] in seen:
            raise ValueError("Invalid or duplicate stable ID")
        seen.add(item["id"])
        if item.get("category") not in CATEGORIES or item.get("status") not in ("active", "archived"):
            raise ValueError("Invalid item category/status")
        if item.get("topics", []) not in ([], ["health"]):
            raise ValueError("Invalid item topic")
        if item.get("deadline") is not None and valid_date(item["deadline"]) != item["deadline"]:
            raise ValueError("Invalid deadline")
        if not 3 <= len(item.get("title", "")) <= 400:
            raise ValueError("Invalid title")
        for key in ("firstSeenAt", "lastSeenAt"):
            if datetime.fromisoformat(item[key].replace("Z", "+00:00")).tzinfo is None:
                raise ValueError("Timestamp must have a timezone")


def read_snapshot(path):
    if not path.exists():
        return {}
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    validate_snapshot(snapshot)
    return snapshot


def write_snapshot(path, snapshot):
    validate_snapshot(snapshot)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("data/opportunities.json"))
    parser.add_argument("--pages", type=int, choices=range(1, 11), default=3)
    parser.add_argument("--detail-limit", type=int, choices=range(1, 101), default=45)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--validate", action="store_true", help="Validate the schema and absence of expired public imports without network access")
    mode.add_argument("--prune-expired", action="store_true", help="Remove confirmed expired public imports without fetching or changing source timestamps")
    args = parser.parse_args(argv)
    if args.validate or args.prune_expired:
        if not args.output.exists():
            parser.error("Snapshot does not exist")
        snapshot = read_snapshot(args.output)
        cleaned = prune_expired_snapshot(snapshot)
        removed = len(snapshot["items"]) - len(cleaned["items"])
        if args.prune_expired:
            write_snapshot(args.output, cleaned)
            print(f"Removed {removed} expired public records; {len(cleaned['items'])} remain. Source timestamps unchanged. No network or Firebase access.")
        else:
            if removed:
                parser.error(f"Snapshot contains {removed} expired public records; run --prune-expired or fetch sources again")
            print(f"Snapshot valid: {len(snapshot['items'])} records; expired public records: 0 (Korean date)")
        return 0
    previous = read_snapshot(args.output)
    incoming, sources = crawl_sources(PublicFetcher(), args.pages, args.detail_limit)
    snapshot = merge_snapshot(previous, incoming, sources)
    write_snapshot(args.output, snapshot)
    active = sum(x["status"] == "active" for x in snapshot["items"])
    print(f"{args.output}: 현재 {active}건 / 보관 {len(snapshot['items']) - active}건. Firebase 변경 없음.")
    # Always persist honest failure status; CI must still report the failed crawl.
    return 1 if any(s["status"] != "ok" for s in sources) else 0


if __name__ == "__main__":
    raise SystemExit(main())
