/* THE HEXAGON - login / sign up behaviour (Firebase, used by login.html and signup.html) */
(function () {
  'use strict';
  var page = document.body.getAttribute('data-page');          // 'login' or 'signup'
  var NAMES = { student: 'Student', faculty: 'Faculty', school: 'School Administration', admin: 'Admin' };

  var tabs = Array.prototype.slice.call(document.querySelectorAll('.role-tab'));
  var roleLabel = document.getElementById('auth-role');
  var switchLink = document.getElementById('switch-link');
  var form = document.getElementById('auth-form');
  var status = document.getElementById('auth-status');

  /* ---------- which role? comes from the link, e.g. login.html?role=faculty ---------- */
  var role = new URLSearchParams(window.location.search).get('role');
  if (!NAMES[role]) role = 'student';
  var available = tabs.map(function (t) { return t.getAttribute('data-role'); });
  if (available.indexOf(role) === -1) role = available[0];     // e.g. "admin" has no sign-up tab

  function setRole(r) {
    role = r;
    tabs.forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-role') === r); });
    if (roleLabel) roleLabel.textContent = NAMES[r];
    if (switchLink) {
      var other = page === 'login' ? 'signup.html' : 'login.html';
      switchLink.href = (page === 'login' && r === 'admin') ? 'login.html?role=admin' : other + '?role=' + r;
      if (page === 'login') switchLink.parentNode.style.visibility = (r === 'admin') ? 'hidden' : 'visible';
    }
    if (window.history && history.replaceState) history.replaceState(null, '', '?role=' + r);
    status.textContent = ''; status.className = 'auth-status';
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { setRole(t.getAttribute('data-role')); }); });
  setRole(role);

  /* ---------- show / hide password ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.pw-toggle'), function (btn) {
    btn.addEventListener('click', function () {
      var input = btn.parentNode.querySelector('input');
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
    });
  });

  /* ---------- helpers ---------- */
  function say(msg, bad) { status.textContent = msg; status.className = 'auth-status' + (bad ? ' err' : ''); }

  var submitBtn = form.querySelector('button[type="submit"]');
  var originalBtnText = submitBtn ? submitBtn.textContent : '';
  function busy(on) {
    if (submitBtn) { submitBtn.disabled = on; submitBtn.textContent = on ? 'Please wait…' : originalBtnText; }
  }

  function firebaseError(e) {
    var code = (e && e.code) || '';
    switch (code) {
      case 'auth/email-already-in-use':  return 'This email already has an account. Try logging in.';
      case 'auth/invalid-email':         return 'That email address does not look right.';
      case 'auth/weak-password':         return 'Password is too weak — use at least 6 characters.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':    return 'Wrong email or password.';
      case 'auth/too-many-requests':     return 'Too many attempts. Please wait a moment and try again.';
      case 'auth/network-request-failed':return 'Network problem. Check your connection and try again.';
      default: return (e && e.message) ? e.message.replace('Firebase: ', '') : 'Something went wrong. Please try again.';
    }
  }

  /* goes to the right page after login / signup (same rules as before) */
  function afterAuth(uid, email, userRole) {
    try {
      localStorage.setItem('hx_session', JSON.stringify({ role: userRole, email: email, uid: uid, t: Date.now() }));
    } catch (err) {}

    if (userRole === 'student') { window.location.href = 'student-dashboard.html'; return; }
    if (userRole === 'faculty') { window.location.href = 'teacher-profile.html'; return; }

    say('The ' + NAMES[userRole] + ' ' + (page === 'login' ? 'log in' : 'sign up') + ' service is not connected yet.', true);
    busy(false);
  }

  /* ---------- submit ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (typeof firebase === 'undefined') { say('Firebase is not loaded. Check firebase-config.js and the script tags.', true); return; }
    if (!form.checkValidity()) { form.reportValidity(); return; }

    if (page === 'signup' && form.password.value !== form.confirm.value) {
      say('The two passwords do not match.', true); return;
    }

    var auth = firebase.auth();
    var db = firebase.firestore();
    var email = form.elements.email.value.trim();
    var password = form.password.value;

    /* "Keep me signed in" checkbox: LOCAL = stays after browser closes, SESSION = until tab closes */
    var remember = form.elements.remember;
    var persistence = (remember && remember.checked)
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;

    say('Connecting…'); busy(true);

    auth.setPersistence(persistence).catch(function () {}).then(function () {

      /* ================= SIGN UP ================= */
      if (page === 'signup') {
        var nameEl = form.elements.namedItem('name') || form.elements.namedItem('fullname') || form.elements.namedItem('fullName');
        var name = nameEl ? nameEl.value.trim() : '';

        auth.createUserWithEmailAndPassword(email, password)
          .then(function (cred) {
            return db.collection('users').doc(cred.user.uid).set({
              name: name,
              email: email,
              role: role,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(function () { afterAuth(cred.user.uid, email, role); });
          })
          .catch(function (err) { say(firebaseError(err), true); busy(false); });
        return;
      }

      /* ================= LOG IN ================= */
      auth.signInWithEmailAndPassword(email, password)
        .then(function (cred) {
          return db.collection('users').doc(cred.user.uid).get().then(function (doc) {
            var savedRole = (doc.exists && NAMES[doc.data().role]) ? doc.data().role : role;
            afterAuth(cred.user.uid, cred.user.email || email, savedRole);
          });
        })
        .catch(function (err) { say(firebaseError(err), true); busy(false); });
    });
  });
})();