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
        $('admin-approve').addEventListener('click', function () { adminAction('approve'); });
        $('admin-make-admin').addEventListener('click', function () { adminAction('makeAdmin'); });
        $('admin-revoke').addEventListener('click', function () { adminAction('revoke'); });

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
                var isSuperAdmin = (user.email === 'hupatv@gmail.com');

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

        // Admin nav
        if (currentProfile && currentProfile.isAdmin) {
            $('admin-nav').style.display = '';
            $('announcement-form-card').style.display = '';
        }

        // Load data
        loadChat();
        loadAnnouncements();
        loadAttendance();
        loadMembers();
        if (currentProfile && currentProfile.isAdmin) {
            loadAdminMembers();
            loadAllAttendance();
        }
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
                    el.innerHTML =
                        '<img class="avatar" src="' + escapeHtml(msg.photoURL || '') + '" alt="" onerror="this.style.display=\'none\'">' +
                        '<div class="msg-body">' +
                        '  <div class="msg-header">' +
                        '    <span class="msg-name">' + escapeHtml(msg.displayName || 'Unknown') + '</span>' +
                        '    <span class="msg-time">' + formatTime(msg.createdAt) + '</span>' +
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
                    var el = document.createElement('div');
                    el.className = 'announcement-item';
                    el.innerHTML =
                        '<div class="ann-header">' +
                        '  <div class="ann-title">' + escapeHtml(ann.title || '제목 없음') + '</div>' +
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
                    var row = document.createElement('div');
                    row.className = 'admin-member-row';
                    var statusColor = m.isMember ? 'var(--p-tertiary)' : 'var(--p-secondary)';
                    var statusText = m.isAdmin ? 'ADMIN' : (m.isMember ? 'MEMBER' : 'PENDING');
                    row.innerHTML =
                        '<div>' +
                        '  <div style="color:var(--p-on-surface);font-weight:600;">' + escapeHtml(m.displayName || 'N/A') + '</div>' +
                        '  <div style="color:var(--p-outline);font-size:10px;">' + escapeHtml(m.email || '') + '</div>' +
                        '</div>' +
                        '<div style="color:' + statusColor + ';font-weight:700;font-size:10px;text-transform:uppercase;">' + statusText + '</div>';
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

    async function adminAction(action) {
        if (!db || !currentProfile || !currentProfile.isAdmin) return;
        var target = $('admin-target').value.trim();
        var statusEl = $('admin-status');

        if (!target) {
            statusEl.textContent = 'UID 또는 이메일을 입력해 주세요.';
            return;
        }

        statusEl.textContent = '처리 중...';

        try {
            // Find member by UID or email
            var memberDoc = null;
            var docRef = db.collection('members').doc(target);
            var doc = await docRef.get();

            if (doc.exists) {
                memberDoc = docRef;
            } else {
                // Search by email
                var query = await db.collection('members').where('email', '==', target).limit(1).get();
                if (!query.empty) {
                    memberDoc = query.docs[0].ref;
                }
            }

            if (!memberDoc) {
                statusEl.textContent = '해당 사용자를 찾을 수 없습니다.';
                return;
            }

            var updateData = {};
            if (action === 'approve') {
                updateData = { isMember: true, role: 'member', updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            } else if (action === 'makeAdmin') {
                updateData = { isMember: true, isAdmin: true, role: 'admin', updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            } else if (action === 'revoke') {
                updateData = { isMember: false, isAdmin: false, role: 'pending', updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
            }

            await memberDoc.update(updateData);
            statusEl.textContent = '✓ 권한이 업데이트되었습니다.';
            statusEl.style.color = 'var(--p-tertiary)';
            $('admin-target').value = '';

            // Refresh lists
            loadMembers();
            loadAdminMembers();
            loadAllAttendance();
            showToast('권한 변경 완료');

            setTimeout(function () {
                statusEl.style.color = '';
            }, 3000);
        } catch (err) {
            console.error('Admin action error:', err);
            statusEl.textContent = '오류: ' + err.message;
            statusEl.style.color = 'var(--p-danger)';
        }
    }

    // =========================================================
    // BOOT
    // =========================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
