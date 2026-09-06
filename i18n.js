// =============================================================================
// NextWave — 간단한 한국어/English 전환 (i18n)
//   사용법: HTML 요소에 data-i18n="key" → 해당 키의 번역으로 innerHTML 교체
//           data-i18n-ph="key"        → placeholder 속성 교체
// =============================================================================
window.I18N = (function () {
    const dict = {
        ko: {
            'nav.about': '소개', 'nav.activities': '활동', 'nav.awards': '성과',
            'nav.team': '운영진', 'nav.join': '모집', 'nav.faq': 'FAQ', 'nav.portal': '부원 포털',
            'menu.title': '메뉴',
            'btn.apply': '지원하기', 'btn.applyNow': '지금 지원하기', 'btn.login': '로그인',
            'btn.logout': '로그아웃', 'btn.googleLogin': 'Google 계정으로 로그인', 'btn.googleLoginShort': 'Google 로그인',
            'btn.explore': '활동 둘러보기', 'btn.joinNow': 'NextWave 합류하기',
            'btn.openPortal': '포털 열기', 'btn.viewPortfolio': '포트폴리오 보기', 'btn.close': '닫기',
            'btn.langLabel': 'EN',

            'hero.eyebrow': '📍 순천향대학교 IT·창업 연합 동아리',
            'hero.scroll': '아래로 스크롤 ↓',
            'hero.stage1.kicker': 'NEXTWAVE',
            'hero.stage1.body': 'NEXTWAVE를 두 글자로 줄이면 N과 W. 그 안에 우리가 어떤 팀인지 담겨 있어요.',
            'hero.stage2.kicker': 'N = NEXT · NEW · NETWORK',
            'hero.stage2.title': 'N은,<br>다음을 여는 <span class="text-gradient">시작점.</span>',
            'hero.stage2.body': '이제 막 시작한 사람도, 이미 만들어 본 사람도 — 새로움에 가장 먼저 뛰어드는 팀.',
            'hero.stage3.kicker': 'W = WAVE · WITH · WE',
            'hero.stage3.title': 'W는,<br>같이 밀려오는 <span class="text-gradient">물결.</span>',
            'hero.stage3.body': '개발 · 게임개발 · 해커톤 · 마케팅이 만나, 아이디어가 진짜 결과물로 이어져요.',
            'hero.stage4.kicker': 'NEXT + WAVE',
            'hero.stage4.title': '다음 물결은,<br>같이 만들 때 진짜가 돼요.',
            'hero.stage4.body': '서비스 · 게임 · 대회 · 포트폴리오까지, 수업 밖에서 오래 남을 경험을 함께 만들어요.',
            'hero.stage5.kicker': '다음 물결은 지금 시작',
            'hero.stage5.title': '우리, 같이 만들래요?',
            'hero.stage5.body': '잘해서 들어오는 게 아니라, 같이 해보고 싶어서 오는 곳이에요.',
            'hero.stage2': '개발 · 게임개발 · 해커톤 · 마케팅<br />아이디어를 코드로, 코드를 결과로.',
            'hero.stage3': '우리, 같이 만들래요?',
            'hero.title': '전공은 달라도,<br>우리는 <span class="text-gradient">같이 만든다.</span>',
            'hero.subtitle': '개발, 게임개발, 해커톤, 마케팅까지 다 같이 해요. <br class="hidden sm:block" />아직 잘 몰라도 괜찮아요. <span class="text-ink font-semibold">만들어보고 싶은 마음만 있으면 돼요.</span>',
            'hero.chip1': '🏆 전국·교내 대회 수상 6회', 'hero.chip2': '🎓 전공 무관', 'hero.chip3': '🤝 함께 성장하는 문화',
            'hero.badge': '🎉 신입 모집 중!',

            'stat.awards': '대회 수상', 'stat.members': '함께하는 부원', 'stat.fields': '활동 분야', 'stat.majors': '전공 환영',

            'about.kicker': 'ABOUT US',
            'about.title': '“좋아하는 걸 만들다 보니,<br class="sm:hidden" /> 어느새 실력이 늘어 있더라고요.”',
            'about.body': '<span class="font-bold text-ink">NextWave IT Union</span>은 순천향대학교 IT·창업 연합 동아리예요. 전공 상관없이 모여서 직접 서비스도 만들고, 게임도 내고, 해커톤이랑 창업대회에도 나가요. 잘하는 사람만 있는 게 아니라 <span class="font-bold text-brand-dark">그냥 같이 해보면서 느는</span> 곳이에요.',

            'act.kicker': 'WHAT WE DO', 'act.title': '우리가 하는 일',
            'act.dev.t': '개발', 'act.dev.d': '웹이랑 앱을 기획부터 디자인, 개발, 배포까지 직접 만들어봐요. 팀으로 부딪히면서 배우는 게 많아요.',
            'act.game.t': '게임 개발', 'act.game.d': 'Unity로 게임을 만들어서 Steam에 실제로 내봐요. AI·SW 페스티벌에서 최우수상 받은 멤버들이 같이 해요.',
            'act.hack.t': '해커톤 · 대회', 'act.hack.d': '밤새 아이디어를 코드로 만들어서 해커톤이랑 창업대회에서 결과로 보여줘요. 부딪혀 본 만큼 늘어요.',
            'act.mkt.t': '마케팅 · 기획', 'act.mkt.d': '우리가 만든 걸 알리고 브랜드를 키워요. 개발 전공이 아니어도 잘할 수 있는 자리예요.',

            'aw.kicker': 'ACHIEVEMENTS', 'aw.title': '우리의 발자취 🏅', 'aw.sub': '얼마 안 된 동아리인데, 벌써 이만큼 했어요.',
            'aw.ribbon': '<span class="px-4">🥇 제품제작역량 창업대회 최우수상</span><span class="px-4 text-white/40">•</span><span class="px-4">🥇 AI·SW Festival 게임개발 최우수상 (MAYHEM)</span><span class="px-4 text-white/40">•</span><span class="px-4">🥇 올담 데이터 활용 해커톤 최우수상</span><span class="px-4 text-white/40">•</span><span class="px-4">🥈 START-UP 아이디어 리그 은상</span><span class="px-4 text-white/40">•</span><span class="px-4">🥉 START-UP 아이디어 리그 동상</span><span class="px-4 text-white/40">•</span><span class="px-4">🏅 나눔토론대회 장려상</span><span class="px-4 text-white/40">•</span><span class="px-4">🥇 제품제작역량 창업대회 최우수상</span><span class="px-4 text-white/40">•</span><span class="px-4">🥇 AI·SW Festival 게임개발 최우수상 (MAYHEM)</span><span class="px-4 text-white/40">•</span><span class="px-4">🥇 올담 데이터 활용 해커톤 최우수상</span><span class="px-4 text-white/40">•</span><span class="px-4">🥈 START-UP 아이디어 리그 은상</span><span class="px-4 text-white/40">•</span><span class="px-4">🥉 START-UP 아이디어 리그 동상</span><span class="px-4 text-white/40">•</span><span class="px-4">🏅 나눔토론대회 장려상</span><span class="px-4 text-white/40">•</span>',
            'aw1.t': '제품제작역량 창업대회', 'aw1.s': '최우수상 & 캠프 수료',
            'aw2.t': 'SCHU AI·SW Festival 게임개발경진대회', 'aw2.s': '최우수상 · 게임 「MAYHEM」',
            'aw3.t': '제1회 올담 데이터 활용 해커톤', 'aw3.s': '최우수상',
            'aw4.t': '로컬 창업동아리 아이디어 리그', 'aw4.s': 'START-UP Track-1 은상',
            'aw5.t': '로컬 창업동아리 아이디어 리그', 'aw5.s': 'START-UP Track-1 동상',
            'aw6.t': '순천향대학교 나눔토론대회', 'aw6.s': '장려상',

            'team.kicker': 'TEAM', 'team.title': '함께 이끄는 사람들', 'team.sub': '카드를 누르면 더 자세히 볼 수 있어요.',
            'team.r1': '회장 · President', 'team.d1': '사물인터넷학과 · KAKAO 엠버서더',
            'team.r2': '부회장 · Vice President', 'team.d2': '사물인터넷학과 · 갤럭시 서포터즈',
            'team.r3': '인사총괄 · HR Director', 'team.d3': '메타버스&게임학과 · RAMIC STUDIO 대표',

            'rec.pill': '🎉 신입 부원 모집', 'rec.title': '지금, 다음 물결에 올라탈래요?', 'rec.sub': '전공도 실력도 안 봐요. 해보고 싶은 마음만 있으면 돼요.',
            'rec.t1': '모집 대상', 'rec.d1': '순천향대학교 재학생·휴학생<br />(전공 무관)',
            'rec.t2': '모집 시기', 'rec.d2': '2026학년도 2학기 (예정)<br />상시 문의 환영',
            'rec.t3': '활동 트랙', 'rec.d3': '개발 · 디자인 · 기획<br />원하는 방향으로',
            'rec.step1': '지원서 작성', 'rec.step2': '가벼운 만남·인터뷰', 'rec.step3': 'NextWave 합류! 🚀',
            'rec.note': '버튼이 안 열리면 아래 채널로 편하게 연락 주세요.',

            'faq.kicker': 'FAQ', 'faq.title': '자주 묻는 질문',
            'faq.q1': '개발을 전혀 몰라도 괜찮나요?', 'faq.a1': '네, 괜찮아요. 다들 잘해서 들어온 게 아니라 하면서 배웠어요. 기초부터 시작하는 사람도 많고, 모르면 서로 물어보고 알려줘요.',
            'faq.q2': 'IT 전공이 아니어도 지원할 수 있나요?', 'faq.a2': '그럼요, 전공 안 봐요. 개발 말고도 디자인, 기획, 마케팅처럼 할 수 있는 게 많아서 잘하는 걸로 하면 돼요.',
            'faq.q3': '활동은 얼마나 자주 하나요?', 'faq.a3': '평소엔 정기 모임 위주로 하고, 프로젝트나 대회 때는 팀끼리 더 자주 봐요. 수업이랑 안 겹치게 일정은 맞춰가면서 해요.',
            'faq.q4': '어디에서 활동하나요?', 'faq.a4': '순천향대 캠퍼스에서 주로 만나고, 필요하면 온라인으로도 해요. 부원이 되면 전용 포털에서 공지랑 일정을 한 곳에서 볼 수 있어요.',
            'faq.q5': '지원하면 무엇을 얻어갈 수 있나요?', 'faq.a5': '직접 만든 포트폴리오랑 대회 경험이요. 그리고 무엇보다, 졸업하고도 계속 볼 사람들이 남아요.',

            'mp.kicker': 'MEMBERS ONLY', 'mp.title': '부원 전용 공간 🔐', 'mp.sub': '승인된 부원만 공지·일정을 확인할 수 있어요.',
            'mp.lockMsg': '로그인하고 운영진 승인을 받으면 부원 전용 페이지가 열려요.',
            'mp.latest': '📢 최신 공지', 'mp.shortcutTitle': '🚪 전체 포털 바로가기',
            'mp.shortcutBody': '채팅, 공지, 출석 같은 건 전용 포털에서 다 할 수 있어요.',
            'mp.adminTitle': '⚙️ 관리자 설정', 'mp.adminNote': '승인·권한은 관리자만 변경할 수 있어요.',
            'mp.approve': '승인 부여', 'mp.makeAdmin': '관리자 부여', 'mp.revoke': '권한 회수', 'mp.memberList': '회원 목록',
            'mp.ph': 'UID 또는 이메일',

            'cta.title': '다음 물결은, <span class="text-gradient">당신</span>이에요.', 'cta.sub': '고민된다면 일단 문을 두드려 보세요. 가볍게 시작해도 괜찮아요.',

            'foot.tagline': '순천향대학교 IT·창업 연합 동아리.<br />전공 상관없이 모여서 같이 만들어요.',
            'foot.instagram': '📷 인스타그램', 'foot.kakao': '💬 오픈채팅', 'foot.email': '✉️ 이메일',
            'foot.rights': 'All rights reserved.'
        },
        en: {
            'nav.about': 'About', 'nav.activities': 'Activities', 'nav.awards': 'Achievements',
            'nav.team': 'Team', 'nav.join': 'Join', 'nav.faq': 'FAQ', 'nav.portal': 'Member Portal',
            'menu.title': 'Menu',
            'btn.apply': 'Apply', 'btn.applyNow': 'Apply now', 'btn.login': 'Log in',
            'btn.logout': 'Log out', 'btn.googleLogin': 'Sign in with Google', 'btn.googleLoginShort': 'Google sign-in',
            'btn.explore': 'Explore', 'btn.joinNow': 'Join NextWave',
            'btn.openPortal': 'Open portal', 'btn.viewPortfolio': 'View portfolio', 'btn.close': 'Close',
            'btn.langLabel': '한국어',

            'hero.eyebrow': '📍 IT & Startup Club · Soonchunhyang University',
            'hero.scroll': 'Scroll down ↓',
            'hero.stage1.kicker': 'NEXTWAVE',
            'hero.stage1.body': 'NEXTWAVE, down to two letters — N and W. Inside them is who we are.',
            'hero.stage2.kicker': 'N = NEXT · NEW · NETWORK',
            'hero.stage2.title': 'N means<br>the starting point for <span class="text-gradient">what comes next.</span>',
            'hero.stage2.body': 'Whether you’re just starting or already building, we’re the team that tries new things first.',
            'hero.stage3.kicker': 'W = WAVE · WITH · WE',
            'hero.stage3.title': 'W means<br>a wave that moves <span class="text-gradient">with us.</span>',
            'hero.stage3.body': 'Dev, game dev, hackathons, and marketing come together to turn ideas into real results.',
            'hero.stage4.kicker': 'NEXT + WAVE',
            'hero.stage4.title': 'The next wave<br>gets real when we build it together.',
            'hero.stage4.body': 'Services, games, competitions, portfolios — we build experiences that outlast the classroom, together.',
            'hero.stage5.kicker': 'The next wave starts here',
            'hero.stage5.title': 'Want to build with us?',
            'hero.stage5.body': 'You don’t join because you’re already good — you join because you want to build together.',
            'hero.stage2': 'Development · Game dev · Hackathons · Marketing<br />Ideas into code, code into results.',
            'hero.stage3': 'Want to build with us?',
            'hero.title': 'Different majors,<br>we <span class="text-gradient">build together.</span>',
            'hero.subtitle': 'Development · Game dev · Hackathons · Marketing. <br class="hidden sm:block" />A crew that turns ideas into code, and code into results. <span class="text-ink font-semibold">What matters more than skill is the will to build together — beginners welcome.</span>',
            'hero.chip1': '🏆 6 competition awards', 'hero.chip2': '🎓 All majors', 'hero.chip3': '🤝 Grow together',
            'hero.badge': '🎉 Now recruiting!',

            'stat.awards': 'Awards won', 'stat.members': 'Active members', 'stat.fields': 'Focus areas', 'stat.majors': 'All majors',

            'about.kicker': 'ABOUT US',
            'about.title': '“We just built what we loved —<br class="sm:hidden" /> and got better without even noticing.”',
            'about.body': '<span class="font-bold text-ink">NextWave IT Union</span> is the IT &amp; startup club of Soonchunhyang University. Developers, designers, and planners gather across majors to build real services, ship games, and take on hackathons and startup competitions. It’s not a place only for experts — it’s a place where we <span class="font-bold text-brand-dark">learn and grow together.</span>',

            'act.kicker': 'WHAT WE DO', 'act.title': 'What we do',
            'act.dev.t': 'Development', 'act.dev.d': 'Build web & app services end to end — from planning and design to development and deployment. Real teamwork, real experience.',
            'act.game.t': 'Game Dev', 'act.game.d': 'Make games in Unity and ship them on Steam for real. The members who won our AI·SW Festival grand prize build alongside you.',
            'act.hack.t': 'Hackathons', 'act.hack.d': 'Turn ideas into code overnight, then prove them in hackathons and startup contests. Challenge is how we grow.',
            'act.mkt.t': 'Marketing', 'act.mkt.d': 'Get what we build out into the world and grow the brand. Non-dev majors shine here too.',

            'aw.kicker': 'ACHIEVEMENTS', 'aw.title': 'Our milestones 🏅', 'aw.sub': 'Real results, earned in a short time.',
            'aw.ribbon': '<span class="px-4">🥇 Product Building Startup Competition · Top Excellence Award</span><span class="px-4 text-white/40">•</span><span class="px-4">🥇 AI·SW Festival Game Dev · Top Excellence Award (MAYHEM)</span><span class="px-4 text-white/40">•</span><span class="px-4">🥇 Olldam Data Hackathon · Top Excellence Award</span><span class="px-4 text-white/40">•</span><span class="px-4">🥈 START-UP Idea League · Silver</span><span class="px-4 text-white/40">•</span><span class="px-4">🥉 START-UP Idea League · Bronze</span><span class="px-4 text-white/40">•</span><span class="px-4">🏅 Sharing Debate · Encouragement</span><span class="px-4 text-white/40">•</span><span class="px-4">🥇 Product Building Startup Competition · Top Excellence Award</span><span class="px-4 text-white/40">•</span><span class="px-4">🥇 AI·SW Festival Game Dev · Top Excellence Award (MAYHEM)</span><span class="px-4 text-white/40">•</span><span class="px-4">🥇 Olldam Data Hackathon · Top Excellence Award</span><span class="px-4 text-white/40">•</span><span class="px-4">🥈 START-UP Idea League · Silver</span><span class="px-4 text-white/40">•</span><span class="px-4">🥉 START-UP Idea League · Bronze</span><span class="px-4 text-white/40">•</span><span class="px-4">🏅 Sharing Debate · Encouragement</span><span class="px-4 text-white/40">•</span>',
            'aw1.t': 'Product Building Startup Competition', 'aw1.s': 'Top Excellence Award & Camp completion',
            'aw2.t': 'SCHU AI·SW Festival Game Dev Contest', 'aw2.s': 'Top Excellence Award · game “MAYHEM”',
            'aw3.t': '1st Olldam Data Hackathon', 'aw3.s': 'Top Excellence Award',
            'aw4.t': 'Local Startup Club Idea League', 'aw4.s': 'START-UP Track-1 · Silver',
            'aw5.t': 'Local Startup Club Idea League', 'aw5.s': 'START-UP Track-1 · Bronze',
            'aw6.t': 'SCH Sharing Debate Competition', 'aw6.s': 'Encouragement Award',

            'team.kicker': 'TEAM', 'team.title': 'Meet the people', 'team.sub': 'Tap a card to see more.',
            'team.r1': 'President', 'team.d1': 'IoT Dept. · KAKAO Ambassador',
            'team.r2': 'Vice President', 'team.d2': 'IoT Dept. · Galaxy Supporters',
            'team.r3': 'HR Director', 'team.d3': 'Metaverse&Game Dept. · CEO of RAMIC STUDIO',

            'rec.pill': '🎉 New member recruiting', 'rec.title': 'Ready to catch the next wave?', 'rec.sub': 'No major, no skill bar. Just bring the will to make something.',
            'rec.t1': 'Who can apply', 'rec.d1': 'SCH students &amp; on leave<br />(any major)',
            'rec.t2': 'When', 'rec.d2': '2026 Fall semester (planned)<br />Questions welcome anytime',
            'rec.t3': 'Tracks', 'rec.d3': 'Development · Design · Planning<br />your choice',
            'rec.step1': 'Submit application', 'rec.step2': 'Casual chat / interview', 'rec.step3': 'Join NextWave! 🚀',
            'rec.note': 'If the button doesn’t open, just reach us through the channels below.',

            'faq.kicker': 'FAQ', 'faq.title': 'Frequently asked',
            'faq.q1': 'What if I can’t code at all?', 'faq.a1': 'Totally fine! This isn’t a club only for pros — we learn together. Many start from scratch, and there’s a strong culture of helping each other.',
            'faq.q2': 'Can I apply if I’m not an IT major?', 'faq.a2': 'Of course. Everyone is welcome, any major. Beyond development there are design, planning, and marketing roles, so you can play to your strengths.',
            'faq.q3': 'How often do you meet?', 'faq.a3': 'Regular meetups as a base, plus flexible team gatherings during project or competition seasons. We adjust schedules so it works with your studies.',
            'faq.q4': 'Where do you operate?', 'faq.a4': 'Centered on the SCH campus, both online and offline. Members get a dedicated portal for notices, schedules, and chat in one place.',
            'faq.q5': 'What will I gain?', 'faq.a5': 'A real portfolio you built, award experience, and above all teammates who take on challenges with you. The network that lasts beyond graduation is the biggest asset.',

            'mp.kicker': 'MEMBERS ONLY', 'mp.title': 'Members-only space 🔐', 'mp.sub': 'Only approved members can view notices and schedules.',
            'mp.lockMsg': 'After signing in, only accounts approved by the staff can access the members area.',
            'mp.latest': '📢 Latest notices', 'mp.shortcutTitle': '🚪 Go to full portal',
            'mp.shortcutBody': 'Chat, notices, attendance and more are available in the dedicated portal.',
            'mp.adminTitle': '⚙️ Admin settings', 'mp.adminNote': 'Only admins can change approval and roles.',
            'mp.approve': 'Approve', 'mp.makeAdmin': 'Make admin', 'mp.revoke': 'Revoke', 'mp.memberList': 'Member list',
            'mp.ph': 'UID or email',

            'cta.title': 'The next wave is <span class="text-gradient">you.</span>', 'cta.sub': 'When in doubt, just knock. It’s okay to start small.',

            'foot.tagline': 'IT & startup club of Soonchunhyang University.<br />Across majors, we build and grow together.',
            'foot.instagram': '📷 Instagram', 'foot.kakao': '💬 Open chat', 'foot.email': '✉️ Email',
            'foot.rights': 'All rights reserved.'
        }
    };

    // Field Notes redesign keys. Earlier user-written translations stay intact.
    Object.assign(dict.ko, {
        "field.nav.about": "우리의 방식",
        "field.nav.work": "하는 일",
        "field.nav.record": "실험의 기록",
        "field.portal": "포털",
        "field.hero.rail": "생각을 현실로 만드는 사람들",
        "field.hero.eyebrow": "순천향대학교 IT·창업 연합 동아리",
        "field.hero.title": "생각은 여기서<br /><em>사건</em>이 된다.",
        "field.hero.description": "“이거, 진짜 만들어 볼까?”<br />그 한마디에서 시작하는 우리.<br />전공은 달라도, 만드는 마음은 같으니까.",
        "field.join": "합류 안내",
        "field.explore": "우리가 만드는 것",
        "field.experiment": "작은 생각 실험",
        "field.experiment.caption": "관심사를 눌러, 다음 가능성을 열어 보세요.",
        "field.hack": "해커톤",
        "field.marketing": "마케팅",
        "field.experiment.footer": "정답 대신, 일단 시작.",
        "field.remix": "한 번 더 섞기",
        "field.hero.bottom": "완벽한 계획보다, 함께 만든 첫 번째 결과물.",
        "field.about.title": "혼자였다면 메모.<br />함께라면 <em>다음 물결.</em>",
        "field.about.body": "NextWave는 아이디어를 쌓아 두는 곳이 아닙니다. 개발자, 디자이너, 기획자가 한 팀이 되어 직접 서비스를 만들고, 게임을 출시하고, 창업대회에 도전합니다.",
        "field.about.sub": "잘하는 사람만 모이지 않아도 괜찮아요. 질문하고, 부딪히고, 다시 만들어 보는 사람이면 충분합니다.",
        "field.people": "같이 만들 사람들",
        "field.principle1": "전공의 경계 없이",
        "field.principle2": "아이디어는 실제로",
        "field.principle3": "시작부터 함께",
        "field.work.title": "네 가지 재료.<br />가능성은 그 이상.",
        "field.work.sub": "관심 있는 트랙을 펼쳐 보세요.<br />서로 다른 역할이 만나 하나의 팀이 됩니다.",
        "field.opportunities": "관련 기회 찾기",
        "field.record.title": "말보다, 남긴 것들.",
        "field.record.sub": "직접 도전해서 쌓은 여섯 번의 수상 기록.",
        "field.people.label": "프로필을 눌러 만나보세요",
        "field.team.title": "일을 벌이는 사람들.",
        "field.team.sub": "만드는 사람 곁에는,<br />늘 같이 만드는 사람이 있습니다.",
        "field.desk.title": "다음 도전은<br />여기 모아뒀어요.",
        "field.desk.body": "창업 지원과 공모전 정보를 확인하고,<br />부원 공간에서 팀의 대화를 이어가세요.",
        "field.desk.ticket": "기회를 발견하고.<br />동료와 연결되고.",
        "field.desk.open": "포털 열기",
        "field.join.title": "다음은,<br /><span>당신 차례.</span>",
        "field.join.body": "엄청난 아이디어가 없어도, 아직 서툴러도.<br />“같이 해볼래?”에 마음이 움직였다면.",
        "field.join.tracks": "개발 · 게임 · 해커톤 · 마케팅",
        "field.join.status": "모집 일정",
        "field.join.schedule": "확정 일정은 모집 공지로 안내합니다.",
        "field.join.step3": "NextWave 합류",
        "field.join.pending": "지원서 링크는 준비 중입니다. 공개되면 이곳에서 바로 연결됩니다.",
        "field.faq.title": "조금 더 궁금하다면.",
        "field.footer": "생각을 현실로. 혼자보다 함께."
});
    Object.assign(dict.en, {
        "field.nav.about": "Our approach",
        "field.nav.work": "What we do",
        "field.nav.record": "Field records",
        "field.portal": "Portal",
        "field.hero.rail": "PEOPLE WHO MAKE IDEAS REAL",
        "field.hero.eyebrow": "IT & startup club · Soonchunhyang University",
        "field.hero.title": "Ideas become<br /><em>real</em> here.",
        "field.hero.description": "“What if we actually built it?”<br />That’s where we begin.<br />Different majors. The same urge to make.",
        "field.join": "Join the next wave",
        "field.explore": "See what we make",
        "field.experiment": "A SMALL THOUGHT EXPERIMENT",
        "field.experiment.caption": "Pick an interest. Open up another possibility.",
        "field.hack": "Hackathons",
        "field.marketing": "Marketing",
        "field.experiment.footer": "Less waiting. More making.",
        "field.remix": "Mix it again",
        "field.hero.bottom": "Our first creation together beats a perfect plan.",
        "field.about.title": "Alone, a note.<br />Together, <em>the next wave.</em>",
        "field.about.body": "NextWave is where ideas leave the notebook. Developers, designers, and planners team up to build services, release games, and take on startup competitions.",
        "field.about.sub": "You don’t need to arrive an expert. Ask questions, try things out, and be willing to build again.",
        "field.people": "Meet your future teammates",
        "field.principle1": "Beyond majors",
        "field.principle2": "Ideas into action",
        "field.principle3": "Together from day one",
        "field.work.title": "Four ingredients.<br />Endless possibilities.",
        "field.work.sub": "Open a track that interests you.<br />Different roles come together as one team.",
        "field.opportunities": "Find opportunities",
        "field.record.title": "What we made happen.",
        "field.record.sub": "Six awards earned by getting out there and trying.",
        "field.people.label": "OPEN A PROFILE TO SAY HELLO",
        "field.team.title": "The people who start things.",
        "field.team.sub": "Behind every maker,<br />there is someone making with them.",
        "field.desk.title": "Your next challenge.<br />All in one place.",
        "field.desk.body": "Explore startup support and competitions.<br />Keep the conversation going in the member space.",
        "field.desk.ticket": "Find opportunities.<br />Connect with people.",
        "field.desk.open": "Open the portal",
        "field.join.title": "Next up.<br /><span>You.</span>",
        "field.join.body": "No big idea yet? Still figuring things out?<br />If “let’s try it together” sounds good, you belong here.",
        "field.join.tracks": "Development · Games · Hackathons · Marketing",
        "field.join.status": "Schedule",
        "field.join.schedule": "Confirmed dates will be shared in a recruitment notice.",
        "field.join.step3": "Join NextWave",
        "field.join.pending": "The application link is being prepared. It will be available here when published.",
        "field.faq.title": "A little more curious?",
        "field.footer": "Make ideas real. Better together."
});

    // Make it move — current product copy.
    Object.assign(dict.ko, {
        "motion.nav.projects": "프로젝트",
        "motion.nav.about": "우리의 에너지",
        "motion.hero.description": "생각만 하던 그거.<br />같이, 진짜 만들어보자.",
        "motion.hero.play": "프로젝트 플레이",
        "motion.hero.scroll": "스크롤하면, 시작.",
        "motion.hero.drag": "DRAG TO PLAY · 드래그해서 움직여보세요",
        "motion.shake": "흔들기",
        "motion.projects.eyebrow": "설명보다 먼저, 플레이.",
        "motion.projects.title": "우리가 만든 건,<br /><span>움직인다.</span>",
        "motion.projects.intro": "기록 속 프로젝트를 화면 밖으로.<br />직접 눌러보고, 움직여보고, 이해해보세요.",
        "motion.mayhem.subtitle": "빠르게. 더 과감하게.<br />플레이에 스타일을 더하다.",
        "motion.mayhem.description": "물리 기반 움직임과 멀티킬·스타일 점수를 결합한 게임. 공개된 점수 규칙을 작은 브라우저 실험으로 옮겼습니다.",
        "motion.mayhem.award": "게임개발경진대회 최우수상",
        "motion.mayhem.credit": "이학주 · HMBG 게임개발 동아리 프로젝트",
        "motion.project.source": "제작자 프로젝트 소개",
        "motion.project.original": "원작 플레이 영상",
        "motion.demo.dash": "대시",
        "motion.demo.fire": "발사",
        "motion.demo.instructions": "WASD / 방향키 이동 · 클릭 조준·발사 · Space 대시 · Enter 가까운 표적 발사<br />한 발로 여러 표적을 맞히면 보너스 · 대시 직후 스타일 3<br />키보드 조작은 게임 화면을 선택한 뒤 사용할 수 있어요.",
        "motion.demo.disclaimer": "공개 규칙을 바탕으로 재구성한 웹 실험 · 원작 게임 아님. 조작·표적·30초 제한은 이 체험을 위해 별도로 구성했습니다.",
        "motion.desk.project": "우리의 다음 도전을 찾는 도구. 창업 지원·공모전 정보와 부원 공간을 한곳에.",
        "motion.desk.try": "직접 써보기 ↗",
        "motion.about.title": "잘 맞는 사람보다,<br /><span>다르게 생각하는 사람.</span>",
        "motion.track.eyebrow": "당신의 관심사가 시작점.",
        "motion.track.title": "어떤 쪽에<br /><span>마음이 움직여?</span>",
        "motion.track.intro": "관심 분야를 골라보세요.<br />다음에 해볼 실험과 도전할 기회를 연결해드릴게요.",
        "motion.track.suggestion": "다음 실험 제안",
        "motion.track.remix": "다른 실험",
        "motion.awards.title": "해봤고,<br /><span>해냈으니까.</span>",
        "motion.team.title": "같이 사고 칠<br /><span>사람들.</span>",
        "motion.join.title": "이제,<br /><span>같이 하자.</span>",
        "motion.footer": "멈춰 있는 생각에, 다음 물결을."
});
    Object.assign(dict.en, {
        "motion.nav.projects": "Projects",
        "motion.nav.about": "Our energy",
        "motion.hero.description": "That thing you keep thinking about.<br />Let’s actually make it. Together.",
        "motion.hero.play": "Play the projects",
        "motion.hero.scroll": "Scroll. Get moving.",
        "motion.hero.drag": "DRAG TO PLAY · MAKE SOME WAVES",
        "motion.shake": "Shake",
        "motion.projects.eyebrow": "PLAY FIRST. READ LATER.",
        "motion.projects.title": "The work<br /><span>comes alive.</span>",
        "motion.projects.intro": "Projects beyond a line on a résumé.<br />Click, move, and see how they work.",
        "motion.mayhem.subtitle": "Go fast. Get bold.<br />Put your style into play.",
        "motion.mayhem.description": "A game combining physics-driven movement with multikill and style scoring. Try a small browser experiment based on the published scoring rule.",
        "motion.mayhem.award": "Game Development Competition · Top Excellence Award",
        "motion.mayhem.credit": "Hakju Lee · HMBG game development club project",
        "motion.project.source": "Meet the creator",
        "motion.project.original": "Original gameplay",
        "motion.demo.dash": "Dash",
        "motion.demo.fire": "Fire",
        "motion.demo.instructions": "WASD / arrows: move · Click: aim & fire · Space: dash · Enter: nearest target<br />Hit multiple targets for a bonus · Style 3 immediately after a dash<br />Select the game canvas to use keyboard controls.",
        "motion.demo.disclaimer": "A new web experiment based on the published scoring rule, not the original game. Controls, targets and the 30-second round were designed for this experience.",
        "motion.desk.project": "Our tool for finding the next challenge. Startup support, competitions and our member workspace, together.",
        "motion.desk.try": "Try it live ↗",
        "motion.about.title": "Different minds.<br /><span>One shared urge to make.</span>",
        "motion.track.eyebrow": "START WITH WHAT MOVES YOU.",
        "motion.track.title": "What gets<br /><span>you moving?</span>",
        "motion.track.intro": "Pick an interest.<br />Find a new experiment and an opportunity to try it.",
        "motion.track.suggestion": "YOUR NEXT EXPERIMENT",
        "motion.track.remix": "Remix",
        "motion.awards.title": "Tried it.<br /><span>Made it happen.</span>",
        "motion.team.title": "Your next<br /><span>co-conspirators.</span>",
        "motion.join.title": "Let’s make<br /><span>some moves.</span>",
        "motion.footer": "Give a quiet idea its next wave."
});

    // Our next wave — water identity.
    Object.assign(dict.ko, {
        "water.hero.title": "작은 시작이,<br />다음 <em>물결</em>로.",
        "water.hero.description": "서로 다른 생각이 만나, 새로운 흐름이 됩니다.<br /> 우리는 함께 만들고 도전하는 NextWave입니다.",
        "water.hero.play": "우리의 물결 만나보기",
        "water.hero.join": "함께 시작하기",
        "water.hero.note": "한 사람의 가능성이<br />모두의 다음 물결이 되도록.",
        "water.hero.scroll": "우리의 흐름을 따라",
        "water.surface": "물의 움직임",
        "water.ripple": "물결 만들기",
        "water.hero.drag": "DRAG TO EXPLORE · 드래그로 돌려보고, 클릭으로 물결을",
        "water.meaning.one": "작은 호기심에서",
        "water.meaning.two": "함께 만드는 시도로",
        "water.meaning.three": "새로운 변화의 물결로",
        "motion.nav.about": "NextWave의 의미",
        "motion.projects.eyebrow": "생각에서 시작해, 직접 만든 물결.",
        "motion.projects.title": "가능성은,<br /><span>만들 때 펼쳐집니다.</span>",
        "motion.projects.intro": "게임부터 세상에 필요한 제품까지.<br />우리 멤버들이 만든 프로젝트를 직접 경험해보세요.",
        "motion.about.title": "서로 다른 우리가 만나,<br /><span>하나의 새로운 물결로.</span>",
        "field.about.body": "NextWave는 각자의 작은 시작이 모여 새로운 변화를 만드는 곳입니다. 개발, 게임, 기획, 마케팅. 서로 다른 관심과 전공이 만날 때, 혼자서는 만들 수 없던 가능성이 열립니다.",
        "field.about.sub": "물결이 물결을 만나 더 멀리 퍼지듯, 함께 배우고 직접 만들며 우리의 다음을 넓혀갑니다. 완벽한 준비보다 시작해보려는 마음이면 충분합니다.",
        "motion.track.title": "네 갈래의 흐름.<br /><span>당신의 시작은 어디인가요?</span>",
        "motion.track.intro": "관심이 닿는 곳에서 가볍게 시작하세요.<br />작은 아이디어를 함께 만들 기회로 연결합니다.",
        "motion.track.eyebrow": "각자의 관심이 모여 만드는 흐름.",
        "motion.awards.title": "도전이 지나간 자리,<br /><span>물결은 남습니다.</span>",
        "motion.team.title": "물결을 만드는 건,<br /><span>결국 사람입니다.</span>",
        "motion.join.title": "다음 물결에,<br /><span>당신을 더해요.</span>",
        "motion.footer": "작은 시작이 모여, 다음 물결로."
});
    Object.assign(dict.en, {
        "water.hero.title": "Small beginnings.<br />Our next <em>wave.</em>",
        "water.hero.description": "Different ideas meet. A new current begins.<br /> We are NextWave — learning, building, and trying together.",
        "water.hero.play": "Explore our waves",
        "water.hero.join": "Start with us",
        "water.hero.note": "One person’s possibility.<br />Our next wave, together.",
        "water.hero.scroll": "Follow our current",
        "water.surface": "ON THE SURFACE",
        "water.ripple": "Make a ripple",
        "water.hero.drag": "DRAG TO EXPLORE · Rotate the water. Click for ripples.",
        "water.meaning.one": "A little curiosity",
        "water.meaning.two": "An experiment together",
        "water.meaning.three": "A new wave of change",
        "motion.nav.about": "Why NextWave",
        "motion.projects.eyebrow": "AN IDEA. AN EXPERIMENT. A NEW WAVE.",
        "motion.projects.title": "Possibility unfolds<br /><span>when we make it real.</span>",
        "motion.projects.intro": "From games to useful products.<br />Explore projects made by the people in our club.",
        "motion.about.title": "Different currents.<br /><span>One new wave.</span>",
        "field.about.body": "NextWave is where small beginnings become new possibilities. Development, games, planning, marketing: when different interests and backgrounds meet, we can make things we could never make alone.",
        "field.about.sub": "Like ripples meeting and reaching further, we learn, build, and expand what comes next. You don’t need a perfect plan. A little curiosity is enough.",
        "motion.track.title": "Four currents.<br /><span>Where will you begin?</span>",
        "motion.track.intro": "Start with what draws you in.<br />Turn a small idea into a chance to build together.",
        "motion.track.eyebrow": "DIFFERENT INTERESTS. SHARED CURRENTS.",
        "motion.awards.title": "Every challenge<br /><span>leaves a ripple.</span>",
        "motion.team.title": "Behind every wave,<br /><span>there are people.</span>",
        "motion.join.title": "The next wave<br /><span>starts with you.</span>",
        "motion.footer": "Small beginnings. Our next wave."
});

    let lang;
    try { lang = localStorage.getItem('nw_lang'); } catch { lang = null; }
    if (lang !== 'ko' && lang !== 'en') {
        lang = (navigator.language || 'ko').toLowerCase().startsWith('en') ? 'en' : 'ko';
    }

    function t(key) {
        const d = dict[lang] || dict.ko;
        return (d[key] != null) ? d[key] : (dict.ko[key] != null ? dict.ko[key] : key);
    }

    function apply() {
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            const v = t(el.getAttribute('data-i18n'));
            if (v != null) el.innerHTML = v;
        });
        document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
            const v = t(el.getAttribute('data-i18n-ph'));
            if (v != null) el.setAttribute('placeholder', v);
        });
        document.querySelectorAll('[data-lang-label]').forEach(function (el) {
            el.textContent = t('btn.langLabel');
        });
        document.dispatchEvent(new CustomEvent('nw:langchange', { detail: { lang: lang } }));
    }

    function set(l) {
        if (l !== 'ko' && l !== 'en') return;
        lang = l;
        try { localStorage.setItem('nw_lang', l); } catch { /* Language switching works without storage. */ }
        apply();
    }
    function toggle() { set(lang === 'ko' ? 'en' : 'ko'); }

    document.addEventListener('DOMContentLoaded', function () {
        apply();
        document.querySelectorAll('[data-lang-toggle]').forEach(function (b) {
            b.addEventListener('click', toggle);
        });
    });

    return { t: t, set: set, toggle: toggle, apply: apply, get lang() { return lang; } };
})();
