async function authSignUp(email, password){
  const { data, error } = await sb.auth.signUp({ email, password });
  if(error) throw error;
  return data; // data.session is null when email confirmation is required
}

async function authSignIn(email, password){
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error) throw error;
  return data;
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
