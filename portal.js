// =========================================================
// NextWave Portal – Main Script
// Firebase Auth + Firestore powered member portal
// =========================================================

(function () {
    'use strict';

    // ── Firebase instances ──
    let auth = null;
    let db = null;
    let currentUser = null;
    let currentProfile = null;
    let chatUnsubscribe = null;
    let announcementsUnsubscribe = null;
    let oppUnsubscribe = null;
    let currentOppFilter = 'all';

    // ── DOM Refs ──
    const $ = (id) => document.getElementById(id);

    // Screens
    const loginScreen = $('login-screen');
    const pendingScreen = $('pending-screen');
    const portalApp = $('portal-app');

    // ── Toast ──
    function showToast(msg, duration) {
        duration = duration || 3000;
        var toast = $('toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(function () { toast.classList.remove('show'); }, duration);
    }

    // ── Custom Confirm Modal (DOM 재렌더링에 영향받지 않음) ──
    function showConfirmModal(message, onConfirm) {
        var overlay = $('confirm-modal');
        var msgEl = $('confirm-modal-msg');
        var okBtn = $('confirm-modal-ok');
        var cancelBtn = $('confirm-modal-cancel');
        if (!overlay) return;

        msgEl.textContent = message;
        overlay.style.display = 'flex';

        // 기존 이벤트 제거를 위해 클론 교체
        var newOk = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOk, okBtn);
        var newCancel = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

        newCancel.addEventListener('click', function() {
            overlay.style.display = 'none';
        });
        newOk.addEventListener('click', function() {
            overlay.style.display = 'none';
            onConfirm();
        });
    }

    // ── Utility: Format timestamp ──
    function formatTime(ts) {
        if (!ts) return '';
        var d = ts.toDate ? ts.toDate() : new Date(ts);
        var h = d.getHours().toString().padStart(2, '0');
        var m = d.getMinutes().toString().padStart(2, '0');
        return h + ':' + m;
    }

    function formatDate(ts) {
        if (!ts) return '';
        var d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0');
    }

    function todayStr() {
        var d = new Date();
        return d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0');
    }

    // ── Escape HTML ──
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // =========================================================
    // INITIALIZATION
    // =========================================================
    function init() {
        var config = window.NEXTWAVE_FIREBASE_CONFIG;
        if (!config || typeof config !== 'object') {
            $('login-error').textContent = 'Firebase 설정이 없습니다. firebase.config.js를 확인해 주세요.';
            return;
        }

        var hasConfig = Object.values(config).every(function (v) {
            return typeof v === 'string' && v.indexOf('PASTE_YOUR') === -1;
        });

        if (!hasConfig) {
            $('login-error').textContent = 'Firebase 설정이 완료되지 않았습니다. firebase.config.js를 확인해 주세요.';
            return;
        }

        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(config);
            }
            auth = firebase.auth();
            db = firebase.firestore();
            auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        } catch (e) {
            console.error('Firebase init failed:', e);
            $('login-error').textContent = 'Firebase 초기화 실패: ' + e.message;
            return;
        }

        // Auth state listener
        auth.onAuthStateChanged(function (user) {
            if (user) {
                currentUser = user;
                handleSignedIn(user);
            } else {
                currentUser = null;
                currentProfile = null;
                showScreen('login');
            }
        });

        // Bind login button
        $('login-btn').addEventListener('click', doLogin);
        $('pending-logout').addEventListener('click', doLogout);
        $('topbar-logout').addEventListener('click', doLogout);

        // Sidebar navigation
        setupSidebar();

        // Chat
        $('chat-send').addEventListener('click', sendChat);
        $('chat-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') sendChat();
        });

        // Announcements
        $('ann-submit').addEventListener('click', submitAnnouncement);

        // Attendance
        $('attendance-btn').addEventListener('click', doAttendance);

        // Admin
        // Inline actions will be handled by window level functions: window.adminInlineAction, window.adminRename

        // Mobile sidebar
        var mobileBtn = $('mobile-sidebar-btn');
        var sidebar = $('portal-sidebar');
        var backdrop = $('mobile-backdrop');

        if (mobileBtn) {
            mobileBtn.addEventListener('click', function () {
                sidebar.classList.toggle('open');
                backdrop.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
            });
        }
        if (backdrop) {
            backdrop.addEventListener('click', function () {
                sidebar.classList.remove('open');
                backdrop.style.display = 'none';
            });
        }
    }

    // =========================================================
    // AUTH
    // =========================================================
    function doLogin() {
        if (!auth) return;
        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(function (err) {
            console.error('Login error:', err);
            $('login-error').textContent = '로그인 실패: ' + err.message;
        });
    }

    function doLogout() {
        if (!auth) return;
        if (chatUnsubscribe) chatUnsubscribe();
        if (announcementsUnsubscribe) announcementsUnsubscribe();
        if (oppUnsubscribe) oppUnsubscribe();
        auth.signOut();
    }

    async function handleSignedIn(user) {
        // Check/create member profile
        try {
            var memberRef = db.collection('members').doc(user.uid);
            var doc = await memberRef.get();

            if (!doc.exists) {
                var isSuperAdmin = (user.email === 'hupatv@gmail.com');

                await memberRef.set({
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName || '',
                    photoURL: user.photoURL || '',
                    isMember: isSuperAdmin,
                    isAdmin: isSuperAdmin,
                    role: isSuperAdmin ? 'admin' : 'pending',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                currentProfile = { isMember: isSuperAdmin, isAdmin: isSuperAdmin, role: isSuperAdmin ? 'admin' : 'pending' };
            } else {
                currentProfile = doc.data();
                var isSuperAdmin = (user.email === 'hupatv@gmail.com' || user.email === 'hanyong.kk1@gmail.com' || user.email === 'handak@10.nate.com');

                // Auto-upgrade super admin if not already upgraded
                if (isSuperAdmin && (!currentProfile.isAdmin || !currentProfile.isMember)) {
                    await memberRef.update({
                        isMember: true,
                        isAdmin: true,
                        role: 'admin',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    currentProfile.isMember = true;
                    currentProfile.isAdmin = true;
                    currentProfile.role = 'admin';
                }

                // Update display name / photo if changed
                if (currentProfile.displayName !== user.displayName || currentProfile.photoURL !== user.photoURL) {
                    await memberRef.update({
                        displayName: user.displayName || '',
                        photoURL: user.photoURL || '',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }

            if (currentProfile.isMember) {
                showScreen('portal');
                setupPortal(user);
            } else {
                showScreen('pending');
            }
        } catch (err) {
            console.error('Profile check error:', err);
            showToast('프로필 확인 실패: ' + err.message);
            showScreen('pending');
        }
    }

    // =========================================================
    // SCREEN MANAGEMENT
    // =========================================================
    function showScreen(name) {
        loginScreen.style.display = name === 'login' ? '' : 'none';
        pendingScreen.style.display = name === 'pending' ? '' : 'none';
        portalApp.style.display = name === 'portal' ? '' : 'none';
    }

    // =========================================================
    // PORTAL SETUP
    // =========================================================
    function setupPortal(user) {
        // Topbar
        $('topbar-username').textContent = user.displayName || user.email;
        var avatar = $('topbar-avatar');
        if (user.photoURL) {
            avatar.src = user.photoURL;
            avatar.style.display = '';
        } else {
            avatar.style.display = 'none';
        }

        // Admin nav & opp form
        if (currentProfile && currentProfile.isAdmin) {
            $('admin-nav').style.display = '';
            $('announcement-form-card').style.display = '';
            $('opp-form-card').style.display = '';
        }

        // Load data
        loadChat();
        loadAnnouncements();
        loadAttendance();
        loadMembers();
        loadOpportunities();
        setupOppFilters();
        if (currentProfile && currentProfile.isAdmin) {
            loadAdminMembers();
            loadAllAttendance();
        }

        // Opp submit
        $('opp-submit').addEventListener('click', submitOpportunity);
    }

    // =========================================================
    // SIDEBAR NAVIGATION
    // =========================================================
    function setupSidebar() {
        var items = document.querySelectorAll('.portal-sidebar .nav-item');
        items.forEach(function (item) {
            item.addEventListener('click', function () {
                var tab = item.getAttribute('data-tab');
                if (!tab) return;

                // Update active state
                items.forEach(function (i) { i.classList.remove('active'); });
                item.classList.add('active');

                // Show panel
                document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
                var panel = $('tab-' + tab);
                if (panel) panel.classList.add('active');

                // Close mobile sidebar
                var sidebar = $('portal-sidebar');
                var backdrop = $('mobile-backdrop');
                sidebar.classList.remove('open');
                if (backdrop) backdrop.style.display = 'none';
            });
        });
    }

    // =========================================================
    // CHAT MODULE
    // =========================================================
    function loadChat() {
        if (!db) return;
        var messagesDiv = $('chat-messages');

        if (chatUnsubscribe) chatUnsubscribe();

        chatUnsubscribe = db.collection('messages')
            .orderBy('createdAt', 'asc')
            .limitToLast(100)
            .onSnapshot(function (snapshot) {
                messagesDiv.innerHTML = '';
                if (snapshot.empty) {
                    messagesDiv.innerHTML = '<div style="text-align:center;color:var(--p-outline);font-size:12px;padding:40px;">아직 메시지가 없습니다. 첫 메시지를 보내보세요!</div>';
                    return;
                }
                snapshot.forEach(function (doc) {
                    var msg = doc.data();
                    var el = document.createElement('div');
                    el.className = 'chat-msg';
                    var chatDeleteHtml = '';
                    if (currentProfile && currentProfile.isAdmin) {
                        chatDeleteHtml = '<button type="button" class="chat-delete-btn" onclick="event.preventDefault(); event.stopPropagation(); window.deleteChat(\'' + doc.id + '\')" title="삭제" style="background:none;border:none;color:var(--p-danger);cursor:pointer;margin-left:auto;"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>';
                    }
                    
                    el.innerHTML =
                        '<img class="avatar" src="' + escapeHtml(msg.photoURL || '') + '" alt="" onerror="this.style.display=\'none\'">' +
                        '<div class="msg-body" style="flex-grow:1;">' +
                        '  <div class="msg-header" style="display:flex;">' +
                        '    <span class="msg-name">' + escapeHtml(msg.displayName || 'Unknown') + '</span>' +
                        '    <span class="msg-time">' + formatTime(msg.createdAt) + '</span>' +
                        chatDeleteHtml +
                        '  </div>' +
                        '  <div class="msg-text">' + escapeHtml(msg.text || '') + '</div>' +
                        '</div>';
                    messagesDiv.appendChild(el);
                });
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }, function (err) {
                console.error('Chat listener error:', err);
                messagesDiv.innerHTML = '<div style="text-align:center;color:var(--p-danger);font-size:12px;padding:20px;">채팅 로드 실패: ' + escapeHtml(err.message) + '</div>';
            });
    }

    function sendChat() {
        if (!db || !currentUser) return;
        var input = $('chat-input');
        var text = input.value.trim();
        if (!text) return;

        input.value = '';
        db.collection('messages').add({
            text: text,
            uid: currentUser.uid,
            displayName: currentUser.displayName || currentUser.email,
            photoURL: currentUser.photoURL || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function (err) {
            console.error('Send error:', err);
            showToast('메시지 전송 실패');
        });
    }

    // =========================================================
    // DELETE CHAT
    // =========================================================
    window.deleteChat = function(docId) {
        if (!db) return;
        if (!currentProfile || !currentProfile.isAdmin) {
            showToast('삭제 권한이 없습니다. (관리자 전용)');
            return;
        }
        showConfirmModal('이 메시지를 삭제하시겠습니까?', function() {
            db.collection('messages').doc(docId).delete().then(function() {
                showToast('메시지가 삭제되었습니다.');
            }).catch(function(err) {
                console.error('Chat delete error:', err);
                showToast('삭제 실패: ' + err.message);
            });
        });
    };

    // =========================================================
    // ANNOUNCEMENTS MODULE
    // =========================================================
    function loadAnnouncements() {
        if (!db) return;
        var listDiv = $('announcements-list');

        if (announcementsUnsubscribe) announcementsUnsubscribe();

        announcementsUnsubscribe = db.collection('announcements')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .onSnapshot(function (snapshot) {
                listDiv.innerHTML = '';
                if (snapshot.empty) {
                    listDiv.innerHTML = '<div style="text-align:center;color:var(--p-outline);font-size:12px;padding:30px;">등록된 공지사항이 없습니다.</div>';
                    return;
                }
                snapshot.forEach(function (doc) {
                    var ann = doc.data();
                    var annId = doc.id;
                    var el = document.createElement('div');
                    el.className = 'announcement-item';
                    
                    var deleteHtml = '';
                    if (currentProfile && currentProfile.isAdmin) {
                        deleteHtml = '<button type="button" class="ann-delete-btn" onclick="event.preventDefault(); event.stopPropagation(); window.deleteAnnouncement(\'' + annId + '\')" title="공지 삭제"><span class="material-symbols-outlined" style="font-size:16px;">delete</span></button>';
                    }

                    el.innerHTML =
                        '<div class="ann-header">' +
                        '  <div class="ann-title-wrap">' +
                        '    <div class="ann-title">' + escapeHtml(ann.title || '제목 없음') + '</div>' +
                        deleteHtml +
                        '  </div>' +
                        '  <div class="ann-date">' + formatDate(ann.createdAt) + '</div>' +
                        '</div>' +
                        '<div class="ann-body">' + escapeHtml(ann.body || '').replace(/\n/g, '<br>') + '</div>';
                    listDiv.appendChild(el);
                });
            }, function (err) {
                console.error('Announcements error:', err);
                listDiv.innerHTML = '<div style="color:var(--p-danger);font-size:12px;padding:20px;">공지사항 로드 실패</div>';
            });
    }

    function submitAnnouncement() {
        if (!db || !currentProfile || !currentProfile.isAdmin) return;
        var title = $('ann-title-input').value.trim();
        var body = $('ann-body-input').value.trim();
        if (!title || !body) {
            showToast('제목과 내용을 모두 입력해 주세요.');
            return;
        }

        db.collection('announcements').add({
            title: title,
            body: body,
            authorUid: currentUser.uid,
            authorName: currentUser.displayName || currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
            $('ann-title-input').value = '';
            $('ann-body-input').value = '';
            showToast('공지가 등록되었습니다.');
        }).catch(function (err) {
            console.error('Announcement submit error:', err);
            showToast('공지 등록 실패');
        });
    }

    // =========================================================
    // DELETE ANNOUNCEMENT
    // =========================================================
    window.deleteAnnouncement = function(docId) {
        if (!db) return;
        if (!currentProfile || !currentProfile.isAdmin) {
            showToast('삭제 권한이 없습니다. (관리자 전용)');
            return;
        }
        showConfirmModal('정말 이 공지사항을 삭제하시겠습니까?', function() {
            db.collection('announcements').doc(docId).delete().then(function() {
                showToast('공지사항이 삭제되었습니다.');
            }).catch(function(err) {
                console.error('Delete error:', err);
                showToast('삭제 실패: ' + err.message);
            });
        });
    };

    // =========================================================
    // OPPORTUNITIES MODULE
    // =========================================================
    var CATEGORY_LABELS = {
        contest: '🏆 공모전',
        hackathon: '💻 해커톤',
        dev: '⚙️ 개발',
        gamedev: '🎮 게임개발',
        marketing: '📢 마케팅',
        activity: '🤝 대외활동'
    };

    function calcDday(deadlineStr) {
        if (!deadlineStr) return null;
        var deadline = new Date(deadlineStr + 'T23:59:59');
        var now = new Date();
        var diff = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
        return diff;
    }

    function ddayLabel(dday) {
        if (dday === null) return { text: '상시', cls: 'normal' };
        if (dday < 0) return { text: '마감', cls: 'urgent' };
        if (dday === 0) return { text: 'D-DAY', cls: 'urgent' };
        if (dday <= 7) return { text: 'D-' + dday, cls: 'urgent' };
        if (dday <= 14) return { text: 'D-' + dday, cls: 'soon' };
        return { text: 'D-' + dday, cls: 'normal' };
    }

    function loadOpportunities() {
        if (!db) return;
        var grid = $('opp-grid');

        if (oppUnsubscribe) oppUnsubscribe();

        oppUnsubscribe = db.collection('opportunities')
            .onSnapshot(function (snapshot) {
                grid.innerHTML = '';
                var hasItems = false;
                var items = [];
                snapshot.forEach(function (doc) { items.push({ id: doc.id, data: doc.data() }); });
                // 클라이언트 정렬: createdAt 최신순
                items.sort(function(a, b) {
                    var ta = a.data.createdAt ? (a.data.createdAt.seconds || 0) : 0;
                    var tb = b.data.createdAt ? (b.data.createdAt.seconds || 0) : 0;
                    return tb - ta;
                });

                items.forEach(function (item) {
                    var opp = item.data;
                    var oppId = item.id;
                    var dday = calcDday(opp.deadline);

                    // 마감된 정보 자동 숨기기 (마감일 지난 지 3일 이상)
                    if (dday !== null && dday < -3) return;

                    // 카테고리 필터
                    if (currentOppFilter !== 'all' && opp.category !== currentOppFilter) return;

                    hasItems = true;
                    var dd = ddayLabel(dday);

                    var deleteBtn = '';
                    if (currentProfile && currentProfile.isAdmin) {
                        deleteBtn = '<button type="button" class="opp-delete-btn" data-opp-id="' + oppId + '" title="삭제"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>';
                    }

                    var linkBtn = '';
                    if (opp.link) {
                        linkBtn = '<a href="' + escapeHtml(opp.link) + '" target="_blank" rel="noopener" class="opp-link-btn"><span class="material-symbols-outlined" style="font-size:12px;">open_in_new</span> 바로가기</a>';
                    }

                    var card = document.createElement('div');
                    card.className = 'opp-card';
                    card.setAttribute('data-category', opp.category || '');
                    card.innerHTML =
                        '<div class="opp-card-header">' +
                        '  <div class="opp-card-title">' + escapeHtml(opp.title || '') + '</div>' +
                        '  <div class="opp-dday ' + dd.cls + '">' + dd.text + '</div>' +
                        '</div>' +
                        '<div class="opp-card-desc">' + escapeHtml(opp.description || '').replace(/\n/g, '<br>') + '</div>' +
                        '<div class="opp-card-meta">' +
                        '  <span class="opp-tag ' + (opp.category || '') + '">' + (CATEGORY_LABELS[opp.category] || opp.category || '') + '</span>' +
                        (opp.source ? '  <span class="opp-source">출처: ' + escapeHtml(opp.source) + '</span>' : '') +
                        (opp.deadline ? '  <span class="opp-source">마감: ' + escapeHtml(opp.deadline) + '</span>' : '') +
                        '</div>' +
                        '<div class="opp-card-actions">' + linkBtn + deleteBtn + '</div>';

                    grid.appendChild(card);
                });

                if (!hasItems) {
                    grid.innerHTML = '<div class="opp-empty">' +
                        '<span class="material-symbols-outlined" style="font-size:48px;display:block;margin-bottom:8px;">search_off</span>' +
                        '등록된 기회 정보가 없습니다.' +
                        (currentOppFilter !== 'all' ? '<br><span style="font-size:10px;">다른 카테고리를 선택해 보세요.</span>' : '') +
                        '</div>';
                }
            }, function (err) {
                console.error('Opportunities error:', err);
                grid.innerHTML = '<div class="opp-empty" style="color:var(--p-danger);">기회 정보 로드 실패: ' + escapeHtml(err.message) + '</div>';
            });
    }

    function setupOppFilters() {
        var filtersDiv = $('opp-filters');
        if (!filtersDiv) return;
        filtersDiv.addEventListener('click', function(e) {
            var btn = e.target.closest('.opp-filter-btn');
            if (!btn) return;
            var filter = btn.getAttribute('data-filter');
            currentOppFilter = filter;

            filtersDiv.querySelectorAll('.opp-filter-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');

            loadOpportunities();
        });
    }

    function submitOpportunity() {
        if (!db || !currentProfile || !currentProfile.isAdmin) return;

        var title = $('opp-title-input').value.trim();
        var description = $('opp-desc-input').value.trim();
        var category = $('opp-category-input').value;
        var deadline = $('opp-deadline-input').value;
        var link = $('opp-link-input').value.trim();
        var source = $('opp-source-input').value.trim();

        if (!title) {
            showToast('제목을 입력해 주세요.');
            return;
        }

        db.collection('opportunities').add({
            title: title,
            description: description,
            category: category,
            deadline: deadline || null,
            link: link || null,
            source: source || null,
            authorUid: currentUser.uid,
            authorName: currentUser.displayName || currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
            $('opp-title-input').value = '';
            $('opp-desc-input').value = '';
            $('opp-deadline-input').value = '';
            $('opp-link-input').value = '';
            $('opp-source-input').value = '';
            showToast('기회 정보가 등록되었습니다!');
        }).catch(function (err) {
            console.error('Opp submit error:', err);
            showToast('등록 실패: ' + err.message);
        });
    }

    // 기회 정보 삭제 (이벤트 위임 방식)
    var oppGrid = $('opp-grid');
    if (oppGrid) {
        oppGrid.addEventListener('click', function(e) {
            var btn = e.target.closest('.opp-delete-btn');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            
            var docId = btn.getAttribute('data-opp-id');
            if (!docId) return;
            if (!db) return;
            if (!currentProfile || !currentProfile.isAdmin) {
                showToast('삭제 권한이 없습니다. (관리자 전용)');
                return;
            }

            showConfirmModal('이 기회 정보를 삭제하시겠습니까?', function() {
                db.collection('opportunities').doc(docId).delete().then(function() {
                    showToast('기회 정보가 삭제되었습니다.');
                }).catch(function(err) {
                    console.error('Opp delete error:', err);
                    showToast('삭제 실패: ' + err.message);
                });
            });
        });
    }

    // =========================================================
    // ATTENDANCE MODULE
    // =========================================================
    function loadAttendance() {
        if (!db || !currentUser) return;

        var today = todayStr();
        $('attendance-date').textContent = today;

        // Check today's attendance
        var todayRef = db.collection('attendance').doc(currentUser.uid + '_' + today);
        todayRef.get().then(function (doc) {
            if (doc.exists) {
                $('attendance-status').innerHTML = '<div class="status-badge checked">✓ 출석 완료</div>';
                $('attendance-btn').disabled = true;
                $('attendance-btn').textContent = '이미 출석했습니다';
            } else {
                $('attendance-status').innerHTML = '<div class="status-badge not-checked">미출석</div>';
                $('attendance-btn').disabled = false;
                $('attendance-btn').textContent = '출석 체크';
            }
        });

        // Load history
        db.collection('attendance')
            .where('uid', '==', currentUser.uid)
            .limit(30)
            .get()
            .then(function (snapshot) {
                var tbody = $('attendance-history');
                tbody.innerHTML = '';
                if (snapshot.empty) {
                    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--p-outline);">출석 기록이 없습니다.</td></tr>';
                    return;
                }
                snapshot.forEach(function (doc) {
                    var data = doc.data();
                    var tr = document.createElement('tr');
                    tr.innerHTML =
                        '<td>' + escapeHtml(data.date || '') + '</td>' +
                        '<td>' + formatTime(data.createdAt) + '</td>' +
                        '<td style="color:var(--p-tertiary);">✓ 출석</td>';
                    tbody.appendChild(tr);
                });
            })
            .catch(function (err) {
                console.error('Attendance history error:', err);
            });
    }

    function doAttendance() {
        if (!db || !currentUser) return;
        var today = todayStr();
        var docId = currentUser.uid + '_' + today;

        db.collection('attendance').doc(docId).set({
            uid: currentUser.uid,
            displayName: currentUser.displayName || '',
            date: today,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
            showToast('출석이 완료되었습니다!');
            loadAttendance();
        }).catch(function (err) {
            console.error('Attendance error:', err);
            showToast('출석 체크 실패: ' + err.message);
        });
    }

    // =========================================================
    // MEMBERS MODULE
    // =========================================================
    function loadMembers() {
        if (!db) return;
        var grid = $('member-grid');

        db.collection('members')
            .where('isMember', '==', true)
            .get()
            .then(function (snapshot) {
                grid.innerHTML = '';
                if (snapshot.empty) {
                    grid.innerHTML = '<div style="text-align:center;color:var(--p-outline);font-size:12px;padding:20px;grid-column:1/-1;">승인된 부원이 없습니다.</div>';
                    return;
                }
                snapshot.forEach(function (doc) {
                    var m = doc.data();
                    var card = document.createElement('div');
                    card.className = 'member-card';
                    var badgeClass = m.isAdmin ? 'admin' : 'member';
                    var badgeText = m.isAdmin ? 'ADMIN' : 'MEMBER';
                    card.innerHTML =
                        '<img src="' + escapeHtml(m.photoURL || '') + '" alt="" onerror="this.style.display=\'none\'">' +
                        '<div class="member-info">' +
                        '  <div class="member-name">' + escapeHtml(m.displayName || m.email || 'Unknown') + '</div>' +
                        '  <div class="member-role">' + escapeHtml(m.role || 'member') + '</div>' +
                        '</div>' +
                        '<span class="member-badge ' + badgeClass + '">' + badgeText + '</span>';
                    grid.appendChild(card);
                });
            })
            .catch(function (err) {
                console.error('Members error:', err);
                grid.innerHTML = '<div style="color:var(--p-danger);font-size:12px;padding:20px;grid-column:1/-1;">부원 목록 로드 실패</div>';
            });
    }

    // =========================================================
    // ADMIN MODULE
    // =========================================================
    function loadAdminMembers() {
        if (!db) return;
        var listDiv = $('admin-member-list');

        db.collection('members')
            .orderBy('createdAt', 'desc')
            .get()
            .then(function (snapshot) {
                listDiv.innerHTML = '';
                snapshot.forEach(function (doc) {
                    var m = doc.data();
                    var mId = m.uid;
                    var row = document.createElement('div');
                    row.className = 'admin-member-row';
                    
                    var statusColor = m.isAdmin ? 'var(--p-secondary)' : (m.isMember ? 'var(--p-tertiary)' : 'var(--p-outline)');
                    var statusText = m.isAdmin ? 'ADMIN' : (m.isMember ? 'MEMBER' : 'PENDING');
                    
                    var actionsHtml = '';
                    if (!m.isMember) {
                        actionsHtml += '<button class="btn-tiny primary" onclick="window.adminInlineAction(\'' + mId + '\', \'approve\')">승인</button>';
                    } else if (!m.isAdmin) {
                        actionsHtml += '<button class="btn-tiny secondary" onclick="window.adminInlineAction(\'' + mId + '\', \'makeAdmin\')">관리자 부여</button>';
                        actionsHtml += '<button class="btn-tiny danger" onclick="window.adminInlineAction(\'' + mId + '\', \'revoke\')">회수</button>';
                    } else {
                        // Admin
                        if (m.email !== 'hupatv@gmail.com') { // superadmin protection
                            actionsHtml += '<button class="btn-tiny danger" onclick="window.adminInlineAction(\'' + mId + '\', \'revoke\')">권한 회수</button>';
                        }
                    }

                    row.innerHTML =
                        '<div class="admin-member-info">' +
                        '  <div class="admin-name-edit">' +
                        '    <input type="text" class="admin-name-input" id="admin-name-' + mId + '" value="' + escapeHtml(m.displayName || '') + '" placeholder="이름 없음">' +
                        '    <button class="btn-tiny" onclick="window.adminRename(\'' + mId + '\')">저장</button>' +
                        '  </div>' +
                        '  <div style="color:var(--p-outline);font-size:10px;">' + escapeHtml(m.email || '') + ' <span style="color:' + statusColor + ';font-weight:700;margin-left:4px;">[' + statusText + ']</span></div>' +
                        '</div>' +
                        '<div class="admin-row-actions">' + actionsHtml + '</div>';
                    
                    listDiv.appendChild(row);
                });
            })
            .catch(function (err) {
                console.error('Admin list error:', err);
            });
    }

    function loadAllAttendance() {
        if (!db) return;
        var tbody = $('admin-attendance-body');

        db.collection('attendance')
            .limit(100)
            .get()
            .then(function (snapshot) {
                tbody.innerHTML = '';
                if (snapshot.empty) {
                    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--p-outline);">출석 기록이 없습니다.</td></tr>';
                    return;
                }
                snapshot.forEach(function (doc) {
                    var data = doc.data();
                    var tr = document.createElement('tr');
                    tr.innerHTML =
                        '<td>' + escapeHtml(data.displayName || 'Unknown') + '</td>' +
                        '<td>' + escapeHtml(data.date || '') + '</td>' +
                        '<td>' + formatTime(data.createdAt) + '</td>';
                    tbody.appendChild(tr);
                });
            })
            .catch(function (err) {
                console.error('All attendance error:', err);
                tbody.innerHTML = '<tr><td colspan="3" style="color:var(--p-danger);text-align:center;">로드 실패</td></tr>';
            });
    }

    window.adminRename = async function(uid) {
        if (!db || !currentProfile || !currentProfile.isAdmin) return;
        var newName = $('admin-name-' + uid).value.trim();
        if (!newName) {
            showToast('이름을 입력해 주세요.');
            return;
        }

        try {
            await db.collection('members').doc(uid).update({
                displayName: newName,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast('이름이 변경되었습니다.');
            loadMembers();
            // Optional: update chat messages where author is this user (too complex for now, just future msgs will have new name)
        } catch (err) {
            console.error('Rename error:', err);
            showToast('이름 변경 실패: ' + err.message);
        }
    };

    window.adminInlineAction = async function(uid, action) {
        if (!db || !currentProfile || !currentProfile.isAdmin) return;
        
        if (action === 'revoke' && !confirm('정말 이 유저의 권한을 회수하시겠습니까?')) return;

        try {
            var memberDoc = db.collection('members').doc(uid);
            var updateData = {};
            if (action === 'approve') {
                updateData = { isMember: true, role: 'member', updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            } else if (action === 'makeAdmin') {
                updateData = { isMember: true, isAdmin: true, role: 'admin', updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            } else if (action === 'revoke') {
                updateData = { isMember: false, isAdmin: false, role: 'pending', updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            }

            await memberDoc.update(updateData);
            showToast('권한이 변경되었습니다.');

            // Refresh lists
            loadMembers();
            loadAdminMembers();
        } catch (err) {
            console.error('Action error:', err);
            showToast('오류: ' + err.message);
        }
    };

    // =========================================================
    // BOOT
    // =========================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
