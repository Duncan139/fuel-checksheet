/* Shared sign-in for the Fuel Quantity Checksheet and the Monthly Report.
 * Usage: const ctx = await FuelAuth.start({ requireEditor: false });
 * ctx = { client, user:{id,email}, isCrew, isEditor, offline }
 */
(function(){
  const SUPABASE_URL = 'https://ogtkccynaaavbbkacnjn.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_ckWPuUr5hasC2nPLuBtBUg_no-_TErd';
  const LAST_USER_KEY = 'fuelLastUser_v1';

  const client = (window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'fuel-checksheet-auth' }
      })
    : null;

  const css = `
  #fuelAuthOverlay{position:fixed;inset:0;background:#f2f2f2;z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:48px 16px;overflow:auto;}
  #fuelAuthOverlay .card{background:#fff;border:1px solid #333;border-radius:10px;padding:20px;width:100%;max-width:380px;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;}
  #fuelAuthOverlay h2{font-size:18px;margin:0 0 4px;}
  #fuelAuthOverlay p{font-size:13px;color:#555;margin:0 0 14px;line-height:1.4;}
  #fuelAuthOverlay label{display:block;font-size:12px;font-weight:600;color:#333;margin:10px 0 4px;}
  #fuelAuthOverlay input{width:100%;padding:11px;font-size:16px;border:1px solid #999;border-radius:7px;box-sizing:border-box;}
  #fuelAuthOverlay button.primary{width:100%;margin-top:16px;padding:13px;font-size:15px;font-weight:600;border:none;border-radius:8px;background:#1a5fb4;color:#fff;cursor:pointer;}
  #fuelAuthOverlay button.primary:disabled{background:#999;}
  #fuelAuthOverlay .links{display:flex;justify-content:space-between;gap:10px;margin-top:14px;flex-wrap:wrap;}
  #fuelAuthOverlay .links a{font-size:13px;color:#1a5fb4;cursor:pointer;text-decoration:underline;}
  #fuelAuthOverlay .msg{font-size:13px;margin-top:12px;min-height:1em;}
  #fuelAuthOverlay .msg.err{color:#a30000;}
  #fuelAuthOverlay .msg.ok{color:#0a6e0a;}
  .fuelUserBar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid #333;border-radius:8px;padding:7px 10px;margin-bottom:10px;font-size:12px;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;}
  .fuelUserBar .who{color:#333;}
  .fuelUserBar .sync{font-weight:600;}
  .fuelUserBar .sync.ok{color:#0a6e0a;}
  .fuelUserBar .sync.wait{color:#8a6300;}
  .fuelUserBar .sync.err{color:#a30000;}
  .fuelUserBar button{padding:6px 10px;font-size:12px;border:1px solid #999;border-radius:6px;background:#f5f5f5;cursor:pointer;}
  @media print{.fuelUserBar,#fuelAuthOverlay{display:none !important;}}
  `;

  function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstChild; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  let overlay = null;
  function showOverlay(inner){
    if(!overlay){
      const style=document.createElement('style'); style.textContent=css; document.head.appendChild(style);
      overlay = el('<div id="fuelAuthOverlay"><div class="card"></div></div>');
      document.body.appendChild(overlay);
    }
    overlay.style.display='flex';
    overlay.querySelector('.card').innerHTML = inner;
    return overlay.querySelector('.card');
  }
  function hideOverlay(){ if(overlay) overlay.style.display='none'; }

  async function roles(user){
    const email = (user.email||'').toLowerCase();
    let isEditor=false, isCrew=false;
    try{
      const ed = await client.from('editors').select('email').ilike('email', email).limit(1);
      isEditor = !!(ed.data && ed.data.length);
    }catch(e){}
    if(isEditor) isCrew = true;
    else {
      try{
        const cr = await client.from('fuel_crew').select('email').ilike('email', email).limit(1);
        isCrew = !!(cr.data && cr.data.length);
      }catch(e){}
    }
    return {isEditor, isCrew};
  }

  function signInForm(opts, resolve, mode, presetEmail, message){
    const titles = {
      signin:   ['Sign in', opts.title || 'Sign in with your work email to record refuels.'],
      signup:   ['Create your password', 'First time here? Use the email your base manager added to the crew list, and choose a password (at least 8 characters).'],
      forgot:   ['Reset password', "Enter your email and we'll send a link to set a new password."]
    };
    const [h, sub] = titles[mode];
    const card = showOverlay(`
      <h2>${h}</h2><p>${esc(sub)}</p>
      <form autocomplete="on">
        <label>Email<input type="email" name="email" autocomplete="username" required value="${esc(presetEmail||'')}"></label>
        ${mode!=='forgot' ? `<label>Password<input type="password" name="password" autocomplete="${mode==='signup'?'new-password':'current-password'}" required minlength="${mode==='signup'?8:1}"></label>` : ''}
        <button class="primary" type="submit">${mode==='signin'?'Sign in':mode==='signup'?'Create account':'Send reset link'}</button>
      </form>
      <div class="msg ${message&&message.err?'err':'ok'}">${esc(message?message.text:'')}</div>
      <div class="links">
        ${mode!=='signin' ? '<a data-go="signin">Back to sign in</a>' : '<a data-go="signup">First time? Create password</a><a data-go="forgot">Forgot password?</a>'}
      </div>`);
    const form = card.querySelector('form'), msg = card.querySelector('.msg'), btn = card.querySelector('button.primary');
    card.querySelectorAll('[data-go]').forEach(a=>a.addEventListener('click', ()=>signInForm(opts, resolve, a.dataset.go, form.email.value)));
    form.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const email = form.email.value.trim();
      const password = form.password ? form.password.value : '';
      btn.disabled = true; msg.className='msg'; msg.textContent='Please wait…';
      try{
        if(mode==='signin'){
          const { data, error } = await client.auth.signInWithPassword({ email, password });
          if(error) throw error;
          await finish(opts, resolve, data.user);
        } else if(mode==='signup'){
          const redirect = location.origin + location.pathname;
          const { data, error } = await client.auth.signUp({ email, password, options:{ emailRedirectTo: redirect } });
          if(error) throw error;
          // Supabase returns a placeholder (no identities) when the email already has an account
          if(data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0){
            throw new Error('already registered');
          }
          if(data.session){ await finish(opts, resolve, data.user); }
          else signInForm(opts, resolve, 'signin', email, {text:'Account created. Check your email for a confirmation link, then sign in here.'});
        } else {
          const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
          if(error) throw error;
          signInForm(opts, resolve, 'signin', email, {text:'If that email has an account, a reset link is on its way.'});
        }
      }catch(e){
        btn.disabled = false;
        msg.className='msg err';
        const m = (e && e.message) || 'Something went wrong.';
        msg.textContent = /invalid login/i.test(m) ? 'Email or password is incorrect.'
          : /signups? not allowed/i.test(m) ? 'New accounts are created by your base manager — ask them to set you up.'
          : /already (been )?registered|already exists/i.test(m) ? 'This email already has an account. Go back and sign in, or use "Forgot password?" to set a new one.'
          : /fetch|network/i.test(m) ? 'No connection. Connect to the internet to sign in.'
          : m;
      }
    });
  }

  function newPasswordForm(opts, resolve, user){
    const card = showOverlay(`
      <h2>Set a new password</h2><p>Choose a new password for ${esc(user.email)} (at least 8 characters).</p>
      <form><label>New password<input type="password" name="password" autocomplete="new-password" required minlength="8"></label>
      <button class="primary" type="submit">Save password</button></form><div class="msg"></div>`);
    const form = card.querySelector('form'), msg = card.querySelector('.msg');
    form.addEventListener('submit', async ev=>{
      ev.preventDefault();
      const { error } = await client.auth.updateUser({ password: form.password.value });
      if(error){ msg.className='msg err'; msg.textContent=error.message; return; }
      history.replaceState(null,'',location.pathname);
      await finish(opts, resolve, user);
    });
  }

  async function finish(opts, resolve, user){
    const r = await roles(user);
    try{ localStorage.setItem(LAST_USER_KEY, JSON.stringify({id:user.id, email:user.email, isCrew:r.isCrew, isEditor:r.isEditor})); }catch(e){}
    if(opts.requireEditor && !r.isEditor){
      const card = showOverlay(`<h2>Managers only</h2><p>The monthly report is limited to base managers. You're signed in as ${esc(user.email)}.</p>
        <button class="primary" type="button">Sign out</button>`);
      card.querySelector('button').addEventListener('click', signOut);
      return;
    }
    hideOverlay();
    resolve({ client, user:{id:user.id, email:user.email}, isCrew:r.isCrew, isEditor:r.isEditor, offline:false });
  }

  async function signOut(){
    if(!confirm('Sign out of the fuel checksheet on this device?')) return;
    try{ await client.auth.signOut(); }catch(e){}
    try{ localStorage.removeItem(LAST_USER_KEY); }catch(e){}
    location.replace(location.pathname);
  }

  function userBar(ctx, mountBefore){
    const bar = el(`<div class="fuelUserBar"><span class="who">Signed in as <b>${esc(ctx.user.email)}</b>${ctx.offline?' (offline)':''}</span>
      <span class="sync" id="fuelSyncStatus"></span><button type="button">Sign out</button></div>`);
    bar.querySelector('button').addEventListener('click', signOut);
    (mountBefore||document.body.firstChild).parentNode.insertBefore(bar, mountBefore||document.body.firstChild);
    return bar;
  }

  function start(opts){
    opts = opts || {};
    return new Promise(async resolve=>{
      if(!client){ showOverlay('<h2>Unable to load</h2><p>Connect to the internet and reload this page.</p>'); return; }
      showOverlay('<h2>Fuel Checksheet</h2><p>Checking sign-in…</p>');
      const isRecovery = /type=recovery/.test(location.hash) || /type=recovery/.test(location.search);
      let recoveryHandled = false;
      client.auth.onAuthStateChange((event, session)=>{
        if(event==='PASSWORD_RECOVERY' && session && !recoveryHandled){ recoveryHandled = true; newPasswordForm(opts, resolve, session.user); }
      });
      let session = null;
      try{ const res = await client.auth.getSession(); session = res.data && res.data.session; }catch(e){}
      if(recoveryHandled || (isRecovery && session)){ if(!recoveryHandled){ recoveryHandled=true; newPasswordForm(opts, resolve, session.user); } return; }
      if(session && navigator.onLine !== false){ await finish(opts, resolve, session.user); return; }
      // Offline with a remembered sign-in: let crew keep recording; entries sync once back online.
      let last = null; try{ last = JSON.parse(localStorage.getItem(LAST_USER_KEY)); }catch(e){}
      if(last && (session || navigator.onLine === false) && !opts.requireEditor){
        hideOverlay();
        resolve({ client, user:{id:last.id, email:last.email}, isCrew:last.isCrew, isEditor:last.isEditor, offline:true });
        return;
      }
      if(session){ await finish(opts, resolve, session.user); return; }
      signInForm(opts, resolve, 'signin', last ? last.email : '');
    });
  }

  window.FuelAuth = { start, userBar, signOut, client };
})();
