/* Firebase email authentication. Credentials and action links stay out of storage and logs. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  const initialHref = root.location.href;
  api.cleanActionURL(root);
  root.NextWaveEmailAuth = { create: options => api.create({ ...options, window: root, document: root.document, initialHref }) };
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const EMAIL_KEY = 'nw:email-signin';
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function cleanActionURL(win) {
    const url = new URL(win.location.href);
    if (!url.searchParams.has('oobCode')) return;
    // Remove one-time codes before the portal starts loading public/private data.
    win.document?.getElementById('auth-referrer')?.setAttribute('content', 'no-referrer');
    win.history.replaceState(null, '', url.pathname);
  }
  function create({ auth, window: win, document: doc, initialHref = win.location.href, onAuthenticated = () => {} }) {
    const $ = id => doc.getElementById(id);
    let pendingLink = auth.isSignInWithEmailLink(initialHref) ? initialHref : '';
    let mode = pendingLink ? 'confirm' : 'password', busy = false, externalBusy = false;
    let sentAt = 0, resendTimer = null, lastUid = null, passwordBusy = false;
    const setMessage = (id, text) => { $(id).textContent = text; };
    const storage = () => win.localStorage;
    function savedEmail() {
      try {
        const value = JSON.parse(storage().getItem(EMAIL_KEY) || 'null');
        if (value && typeof value.email === 'string' && emailPattern.test(value.email) && Date.now() - value.at >= 0 && Date.now() - value.at < 86400000) return value.email;
        storage().removeItem(EMAIL_KEY);
      } catch (_) { /* A blocked storage area only requires typing the email again. */ }
      return '';
    }
    function clearSavedEmail() { try { storage().removeItem(EMAIL_KEY); } catch (_) {} }
    function errorText(error) {
      const code = error?.code;
      if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') return '요청이 많아 잠시 쉬고 있어요. 나중에 다시 시도해 주세요.';
      if (code === 'auth/network-request-failed') return '인터넷 연결을 확인하고 다시 시도해 주세요.';
      if (code === 'auth/operation-not-allowed') return '이메일 로그인을 연결하지 못했어요. 운영진에게 알려 주세요.';
      if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri') return '현재 주소로 인증 메일을 보낼 수 없어요. 운영진에게 알려 주세요.';
      if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') return '인증 링크가 만료됐거나 이미 사용됐어요. 새 링크를 받아 주세요.';
      if (code === 'auth/requires-recent-login') return '계정 보호를 위해 다시 로그인한 뒤 비밀번호를 설정해 주세요.';
      if (code === 'auth/weak-password') return '더 긴 비밀번호를 사용해 주세요. 최소 12자로 입력해 주세요.';
      return mode === 'confirm' ? '메일 주소와 인증 링크를 확인해 주세요. 링크를 받은 주소를 입력해야 합니다.' : '로그인 정보를 확인해 주세요. 비밀번호가 없다면 메일로 먼저 인증해 주세요.';
    }
    function updateControls() {
      const disabled = busy || externalBusy;
      $('email-login-address').disabled = disabled;
      $('email-login-password').disabled = disabled || mode !== 'password';
      $('email-login-password').required = mode === 'password';
      $('email-password-field').hidden = mode !== 'password';
      $('email-login-submit').disabled = disabled || (mode === 'link' && Date.now() - sentAt < 60000);
      $('email-login-mode').disabled = disabled;
      $('email-login-cancel').disabled = disabled;
      $('email-login-cancel').hidden = !pendingLink;
      $('email-login-form').setAttribute('aria-busy', String(disabled));
      $('email-login-submit').textContent = busy ? '계정 확인 중' : mode === 'confirm' ? '메일 인증 완료하기' : mode === 'link' ? '로그인 링크 받기' : '이메일로 로그인';
      $('email-login-mode').textContent = mode === 'password' ? '처음 이용 / 비밀번호 없이' : '비밀번호로 로그인';
      $('email-login-mode').hidden = !!pendingLink;
      setMessage('email-auth-help', mode === 'confirm' ? '링크를 받은 이메일 주소를 확인해 주세요.' : mode === 'link' ? '기존 Google 부원은 같은 이메일을 입력해 주세요. 메일 인증 후 비밀번호도 설정할 수 있어요.' : '메일 인증 후 설정한 비밀번호를 입력해 주세요.');
      $('login-btn').disabled = disabled;
      $('google-signin').inert = disabled;
    }
    function setMode(next) { mode = next; $('email-login-password').value = ''; setMessage('email-auth-error', ''); setMessage('email-auth-status', ''); updateControls(); }
    function requireVerification(user) {
      $('email-auth-panel').open = true; $('email-login-address').value = user.email || '';
      setMode('link'); setMessage('email-auth-status', '이메일 인증을 마친 뒤 부원 공간을 이용할 수 있어요. 로그인 링크를 받아 주세요.');
    }
    function continueURL() {
      const url = new URL('portal.html', win.location.href);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) throw new Error('Unsupported auth origin');
      url.search = ''; url.hash = '';
      return url.href;
    }
    async function submit(event) {
      event?.preventDefault();
      if (busy || externalBusy) return;
      const email = $('email-login-address').value.trim();
      if (!emailPattern.test(email) || email.length > 254) { setMessage('email-auth-error', '올바른 이메일 주소를 입력해 주세요.'); return; }
      if (mode === 'link' && Date.now() - sentAt < 60000) return;
      const active = auth.currentUser;
      if (active && active.email?.toLowerCase() !== email.toLowerCase()) {
        setMessage('email-auth-error', '다른 계정으로 로그인 중이에요. 메일 인증을 취소하고 현재 계정에서 로그아웃한 뒤 다시 열어 주세요.'); return;
      }
      const password = $('email-login-password').value;
      if (mode === 'password' && !password) { setMessage('email-auth-error', '비밀번호를 입력해 주세요.'); return; }
      busy = true; updateControls(); setMessage('email-auth-error', ''); setMessage('email-auth-status', '');
      try {
        if (mode === 'link') {
          await auth.sendSignInLinkToEmail(email, { url: continueURL(), handleCodeInApp: true });
          try { storage().setItem(EMAIL_KEY, JSON.stringify({ email, at: Date.now() })); } catch (_) {}
          sentAt = Date.now();
          setMessage('email-auth-status', '로그인 링크를 보냈어요. 받은편지함과 스팸함을 확인해 주세요. 다시 보내기는 1분 뒤 가능합니다.');
          win.clearTimeout(resendTimer); resendTimer = win.setTimeout(updateControls, 60000);
        } else {
          const result = mode === 'confirm' ? await auth.signInWithEmailLink(email, pendingLink) : await auth.signInWithEmailAndPassword(email, password);
          const user = result.user;
          if (user.emailVerified !== true) {
            requireVerification(user);
            if (auth.currentUser?.uid === user.uid) await auth.signOut();
            return;
          }
          if (auth.currentUser?.uid !== user.uid) return;
          pendingLink = ''; clearSavedEmail(); mode = 'password';
          setMessage('email-auth-status', '계정을 확인했어요.');
          onAuthenticated(auth.currentUser);
        }
      } catch (error) { setMessage('email-auth-error', errorText(error)); }
      finally { busy = false; $('email-login-password').value = ''; updateControls(); }
    }
    function syncUser(user) {
      const uid = user?.uid || null;
      if (uid !== lastUid) {
        lastUid = uid;
        $('email-new-password').value = ''; $('email-confirm-password').value = '';
        if ($('email-password-modal').open) $('email-password-modal').close();
      }
      doc.querySelectorAll('[data-email-password-open]').forEach(button => { button.hidden = !user || user.emailVerified !== true || !!pendingLink; });
    }
    function openPassword() {
      if (!auth.currentUser || auth.currentUser.emailVerified !== true || pendingLink) return;
      $('email-new-password').value = ''; $('email-confirm-password').value = '';
      setMessage('email-password-status', ''); setMessage('email-password-error', '');
      $('email-password-modal').showModal(); $('email-new-password').focus();
    }
    async function savePassword(event) {
      event?.preventDefault();
      const user = auth.currentUser;
      if (passwordBusy || !user || user.emailVerified !== true) return;
      const password = $('email-new-password').value;
      if (password.length < 12 || password.length > 128) { setMessage('email-password-error', '비밀번호를 12~128자로 입력해 주세요.'); return; }
      if (password !== $('email-confirm-password').value) { setMessage('email-password-error', '두 비밀번호가 일치하지 않아요.'); return; }
      passwordBusy = true; $('email-password-save').disabled = true;
      setMessage('email-password-error', ''); setMessage('email-password-status', '');
      try {
        // Updating the authenticated, verified account keeps its UID and linked Google provider.
        await user.updatePassword(password);
        if (auth.currentUser?.uid === user.uid) setMessage('email-password-status', '비밀번호를 설정했어요. 다음부터 이메일과 비밀번호로 로그인할 수 있어요.');
      } catch (error) { if (auth.currentUser?.uid === user.uid) setMessage('email-password-error', errorText(error)); }
      finally { passwordBusy = false; $('email-password-save').disabled = false; $('email-new-password').value = ''; $('email-confirm-password').value = ''; }
    }
    $('email-login-form').addEventListener('submit', submit);
    $('email-login-mode').addEventListener('click', () => { if (!busy && !externalBusy) setMode(mode === 'password' ? 'link' : 'password'); });
    $('email-login-cancel').addEventListener('click', () => { if (busy || externalBusy) return; pendingLink = ''; clearSavedEmail(); setMode('password'); onAuthenticated(auth.currentUser); });
    $('email-password-form').addEventListener('submit', savePassword);
    $('email-password-close').addEventListener('click', () => $('email-password-modal').close());
    $('email-password-modal').addEventListener('close', () => { $('email-new-password').value = ''; $('email-confirm-password').value = ''; });
    doc.querySelectorAll('[data-email-password-open]').forEach(button => button.addEventListener('click', openPassword));
    if (pendingLink) { $('email-auth-panel').open = true; $('email-login-address').value = savedEmail(); }
    updateControls(); syncUser(auth.currentUser);
    return {
      hasPendingLink: () => !!pendingLink, isBusy: () => busy, syncUser,
      setExternalBusy(value) { externalBusy = value; updateControls(); },
      requireVerification,
      dispose() { win.clearTimeout(resendTimer); }
    };
  }
  return { create, cleanActionURL };
});
