// ============================================================
// auth.js — Authentication Module
// ============================================================
const Auth = (() => {
  let _user = null;
  let _pendingCb = null;
  let _isSignup = false;
  let _processingRedirect = false; // Flag to prevent double-processing
  let _initDone = false; // Flag to ensure init runs only once
  let _unsubscribe = null; // Store listener unsubscribe function

  function init(onLogin, onLogout) {
    // Only initialize once! Don't register multiple listeners
    if (_initDone) {
      console.log('ℹ️ Auth.init() already called, skipping duplicate initialization');
      return;
    }
    _initDone = true;
    console.log('🔐 Auth.init() - Setting up authentication');

    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).then(() => {
      console.log('🔧 Auth persistence set to LOCAL');
    }).catch(err => {
      console.warn('Could not set auth persistence to LOCAL:', err.code || err.message || err);
    });

    // Handle redirect sign-in result FIRST (before auth state listener)
    auth.getRedirectResult().then(result => {
      if (result.user) {
        console.log('✅ Google redirect sign-in successful:', result.user.email);
        _user = result.user;
        _processingRedirect = false;
        closeModal();
        showToast('Signed in with Google! 🎉');
        if (_pendingCb) { _pendingCb(); _pendingCb = null; }
        onLogin && onLogin(result.user);
      }
    }).catch(err => {
      _processingRedirect = false;
      console.error('Google redirect result error:', err.code, err.message);
      if (err.code && err.code !== 'auth/cancelled-popup-request') {
        showErr(`[${err.code}] ${friendlyErr(err.code) || err.message || 'Something went wrong.'}`);
      }
    });

    // Set up the auth state listener (only once!)
    _unsubscribe = auth.onAuthStateChanged(user => {
      // Skip if we're processing redirect (to prevent immediate logout)
      if (_processingRedirect) {
        console.log('⏳ Skipping auth state change during redirect processing');
        return;
      }

      console.log('👤 Auth state changed:', user ? user.email : 'no user');
      _user = user;
      if (user) onLogin && onLogin(user);
      else onLogout && onLogout();
    });
  }

  function getUser() { return _user; }
  function isLoggedIn() { return !!_user; }

  function openModal(pendingCb) {
    _pendingCb = pendingCb || null;
    _setMode(false);
    document.getElementById('auth-modal')?.classList.add('show');
    clearErr();
  }

  function closeModal() {
    document.getElementById('auth-modal')?.classList.remove('show');
    clearForm();
  }

  function _setMode(signup) {
    _isSignup = signup;
    const t = signup;
    const el = id => document.getElementById(id);
    if (el('auth-modal-title'))   el('auth-modal-title').textContent   = t ? "Let's Get Started!" : "Welcome Back!";
    if (el('auth-modal-sub'))     el('auth-modal-sub').textContent     = t ? "Create your MANTI jewel art account" : "Sign in to your account";
    if (el('auth-name-row'))      el('auth-name-row').style.display    = t ? 'block' : 'none';
    if (el('auth-submit-btn'))    el('auth-submit-btn').textContent    = t ? "Create Account" : "Sign In";
    if (el('auth-toggle-link'))   el('auth-toggle-link').textContent   = t ? "Sign In" : "Sign Up";
    if (el('auth-toggle-prefix')) el('auth-toggle-prefix').textContent = t ? "Already have an account? " : "Don't have an account? ";
    clearErr();
  }

  function setupModal() {
    document.getElementById('auth-toggle-link')?.addEventListener('click', e => { e.preventDefault(); _setMode(!_isSignup); });
    document.getElementById('auth-modal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
    document.querySelectorAll('.input-eye').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = btn.closest('.input-wrap').querySelector('input');
        const txt = inp.type === 'text';
        inp.type = txt ? 'password' : 'text';
        btn.innerHTML = txt ? '<i class="fa fa-eye"></i>' : '<i class="fa fa-eye-slash"></i>';
      });
    });
    document.getElementById('auth-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      clearErr();
      const email = document.getElementById('auth-email')?.value.trim();
      const pass  = document.getElementById('auth-password')?.value;
      const name  = document.getElementById('auth-name')?.value.trim();
      const btn   = document.getElementById('auth-submit-btn');
      btn.disabled = true; btn.textContent = 'Please wait…';
      try {
        if (_isSignup) {
          if (!name) { showErr('Please enter your name.'); return; }
          const cred = await auth.createUserWithEmailAndPassword(email, pass);
          await cred.user.updateProfile({ displayName: name });
        } else {
          await auth.signInWithEmailAndPassword(email, pass);
        }
        closeModal();
        showToast(_isSignup ? 'Welcome to MANTI jewel art! 🎉' : 'Signed in successfully!');
        if (_pendingCb) { _pendingCb(); _pendingCb = null; }
      } catch(err) {
        console.error('Email auth sign-in error:', err.code, err.message);
        const message = friendlyErr(err.code) || err.message || 'Something went wrong.';
        showErr(message);
      } finally {
        btn.disabled = false;
        btn.textContent = _isSignup ? 'Create Account' : 'Sign In';
      }
    });
    document.getElementById('auth-google-btn')?.addEventListener('click', async () => {
      console.log('🔵 Google login button clicked');
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      
      try {
        console.log('� Setting auth persistence to LOCAL');
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      } catch (pErr) {
        console.warn('Could not set auth persistence:', pErr.code || pErr.message || pErr);
      }
      
      try {
        console.log('�📱 Attempting popup sign-in...');
        const result = await auth.signInWithPopup(provider);
        console.log('✅ Popup sign-in successful:', result.user.email);
        // Don't manually call onLogin - let the auth state listener handle it
        closeModal();
        showToast('Signed in with Google! 🎉');
      } catch(err) {
        console.error('❌ Popup sign-in error:', err.code, err.message);
        
        if (err.code === 'auth/popup-closed-by-user') {
          console.log('User closed popup');
          return;
        }

        // Fallback to redirect when popup fails (common on mobile)
        if (err.code === 'auth/popup-blocked' || 
            err.code === 'auth/cancelled-popup-request' || 
            err.code === 'auth/operation-not-supported-in-this-environment') {
          try {
            console.log('� Setting auth persistence to LOCAL before redirect');
            await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
          } catch (pErr) {
            console.warn('Could not set auth persistence before redirect:', pErr.code || pErr.message || pErr);
          }
          try {
            console.log('�🔄 Popup failed, trying redirect method...');
            _processingRedirect = true;
            await auth.signInWithRedirect(provider);
            return;
          } catch (redirectErr) {
            _processingRedirect = false;
            console.error('❌ Redirect failed:', redirectErr.code, redirectErr.message);
            const message = `[${redirectErr.code || 'unknown'}] ${friendlyErr(redirectErr.code) || redirectErr.message || 'Redirect sign-in failed.'}`;
            showErr(message);
            return;
          }
        }

        const message = `[${err.code || 'unknown'}] ${friendlyErr(err.code) || err.message || 'Something went wrong.'}`;
        showErr(message);
      }
    });
  }

  async function logout() {
    await auth.signOut();
    showToast('Signed out. See you soon! 👋');
  }

  function showErr(msg) { const el = document.getElementById('auth-err'); if(el){el.textContent=msg;el.classList.add('show');} }
  function clearErr()   { const el = document.getElementById('auth-err'); if(el){el.textContent='';el.classList.remove('show');} }
  function clearForm()  { ['auth-email','auth-password','auth-name'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';}); clearErr(); }

  function friendlyErr(code) {
    return {
      'auth/invalid-email':'Please enter a valid email.',
      'auth/user-not-found':'No account found.',
      'auth/wrong-password':'Incorrect password.',
      'auth/invalid-credential':'Invalid email or password.',
      'auth/email-already-in-use':'Email already in use.',
      'auth/weak-password':'Password must be 6+ characters.',
      'auth/too-many-requests':'Too many attempts. Try later.',
      'auth/unauthorized-domain':'This domain is not authorized in Firebase settings.',
      'auth/popup-blocked':'Popup blocked. Please allow popups or use redirect login.',
      'auth/operation-not-supported-in-this-environment':'This browser does not support popup login; redirect mode is used.',
      'auth/cancelled-popup-request':'Popup request was cancelled; trying redirect.',
      'auth/redirect-cancelled-by-user':'Redirect sign-in was cancelled.',
      'auth/user-disabled':'This user account has been disabled.'
    }[code] || 'Something went wrong.';
  }

  return { init, getUser, isLoggedIn, openModal, closeModal, logout, setupModal };
})();
window.Auth = Auth;



