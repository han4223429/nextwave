/* NextWave Field Desk — public opportunities + authenticated member workspace. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const categories = { startup: '창업', support: '사업 지원', contest: '공모전', hackathon: '해커톤', dev: '개발', gamedev: '게임 개발', marketing: '마케팅', activity: '대외활동', education: '교육', internship: '인턴십' };
  const privateListeners = new Map();
  let auth = null, db = null, currentUser = null, currentProfile = null;
  let profileUnsubscribe = null, authEpoch = 0, dataEpoch = 0, activeTab = 'opportunities', activeDay = '';
  let publicSnapshot = null, manualOpportunities = [], snapshotError = false, fetchingSnapshot = false;
  const requestedCategory = new URLSearchParams(window.location.search).get('category');
  let currentFilter = Object.hasOwn(categories, requestedCategory) ? requestedCategory : 'all', searchTerm = '', showClosed = false, visibleLimit = 12, filterSignature = '';
  let toastTimer = null, snapshotFingerprint = '', renderedDay = '';
  let firebaseLoadPromise = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function replaceChildrenKeepingFocus(container, ...children) {
    const active = document.activeElement;
    const focusKey = active && container.contains(active) ? active.dataset?.focusKey : null;
    container.replaceChildren(...children);
    if (focusKey) {
      const replacement = [...container.querySelectorAll('[data-focus-key]')].find(node => node.dataset.focusKey === focusKey);
      replacement?.focus({ preventScroll: true });
    }
  }
  function icon(name) { const node = el('span', 'material-symbols-outlined', name); node.setAttribute('aria-hidden', 'true'); return node; }
  function safeURL(value, httpsOnly) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    try { const url = new URL(value); return (url.protocol === 'https:' || (!httpsOnly && url.protocol === 'http:')) && !url.username && !url.password ? url.href : ''; } catch (_) { return ''; }
  }
  function avatar(value, className) {
    const url = safeURL(value, true);
    if (!url) return null;
    const img = el('img', className); img.src = url; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.addEventListener('error', () => { img.hidden = true; }, { once: true }); return img;
  }
  function dateObject(value) {
    if (!value) return null;
    try {
      const date = typeof value.toDate === 'function' ? value.toDate() : new Date(typeof value.seconds === 'number' ? value.seconds * 1000 : value);
      return Number.isFinite(date.getTime()) ? date : null;
    } catch (_) { return null; }
  }
  function seoulDate(value) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value || new Date());
    const pick = type => parts.find(part => part.type === type).value;
    return pick('year') + '-' + pick('month') + '-' + pick('day');
  }
  function formatDate(value) { const date = dateObject(value); return date ? seoulDate(date) : '확인 중'; }
  function formatTime(value) { const date = dateObject(value); return date ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(date) : '전송 중'; }
  function formatStamp(value) { const date = dateObject(value); return date ? seoulDate(date).replaceAll('-', '.') + ' ' + formatTime(date) : '확인 기록 없음'; }
  function deadlineDays(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
    return Math.round((parsed.getTime() - new Date(seoulDate() + 'T00:00:00Z').getTime()) / 86400000);
  }
  function deadlineBadge(item) {
    const days = deadlineDays(item.deadline);
    if (item.status === 'archived') return { text: '보관', cls: 'closed' };
    if (days === null) return { text: '마감일 미확인', cls: '' };
    if (days < 0) return { text: '마감', cls: 'closed' };
    if (days === 0) return { text: '오늘 마감', cls: 'urgent' };
    return { text: 'D−' + days, cls: days <= 3 ? 'urgent' : days <= 14 ? 'soon' : '' };
  }
  function isClosed(item) { const days = deadlineDays(item.deadline); return item.status === 'archived' || (days !== null && days < 0); }
  function showToast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4000); }
  function confirmAction(message) {
    const dialog = $('confirm-modal');
    $('confirm-modal-msg').textContent = message; dialog.returnValue = ''; dialog.showModal();
    return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
  }
  function emptyState(container, message, detail) {
    const node = el('div', 'empty-state'); node.append(el('strong', '', message)); if (detail) node.append(el('p', '', detail)); container.replaceChildren(node); return node;
  }
  function errorMessage(error, fallback) {
    const code = String(error && error.code || '');
    if (code.includes('permission-denied')) return '접근 권한을 확인하지 못했어요. 승인 상태를 확인한 뒤 다시 로그인해 주세요.';
    if (code.includes('unavailable') || code.includes('network-request-failed')) return '연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.';
    return fallback;
  }

  // Public data is a static, source-backed snapshot. Refresh does not trigger a crawler.
  async function refreshSnapshot(manual) {
    if (fetchingSnapshot) return;
    fetchingSnapshot = true;
    $('opp-refresh').disabled = true; $('opp-refresh').setAttribute('aria-busy', 'true');
    let changed = false;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('data/opportunities.json', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('snapshot unavailable');
      const data = await response.json();
      if (data.schemaVersion !== 1 || !Array.isArray(data.items) || !Array.isArray(data.sources)) throw new Error('invalid snapshot');
      const fingerprint = JSON.stringify(data);
      changed = fingerprint !== snapshotFingerprint || snapshotError || renderedDay !== seoulDate();
      snapshotFingerprint = fingerprint;
      publicSnapshot = { ...data, items: data.items.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string' && item.title.trim() && safeURL(item.link)) };
      snapshotError = false;
      if (manual) showToast('가장 최근에 수집된 목록을 확인했어요.');
    } catch (_) {
      changed = !snapshotError || renderedDay !== seoulDate();
      snapshotError = true;
      if (manual) showToast(publicSnapshot ? '연결을 확인해 주세요. 마지막으로 받은 목록을 표시합니다.' : '기회 목록을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      clearTimeout(timeout); fetchingSnapshot = false; $('opp-refresh').disabled = false; $('opp-refresh').setAttribute('aria-busy', 'false'); $('opp-grid').setAttribute('aria-busy', 'false'); if (changed || !publicSnapshot) renderOpportunities(); renderSources();
    }
  }
  function allOpportunities() {
    const items = new Map();
    if (publicSnapshot) publicSnapshot.items.forEach(item => items.set(item.id, { ...item, public: true }));
    if (currentProfile && currentProfile.isMember === true) manualOpportunities.forEach(item => { if (item.managedBy !== 'nextwave-crawler' && item.authorUid !== 'crawler' && !item.id.startsWith('auto_')) items.set(item.id, { ...item, public: false }); });
    return [...items.values()];
  }
  function renderFilters(items) {
    const available = [...new Set(items.map(item => item.category).filter(key => Object.hasOwn(categories, key)))];
    const keys = Object.keys(categories).filter(key => available.includes(key) || key === currentFilter);
    const signature = keys.join(',');
    if (signature !== filterSignature || $('opp-filters').childElementCount === 1) {
      filterSignature = signature;
      const buttons = ['all', ...keys].map(key => { const button = el('button', 'opp-filter-btn', key === 'all' ? '전체' : categories[key]); button.type = 'button'; button.dataset.filter = key; return button; });
      $('opp-filters').replaceChildren(...buttons);
    }
    $('opp-filters').querySelectorAll('button').forEach(button => { const selected = button.dataset.filter === currentFilter; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); });
  }
  function renderOpportunities() {
    renderedDay = seoulDate();
    const items = allOpportunities(); renderFilters(items);
    $('opp-total').textContent = String(items.filter(item => !isClosed(item)).length).padStart(2, '0');
    const search = searchTerm.toLocaleLowerCase('ko-KR');
    const filtered = items.filter(item => (showClosed || !isClosed(item)) && (currentFilter === 'all' || item.category === currentFilter) && (!search || [item.title, item.description, item.source, item.organizer, categories[item.category]].join(' ').toLocaleLowerCase('ko-KR').includes(search)));
    filtered.sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)) || (deadlineDays(a.deadline) ?? 100000) - (deadlineDays(b.deadline) ?? 100000) || (dateObject(b.lastSeenAt || b.createdAt)?.getTime() || 0) - (dateObject(a.lastSeenAt || a.createdAt)?.getTime() || 0));
    $('opp-result-count').textContent = filtered.length + '개 결과 · 마감 가까운 순';
    const grid = $('opp-grid');
    if (!filtered.length) {
      if (!publicSnapshot && snapshotError && !items.length) emptyState(grid, '기회 목록을 연결하지 못했어요.', '새로고침으로 다시 확인해 주세요. 부원 로그인은 계속 이용할 수 있어요.');
      else if (!items.length) emptyState(grid, '확인된 공고를 준비하고 있어요.', '수집이 완료되면 이곳에 표시됩니다. 아래에서 출처 상태를 확인할 수 있어요.');
      else { const state = emptyState(grid, '조건에 맞는 기회가 아직 없어요.', '검색어를 바꾸거나 다른 분야를 살펴보세요.'); const reset = el('button', 'btn-secondary', '검색 조건 초기화'); reset.type = 'button'; reset.addEventListener('click', () => { searchTerm = ''; currentFilter = 'all'; showClosed = false; $('opp-search').value = ''; $('opp-show-closed').checked = false; renderOpportunities(); }); state.append(reset); }
      return;
    }
    const fragment = document.createDocumentFragment();
    filtered.slice(0, visibleLimit).forEach((item, index) => {
      const card = el('article', 'opp-card' + (isClosed(item) ? ' archived' : ''));
      const top = el('div', 'opp-card-top'); const badge = deadlineBadge(item);
      top.append(el('span', 'opp-card-index', 'CALL / ' + String(index + 1).padStart(3, '0')), el('span', 'opp-dday ' + badge.cls, badge.text));
      card.append(top, el('h3', 'opp-card-title', item.title), el('p', 'opp-card-desc', typeof item.description === 'string' && item.description ? item.description : '지원 대상과 세부 내용을 원문 공고에서 확인하세요.'));
      const meta = el('div', 'opp-card-meta'); meta.append(el('span', 'opp-tag', categories[item.category] || '기회 정보'));
      if (item.source) meta.append(el('span', 'opp-source', item.source));
      if (deadlineDays(item.deadline) !== null) meta.append(el('span', 'opp-source', item.deadline + ' 마감'));
      card.append(meta);
      if (item.lastSeenAt) card.append(el('p', 'opp-checked', '출처 확인 ' + formatStamp(item.lastSeenAt) + ' KST'));
      const actions = el('div', 'opp-card-actions'); const link = safeURL(item.link);
      if (link) { const anchor = el('a', 'opp-link-btn', '원문 공고 확인'); anchor.dataset.focusKey = 'opportunity:' + item.id; anchor.href = link; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.setAttribute('aria-label', item.title + ' — 원문 공고 (새 탭)'); anchor.append(el('span', '', '↗')); actions.append(anchor); }
      else actions.append(el('span', 'opp-source', '원문 링크 미등록'));
      if (!item.public && currentProfile?.isAdmin === true) actions.append(deleteButton('이 기회 정보를 삭제할까요?', 'opportunities', item.id, '기회 삭제'));
      card.append(actions); fragment.append(card);
    });
    if (filtered.length > visibleLimit) { const moreRow = el('div', 'opp-more'); const more = el('button', 'btn-secondary', '기회 ' + Math.min(12, filtered.length - visibleLimit) + '개 더 보기 ↓'); more.type = 'button'; more.dataset.focusKey = 'opportunities-more'; more.addEventListener('click', () => { visibleLimit += 12; renderOpportunities(); grid.querySelectorAll('.opp-card')[visibleLimit - 12]?.querySelector('a')?.focus({ preventScroll: true }); }); moreRow.append(more); fragment.append(moreRow); }
    replaceChildrenKeepingFocus(grid, fragment);
  }
  function renderSources() {
    const sources = (publicSnapshot?.sources || []).filter(source => source && typeof source === 'object');
    const last = dateObject(publicSnapshot?.lastSuccessAt);
    const interval = Number(publicSnapshot?.refreshIntervalMinutes) || 360;
    const stale = !last || Date.now() - last.getTime() > Math.max(interval * 2, 120) * 60000;
    const warning = snapshotError || stale || sources.some(source => source.status !== 'ok');
    $('sync-dot').classList.toggle('warning', warning);
    let status = last ? '최근 수집 ' + formatStamp(last) + ' KST' : '아직 성공한 수집 기록이 없어요';
    if (snapshotError) status = publicSnapshot ? '연결 지연 · 마지막으로 받은 목록 표시' : '목록 연결 실패 · 새로고침해 주세요';
    else if (last && stale) status += ' · 업데이트 지연';
    else if (sources.some(source => source.status !== 'ok')) status += ' · 일부 출처 확인 지연';
    $('opp-sync-status').textContent = status;
    $('opp-refresh-note').textContent = '출처 수집 주기: 약 ' + (interval >= 60 ? interval / 60 + '시간' : interval + '분') + '. 화면은 열려 있는 동안 1분마다 최신 수집본을 확인합니다. 새로고침은 수집을 실행하지 않습니다. 마감일 미확인은 상시 모집을 뜻하지 않아요.';
    replaceChildrenKeepingFocus($('opp-sources'), ...sources.map(source => {
      const row = el('div', 'source-row'); const url = safeURL(source.url); const name = el(url ? 'a' : 'span', '', source.name || source.id || '공식 출처');
      if (url) { name.dataset.focusKey = 'source:' + (source.id || url); name.href = url; name.target = '_blank'; name.rel = 'noopener noreferrer'; }
      const state = source.status === 'ok' ? '정상 확인' : source.status === 'partial' ? '일부 확인 지연' : '확인 실패';
      const details = el('span', 'source-meta' + (source.status !== 'ok' ? ' warning' : ''), state + ' · ' + (Number(source.itemCount) || 0) + '건'); details.append(el('br'), document.createTextNode('최근 성공 ' + formatStamp(source.lastSuccessAt)));
      row.append(name, details); return row;
    }));
    if (!sources.length) $('opp-sources').append(el('p', '', '출처 상태를 아직 가져오지 못했어요.'));
  }

  function stopPrivateData() {
    dataEpoch += 1;
    privateListeners.forEach(unsubscribe => unsubscribe()); privateListeners.clear(); manualOpportunities = [];
    ['chat-messages', 'announcements-list', 'attendance-history', 'attendance-status', 'member-grid', 'admin-member-list', 'admin-attendance-body'].forEach(id => $(id).replaceChildren());
    ['chat-input', 'ann-title-input', 'ann-body-input', 'opp-title-input', 'opp-desc-input', 'opp-link-input', 'opp-source-input', 'opp-deadline-input'].forEach(id => { $(id).value = ''; });
    $('topbar-username').textContent = ''; $('topbar-avatar').removeAttribute('src'); $('topbar-avatar').hidden = true;
    ['admin-nav', 'announcement-form-card', 'opp-form-card'].forEach(id => { $(id).hidden = true; });
    if ($('confirm-modal').open) $('confirm-modal').close('cancel');
    activeDay = ''; closeSidebar();
  }
  function showScreen(name) {
    $('login-screen').hidden = name !== 'login'; $('pending-screen').hidden = name !== 'pending'; $('portal-app').hidden = name !== 'portal'; $('public-shell').hidden = name === 'portal'; $('public-topbar').hidden = name === 'portal';
    $(name === 'portal' ? 'member-board-slot' : 'public-board-slot').append($('opportunity-board'));
    renderOpportunities();
  }
  function listen(key, query, onData, onError) {
    privateListeners.get(key)?.();
    const epoch = authEpoch, generation = dataEpoch;
    const unsubscribe = query.onSnapshot(snapshot => { if (epoch === authEpoch && generation === dataEpoch && currentProfile?.isMember === true) onData(snapshot); }, error => { if (epoch === authEpoch && generation === dataEpoch && currentProfile?.isMember === true) onError?.(error); });
    privateListeners.set(key, unsubscribe);
  }
  function profileName() { return String(currentProfile?.displayName || currentUser?.displayName || '부원').slice(0, 100); }
  function setupMemberPortal() {
    $('topbar-username').textContent = profileName();
    const url = safeURL(currentProfile.photoURL || currentUser.photoURL, true); $('topbar-avatar').hidden = !url; if (url) $('topbar-avatar').src = url;
    const admin = currentProfile.isAdmin === true;
    ['admin-nav', 'announcement-form-card', 'opp-form-card'].forEach(id => { $(id).hidden = !admin; });
    if (!admin && activeTab === 'admin') activateTab('opportunities');
    showScreen('portal'); loadChat(); loadAnnouncements(); loadAttendance(); loadMembers();
    listen('opportunities', db.collection('opportunities'), snapshot => { manualOpportunities = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })); renderOpportunities(); }, error => showToast(errorMessage(error, '부원 등록 기회를 불러오지 못했어요. 공개 기회는 계속 볼 수 있어요.')));
    if (admin) { loadAdminMembers(); loadAllAttendance(); }
  }
  async function handleSignedIn(user, epoch) {
    try {
      const memberRef = db.collection('members').doc(user.uid); const doc = await memberRef.get();
      if (epoch !== authEpoch) return;
      if (!doc.exists) {
        await memberRef.set({ uid: user.uid, email: user.email || '', displayName: String(user.displayName || '').slice(0, 100), photoURL: safeURL(user.photoURL, true), isMember: false, isAdmin: false, role: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
      if (epoch !== authEpoch) return;
      profileUnsubscribe = memberRef.onSnapshot(profileDoc => {
        if (epoch !== authEpoch) return;
        const next = profileDoc.exists ? profileDoc.data() : null;
        const rightsChanged = !currentProfile || currentProfile.isMember !== next?.isMember || currentProfile.isAdmin !== next?.isAdmin;
        currentProfile = next;
        if (next?.isMember === true) {
          if (rightsChanged) { stopPrivateData(); setupMemberPortal(); }
          else $('topbar-username').textContent = profileName();
        } else {
          stopPrivateData(); $('pending-title').textContent = '작업실의 문을 열고 있어요.'; $('pending-description').textContent = '운영진이 가입 요청을 확인 중이에요. 승인되면 이 화면이 자동으로 전환됩니다.'; showScreen('pending');
        }
      }, error => profileError(error, epoch));
    } catch (error) { profileError(error, epoch); }
  }
  function profileError(error, epoch) {
    if (epoch !== authEpoch) return;
    currentProfile = null; stopPrivateData(); $('pending-title').textContent = '계정을 확인하지 못했어요.'; $('pending-description').textContent = errorMessage(error, '잠시 후 로그아웃하고 다시 로그인해 주세요. 공개 기회 정보는 아래에서 볼 수 있어요.'); showScreen('pending');
  }
  async function doLogin() {
    if (!auth) { $('login-error').textContent = '로그인 서비스를 연결하지 못했어요. 잠시 후 페이지를 새로고침해 주세요.'; return; }
    $('login-error').textContent = ''; $('login-btn').disabled = true; $('login-label').textContent = 'Google 계정 연결 중';
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try { await auth.signInWithPopup(provider); }
    catch (error) {
      const messages = { 'auth/popup-closed-by-user': '로그인 창이 닫혔어요. 준비되면 다시 눌러 주세요.', 'auth/cancelled-popup-request': '로그인 요청이 이미 진행 중이에요.', 'auth/popup-blocked': '브라우저에서 팝업을 허용한 뒤 다시 눌러 주세요.', 'auth/unauthorized-domain': '이 주소에서 로그인이 허용되지 않았어요. 운영진에게 현재 주소를 알려 주세요.', 'auth/network-request-failed': '네트워크를 확인하고 다시 시도해 주세요.' };
      $('login-error').textContent = messages[error.code] || '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.';
    } finally { $('login-btn').disabled = false; $('login-label').textContent = 'Google로 부원 로그인'; }
  }
  async function initGoogleIdentity() {
    // A separate official Google route, enabled for local verification before rollout.
    if (new URLSearchParams(window.location.search).get('signin') !== 'google' || !auth || !window.NEXTWAVE_GOOGLE_CLIENT_ID) return;
    const container = $('google-signin');
    let busy = false;
    try {
      await new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) { resolve(); return; }
        const script = document.createElement('script');
        const timer = setTimeout(() => reject(new Error('Google connection timed out')), 12000);
        script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = () => { clearTimeout(timer); reject(new Error('Google connection failed')); };
        document.head.append(script);
      });
      window.google.accounts.id.initialize({
        client_id: window.NEXTWAVE_GOOGLE_CLIENT_ID,
        auto_select: false, button_auto_select: false, use_fedcm_for_button: true,
        callback: async response => {
          if (busy || auth.currentUser || typeof response?.credential !== 'string' || !response.credential) return;
          busy = true; container.inert = true; container.setAttribute('aria-busy', 'true');
          $('login-error').textContent = ''; delete $('login-error').dataset.code;
          try {
            // Firebase verifies the Google token. Never persist or log the raw token.
            const credential = firebase.auth.GoogleAuthProvider.credential(response.credential);
            await auth.signInWithCredential(credential);
          } catch (error) {
            $('login-error').dataset.code = /^auth\/[a-z-]+$/.test(error?.code || '') ? error.code : 'unknown';
            $('login-error').textContent = error?.code === 'auth/network-request-failed'
              ? '연결을 확인하고 다시 로그인해 주세요.' : '계정 연결을 마치지 못했어요. 다시 로그인해 주세요.';
          } finally { busy = false; container.inert = false; container.removeAttribute('aria-busy'); }
        }
      });
      container.hidden = false;
      window.google.accounts.id.renderButton(container, { type: 'standard', theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill', locale: 'ko', width: Math.min(380, Math.max(200, $('login-btn').clientWidth)), click_listener: () => { $('login-error').textContent = ''; window.NextWaveFeedback?.('tap'); } });
      $('login-btn').hidden = true;
    } catch (_) {
      container.hidden = true; $('login-btn').hidden = false;
      $('login-error').textContent = 'Google 로그인 버튼을 불러오지 못했어요. 아래 로그인 버튼으로 다시 시도해 주세요.';
    }
  }
  async function doLogout() { if (!auth) return; try { await auth.signOut(); } catch (_) { showToast('로그아웃하지 못했어요. 연결을 확인하고 다시 시도해 주세요.'); } }
  function loadFirebaseSDK() {
    if (window.firebase?.auth && window.firebase?.firestore) return Promise.resolve();
    if (firebaseLoadPromise) return firebaseLoadPromise;
    firebaseLoadPromise = ['app', 'auth', 'firestore'].reduce((promise, module) => promise.then(() => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => reject(new Error('Firebase connection timed out')), 12000);
      script.src = 'https://www.gstatic.com/firebasejs/11.0.2/firebase-' + module + '-compat.js';
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => { clearTimeout(timeout); reject(new Error('Firebase connection failed')); };
      document.head.append(script);
    })), Promise.resolve());
    return firebaseLoadPromise;
  }
  function initAuth() {
    const config = window.NEXTWAVE_FIREBASE_CONFIG;
    if (!window.firebase || !config || !config.apiKey || String(config.apiKey).includes('PASTE_YOUR')) { $('login-error').textContent = '로그인 서비스를 연결하지 못했어요. 기회 데스크는 계속 이용할 수 있어요.'; return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(config);
      auth = firebase.auth(); db = firebase.firestore();
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => { $('login-error').textContent = '브라우저의 저장 공간 설정에 따라 로그인 상태가 유지되지 않을 수 있어요.'; });
      auth.onAuthStateChanged(user => {
        authEpoch += 1; profileUnsubscribe?.(); profileUnsubscribe = null; stopPrivateData(); currentUser = user; currentProfile = null; activateTab('opportunities');
        if (user) { $('pending-title').textContent = '작업실을 확인하고 있어요.'; $('pending-description').textContent = '계정과 부원 승인 상태를 확인합니다.'; showScreen('pending'); handleSignedIn(user, authEpoch); }
        else showScreen('login');
      });
    } catch (_) { $('login-error').textContent = '로그인 서비스를 연결하지 못했어요. 잠시 후 다시 방문해 주세요.'; }
  }
  function closeSidebar() { $('portal-sidebar').classList.remove('open'); $('mobile-backdrop').hidden = true; $('mobile-sidebar-btn').setAttribute('aria-expanded', 'false'); }
  function activateTab(tab) {
    if (tab === 'admin' && currentProfile?.isAdmin !== true) return;
    activeTab = tab;
    document.querySelectorAll('.nav-item').forEach(button => { const active = button.dataset.tab === tab; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    document.querySelectorAll('.tab-panel').forEach(panel => { panel.hidden = panel.id !== 'tab-' + tab; panel.classList.toggle('active', !panel.hidden); }); closeSidebar();
    if (tab === 'attendance' && currentProfile?.isMember === true && activeDay !== seoulDate()) loadAttendance();
  }

  function deleteButton(message, collection, id, label) {
    const button = el('button', 'delete-btn'); button.type = 'button'; button.setAttribute('aria-label', label); button.title = label; button.append(icon('delete'));
    button.addEventListener('click', async () => { if (currentProfile?.isAdmin !== true || !await confirmAction(message) || currentProfile?.isAdmin !== true) return; try { await db.collection(collection).doc(id).delete(); showToast('삭제했어요.'); } catch (error) { showToast(errorMessage(error, '삭제하지 못했어요. 다시 시도해 주세요.')); } });
    return button;
  }
  function loadChat() {
    listen('chat', db.collection('messages').orderBy('createdAt', 'asc').limitToLast(100), snapshot => {
      const container = $('chat-messages'); const follow = container.scrollHeight - container.scrollTop - container.clientHeight < 100 || !container.querySelector('.chat-msg');
      if (snapshot.empty) { emptyState(container, '첫 이야기를 기다리고 있어요.', '동료에게 가볍게 인사를 건네보세요.'); return; }
      container.replaceChildren(...snapshot.docs.map(doc => {
        const data = doc.data(); const row = el('div', 'chat-msg'); const photo = avatar(data.photoURL, 'avatar'); if (photo) row.append(photo);
        const body = el('div', 'msg-body'), header = el('div', 'msg-header'); header.append(el('span', 'msg-name', data.displayName || '부원'), el('span', 'msg-time', formatTime(data.createdAt)));
        if (currentProfile.isAdmin === true) header.append(deleteButton('이 메시지를 삭제할까요?', 'messages', doc.id, '메시지 삭제'));
        body.append(header, el('div', 'msg-text', data.text || '')); row.append(body); return row;
      }));
      if (follow) container.scrollTop = container.scrollHeight;
    }, error => emptyState($('chat-messages'), '채팅을 불러오지 못했어요.', errorMessage(error, '연결이 복구되면 다시 확인합니다.')));
  }
  async function sendChat(event) {
    event.preventDefault(); if (!db || currentProfile?.isMember !== true) return;
    const input = $('chat-input'), message = input.value.trim(); if (!message || message.length > 2000) return;
    const epoch = authEpoch; $('chat-send').disabled = true;
    try { await db.collection('messages').add({ text: message, uid: currentUser.uid, displayName: profileName(), photoURL: safeURL(currentProfile.photoURL || currentUser.photoURL, true), createdAt: firebase.firestore.FieldValue.serverTimestamp() }); if (epoch === authEpoch && input.value.trim() === message) input.value = ''; }
    catch (error) { if (epoch === authEpoch) showToast(errorMessage(error, '메시지를 보내지 못했어요. 입력한 내용은 보관했어요.')); }
    finally { $('chat-send').disabled = false; }
  }
  function loadAnnouncements() {
    listen('announcements', db.collection('announcements').orderBy('createdAt', 'desc').limit(30), snapshot => {
      if (snapshot.empty) { emptyState($('announcements-list'), '아직 새로운 공지가 없어요.'); return; }
      $('announcements-list').replaceChildren(...snapshot.docs.map(doc => { const data = doc.data(); const item = el('article', 'announcement-item'), header = el('div', 'ann-header'); header.append(el('h2', 'ann-title', data.title || '제목 없음')); if (currentProfile.isAdmin === true) header.append(deleteButton('이 공지사항을 삭제할까요?', 'announcements', doc.id, '공지 삭제')); item.append(header, el('p', 'ann-date', formatDate(data.createdAt)), el('div', 'ann-body', data.body || '')); return item; }));
    }, error => emptyState($('announcements-list'), '공지를 불러오지 못했어요.', errorMessage(error, '잠시 후 다시 확인해 주세요.')));
  }
  async function submitAnnouncement(event) {
    event.preventDefault(); if (!db || currentProfile?.isAdmin !== true) return;
    const title = $('ann-title-input').value.trim(), body = $('ann-body-input').value.trim(); if (!title || !body) return;
    const epoch = authEpoch; $('ann-submit').disabled = true;
    try { await db.collection('announcements').add({ title, body, authorUid: currentUser.uid, authorName: profileName(), createdAt: firebase.firestore.FieldValue.serverTimestamp() }); if (epoch === authEpoch) { $('announcement-form').reset(); showToast('공지를 등록했어요.'); } }
    catch (error) { showToast(errorMessage(error, '공지를 등록하지 못했어요. 내용은 보관했어요.')); } finally { $('ann-submit').disabled = false; }
  }
  async function submitOpportunity(event) {
    event.preventDefault(); if (!db || currentProfile?.isAdmin !== true) return;
    const title = $('opp-title-input').value.trim(), description = $('opp-desc-input').value.trim(), category = $('opp-category-input').value, deadline = $('opp-deadline-input').value || null, rawLink = $('opp-link-input').value.trim(), source = $('opp-source-input').value.trim();
    if (!title || !Object.hasOwn(categories, category)) return;
    const link = safeURL(rawLink); if (rawLink && !link) { showToast('http 또는 https로 시작하는 올바른 링크를 입력해 주세요.'); $('opp-link-input').focus(); return; }
    if (deadline && deadlineDays(deadline) === null) { showToast('마감일을 다시 확인해 주세요.'); return; }
    const epoch = authEpoch; $('opp-submit').disabled = true;
    try { await db.collection('opportunities').add({ title, description, category, deadline, link: link || null, source: source || null, authorUid: currentUser.uid, authorName: profileName(), createdAt: firebase.firestore.FieldValue.serverTimestamp() }); if (epoch === authEpoch) { $('opp-form').reset(); showToast('기회를 등록했어요.'); } }
    catch (error) { showToast(errorMessage(error, '기회를 등록하지 못했어요. 입력한 내용은 보관했어요.')); } finally { $('opp-submit').disabled = false; }
  }
  function attendanceRows(container, records, admin) {
    container.replaceChildren();
    if (!records.length) { const row = el('tr'), cell = el('td', 'muted', '아직 출석 기록이 없어요.'); cell.colSpan = 3; row.append(cell); container.append(row); return; }
    records.forEach(data => { const row = el('tr'); const values = admin ? [data.displayName || '부원', data.date || '', formatTime(data.createdAt)] : [data.date || '', formatTime(data.createdAt), '출석']; values.forEach(value => row.append(el('td', '', value))); container.append(row); });
  }
  function attendanceError(container) { const row = el('tr'), cell = el('td', 'muted', '출석 기록을 불러오지 못했어요.'); cell.colSpan = 3; row.append(cell); container.replaceChildren(row); }
  function loadAttendance() {
    if (!db || currentProfile?.isMember !== true) return;
    activeDay = seoulDate(); $('attendance-date').textContent = activeDay; $('attendance-btn').disabled = true;
    listen('attendance-today', db.collection('attendance').doc(currentUser.uid + '_' + activeDay), doc => { $('attendance-status').replaceChildren(el('span', 'status-badge ' + (doc.exists ? 'checked' : 'not-checked'), doc.exists ? '출석 완료' : '아직 체크 전')); $('attendance-btn').disabled = doc.exists; $('attendance-btn').textContent = doc.exists ? '오늘의 출석을 기록했어요' : '오늘 출석 체크 ↗'; }, () => { $('attendance-status').textContent = '출석 상태를 확인하지 못했어요.'; $('attendance-btn').disabled = false; });
    listen('attendance-history', db.collection('attendance').where('uid', '==', currentUser.uid), snapshot => { const records = snapshot.docs.map(doc => doc.data()).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 30); attendanceRows($('attendance-history'), records, false); }, () => attendanceError($('attendance-history')));
  }
  async function doAttendance() {
    if (!db || currentProfile?.isMember !== true) return;
    $('attendance-btn').disabled = true; const today = seoulDate(), epoch = authEpoch;
    try { await db.collection('attendance').doc(currentUser.uid + '_' + today).set({ uid: currentUser.uid, displayName: profileName(), date: today, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); if (epoch === authEpoch) { showToast('오늘도 함께해 줘서 고마워요. 출석 완료!'); if (activeDay !== today) loadAttendance(); } }
    catch (error) { if (epoch === authEpoch) { showToast(errorMessage(error, '출석을 기록하지 못했어요. 상태를 다시 확인합니다.')); loadAttendance(); } }
  }
  function loadMembers() {
    listen('members', db.collection('members').where('isMember', '==', true), snapshot => {
      if (snapshot.empty) { emptyState($('member-grid'), '승인된 부원이 아직 없어요.'); return; }
      const members = snapshot.docs.map(doc => doc.data()).sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), 'ko'));
      $('member-grid').replaceChildren(...members.map(member => { const card = el('article', 'member-card'), photo = avatar(member.photoURL); if (photo) card.append(photo); const info = el('div', 'member-info'); info.append(el('h2', 'member-name', member.displayName || '부원'), el('p', 'member-role', member.isAdmin === true ? '운영진' : 'NextWave 부원')); card.append(info, el('span', 'member-badge ' + (member.isAdmin === true ? 'admin' : ''), member.isAdmin === true ? 'ADMIN' : 'MEMBER')); return card; }));
    }, error => emptyState($('member-grid'), '부원 목록을 불러오지 못했어요.', errorMessage(error, '잠시 후 다시 확인해 주세요.')));
  }
  function loadAdminMembers() {
    listen('admin-members', db.collection('members').orderBy('createdAt', 'desc'), snapshot => {
      if (currentProfile?.isAdmin !== true) return;
      $('admin-member-list').replaceChildren(...snapshot.docs.map(doc => {
        const member = doc.data(), uid = doc.id; const row = el('div', 'admin-member-row'), info = el('div', 'admin-member-info'), edit = el('div', 'admin-name-edit');
        const input = el('input', 'admin-name-input'); input.type = 'text'; input.maxLength = 100; input.value = member.displayName || ''; input.setAttribute('aria-label', (member.displayName || '부원') + ' 이름');
        const save = el('button', 'btn-tiny', '이름 저장'); save.type = 'button'; save.addEventListener('click', async () => { const name = input.value.trim(); if (!name || currentProfile?.isAdmin !== true) return; save.disabled = true; try { await db.collection('members').doc(uid).update({ displayName: name, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); showToast('이름을 변경했어요.'); } catch (error) { showToast(errorMessage(error, '이름을 변경하지 못했어요.')); } finally { save.disabled = false; } });
        edit.append(input, save); const status = member.isAdmin === true ? 'ADMIN' : member.isMember === true ? 'MEMBER' : 'PENDING'; info.append(edit, el('div', 'admin-member-meta', (member.email || '') + ' · ' + status));
        const actions = el('div', 'admin-row-actions'); const addAction = (action, label, style) => { const button = el('button', 'btn-tiny ' + style, label); button.type = 'button'; button.addEventListener('click', () => adminAction(uid, action, member.displayName || '이 부원')); actions.append(button); };
        if (member.isMember !== true) addAction('approve', '가입 승인', 'primary');
        else if (member.isAdmin !== true) { addAction('makeAdmin', '관리자 부여', 'secondary'); addAction('revoke', '권한 회수', 'danger'); }
        else if (uid !== currentUser.uid) addAction('revoke', '권한 회수', 'danger');
        row.append(info, actions); return row;
      }));
    }, error => emptyState($('admin-member-list'), '관리 목록을 불러오지 못했어요.', errorMessage(error, '잠시 후 다시 확인해 주세요.')));
  }
  async function adminAction(uid, action, name) {
    if (!db || currentProfile?.isAdmin !== true) return;
    const messages = { approve: name + ' 님의 가입을 승인할까요?', makeAdmin: name + ' 님에게 관리자 권한을 부여할까요?', revoke: name + ' 님의 부원 및 관리자 권한을 회수할까요?' };
    if (!Object.hasOwn(messages, action) || !await confirmAction(messages[action]) || currentProfile?.isAdmin !== true) return;
    const changes = { approve: { isMember: true, isAdmin: false, role: 'member' }, makeAdmin: { isMember: true, isAdmin: true, role: 'admin' }, revoke: { isMember: false, isAdmin: false, role: 'pending' } };
    try { await db.collection('members').doc(uid).update({ ...changes[action], updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); showToast('권한을 변경했어요.'); } catch (error) { showToast(errorMessage(error, '권한을 변경하지 못했어요.')); }
  }
  function loadAllAttendance() { listen('admin-attendance', db.collection('attendance').orderBy('createdAt', 'desc').limit(100), snapshot => attendanceRows($('admin-attendance-body'), snapshot.docs.map(doc => doc.data()), true), () => attendanceError($('admin-attendance-body'))); }

  function init() {
    $('login-btn').addEventListener('click', doLogin); $('pending-logout').addEventListener('click', doLogout); $('topbar-logout').addEventListener('click', doLogout);
    $('opp-refresh').addEventListener('click', () => refreshSnapshot(true));
    $('opp-search').addEventListener('input', event => { searchTerm = event.target.value.trim(); visibleLimit = 12; renderOpportunities(); });
    $('opp-show-closed').addEventListener('change', event => { showClosed = event.target.checked; visibleLimit = 12; renderOpportunities(); });
    $('opp-filters').addEventListener('click', event => { const button = event.target.closest('button[data-filter]'); if (!button) return; currentFilter = button.dataset.filter; visibleLimit = 12; renderOpportunities(); });
    document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => activateTab(button.dataset.tab)));
    $('mobile-sidebar-btn').addEventListener('click', () => { const open = $('portal-sidebar').classList.toggle('open'); $('mobile-backdrop').hidden = !open; $('mobile-sidebar-btn').setAttribute('aria-expanded', String(open)); if (open) $('portal-sidebar').querySelector('.nav-item.active').focus(); });
    $('mobile-backdrop').addEventListener('click', closeSidebar);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('portal-sidebar').classList.contains('open')) { closeSidebar(); $('mobile-sidebar-btn').focus(); } });
    $('chat-form').addEventListener('submit', sendChat); $('announcement-form').addEventListener('submit', submitAnnouncement); $('opp-form').addEventListener('submit', submitOpportunity); $('attendance-btn').addEventListener('click', doAttendance);
    $('topbar-avatar').addEventListener('error', () => { $('topbar-avatar').hidden = true; });
    function visibleRefresh() { if (document.visibilityState !== 'visible') return; refreshSnapshot(false); if (currentProfile?.isMember === true && activeDay !== seoulDate()) loadAttendance(); }
    document.addEventListener('visibilitychange', visibleRefresh); window.addEventListener('online', visibleRefresh); setInterval(visibleRefresh, 60000);
    refreshSnapshot(false);
    $('login-btn').disabled = true; $('login-label').textContent = '로그인 연결 중';
    // The public board starts immediately, even if the authentication CDN is slow.
    loadFirebaseSDK().then(() => { initAuth(); return initGoogleIdentity(); }).catch(() => { $('login-error').textContent = '로그인 서비스를 연결하지 못했어요. 기회 데스크는 계속 이용할 수 있어요.'; }).finally(() => { $('login-btn').disabled = false; $('login-label').textContent = 'Google로 부원 로그인'; });
  }
  init();
})();
