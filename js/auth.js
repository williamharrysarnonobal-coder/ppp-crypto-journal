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

// Login is by username — resolves it to the real email via a security-definer
// RPC (returns only the email string) before calling signInWithPassword.
async function authSignInWithUsername(username, password){
  const { data: email, error: lookupError } = await sb.rpc('get_email_for_username', { p_username: username });
  if(lookupError) throw lookupError;
  if(!email) throw new Error('No account found with that username.');
  return authSignIn(email, password);
}

async function authForgotPassword(username){
  const { data: email, error: lookupError } = await sb.rpc('get_email_for_username', { p_username: username });
  if(lookupError) throw lookupError;
  if(!email) throw new Error('No account found with that username.');
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
