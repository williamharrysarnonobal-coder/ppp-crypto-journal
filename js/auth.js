async function authSignUp(email, password, metadata){
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: metadata || {} } });
  if(error) throw error;
  return data; // data.session is null when email confirmation is required
}

async function authSignIn(email, password){
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error) throw error;
  return data;
}

// Login is by username — resolved to the real email via a security-definer
// RPC (returns only the email string) before calling signInWithPassword.
// An email address is accepted too: the username lives in a profile row that
// can be edited or lost, while the email is the account's real identity and
// can never drift out of sync. Without this, losing the username locks the
// account out entirely.
function _looksLikeEmail(s){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || '').trim());
}

async function _resolveLoginEmail(identifier){
  const id = (identifier || '').trim();
  if(_looksLikeEmail(id)) return id;
  const { data: email, error } = await sb.rpc('get_email_for_username', { p_username: id });
  if(error) throw error;
  return email || null;
}

async function authSignInWithUsername(username, password){
  const email = await _resolveLoginEmail(username);
  if(!email) throw new Error('No account found with that username. Try your email address instead.');
  return authSignIn(email, password);
}

async function authForgotPassword(username){
  const email = await _resolveLoginEmail(username);
  if(!email) throw new Error('No account found with that username. Try your email address instead.');
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname.replace(/forgot-password\.html$/, 'reset-password.html')
  });
  if(error) throw error;
}

async function authUpdatePassword(newPassword){
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if(error) throw error;
}

async function authSignOut(){
  await sb.auth.signOut();
  window.location.href = "login.html";
}

function confirmLogout(){
  const modal = document.getElementById('logoutConfirmModal');
  if(modal){
    modal.classList.add('open');
  }else if(confirm("Log out of your trading journal?")){
    authSignOut();
  }
}

function closeLogoutConfirm(){
  const modal = document.getElementById('logoutConfirmModal');
  if(modal) modal.classList.remove('open');
}

async function requireSession(){
  const { data: { session } } = await sb.auth.getSession();
  if(!session){
    window.location.href = "login.html";
    return null;
  }
  return session;
}

async function redirectIfLoggedIn(target){
  const { data: { session } } = await sb.auth.getSession();
  if(session) window.location.href = target;
}
