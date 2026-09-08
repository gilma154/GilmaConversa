const $ = s => document.querySelector(s);
const app = $('#app');
let me = null, users = [], messages = [], groups = [], selectedUser = null, selectedGroup = null, view = 'chat';
let pollTimer = null, lastMessageId = '';

function avatar(u, cls='avatar') {
  if (!u) return `<div class="${cls}">?</div>`;
  return u.photo ? `<img class="${cls}" src="${u.photo}" alt="Foto">` : `<div class="${cls}">${escapeHtml((u.name || '?')[0])}</div>`;
}
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function fmtTime(t) { return new Date(t).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }
function currentTargetKey() { return selectedGroup ? `g:${selectedGroup.id}` : selectedUser ? `u:${selectedUser.id}` : ''; }

function auth() {
  app.innerHTML = `<div class="auth"><div class="auth-card"><div class="logo"><div class="logo-mark">💬</div><div class="brand">Gilma<span>Conversa</span></div></div><h1>Entrar</h1><p class="muted">Conversa com pessoas importantes para ti.</p><div id="err"></div><div class="field"><label>Nome de utilizador</label><input id="user" placeholder="ex.: gilmaro"></div><div class="field"><label>Palavra-passe</label><input id="pass" type="password"></div><button class="primary" id="login">Entrar</button><button class="link" id="goReg">Ainda não tens conta? Criar conta</button></div></div>`;
  $('#login').onclick = login;
  $('#goReg').onclick = register;
}

function register() {
  app.innerHTML = `<div class="auth"><div class="auth-card"><div class="logo"><div class="logo-mark">💬</div><div class="brand">Gilma<span>Conversa</span></div></div><h1>Criar conta</h1><p class="muted">A foto de perfil é obrigatória.</p><div id="err"></div><div class="field"><label>Nome completo</label><input id="name"></div><div class="field"><label>Nome de utilizador</label><input id="user"></div><div class="field"><label>Palavra-passe</label><input id="pass" type="password"></div><div class="field"><label>Foto de perfil</label><input id="photo" type="file" accept="image/*"></div><button class="primary" id="reg">Registar</button><button class="link" id="goLogin">Já tens conta? Entrar</button></div></div>`;
  $('#reg').onclick = doRegister;
  $('#goLogin').onclick = auth;
}

async function login() {
  try {
    const r = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:$('#user').value, password:$('#pass').value})});
    const d = await r.json();
    if (!r.ok) return $('#err').innerHTML = `<div class="error">${escapeHtml(d.error)}</div>`;
    me = d.user; await load();
  } catch { $('#err').innerHTML = `<div class="error">Não foi possível ligar ao servidor.</div>`; }
}

async function doRegister() {
  try {
    const f = new FormData();
    f.append('name', $('#name').value); f.append('username', $('#user').value); f.append('password', $('#pass').value);
    if ($('#photo').files[0]) f.append('photo', $('#photo').files[0]);
    const r = await fetch('/api/register', {method:'POST', body:f});
    const d = await r.json();
    if (!r.ok) return $('#err').innerHTML = `<div class="error">${escapeHtml(d.error)}</div>`;
    me = d.user; await load();
  } catch { $('#err').innerHTML = `<div class="error">Não foi possível criar a conta.</div>`; }
}

async function refreshData() {
  if (!me) return;
  try {
    const [uRes,mRes,gRes] = await Promise.all([fetch('/api/users'), fetch('/api/messages'), fetch('/api/groups')]);
    if (!uRes.ok || !mRes.ok || !gRes.ok) return;
    const newUsers = await uRes.json(); const newMessages = await mRes.json(); const newGroups = await gRes.json();
    const newestId = newMessages.length ? newMessages[newMessages.length-1].id : '';
    const changed = newMessages.length !== messages.length || newestId !== lastMessageId || newGroups.length !== groups.length;
    users = newUsers; messages = newMessages; groups = newGroups;
    if (newestId) lastMessageId = newestId;
    const freshSelected = selectedUser ? users.find(u => u.id === selectedUser.id) : null;
    const freshGroup = selectedGroup ? groups.find(g => g.id === selectedGroup.id) : null;
    if (freshSelected) selectedUser = freshSelected;
    if (freshGroup) selectedGroup = freshGroup;
    if (changed && $('#msgs')) fillMsgs(true);
    if ($('#list')) updateLists();
  } catch (e) { console.warn('Atualização interrompida:', e); }
}
function startRealtime() { if (pollTimer) clearInterval(pollTimer); pollTimer = setInterval(refreshData, 1000); }
async function load() {
  users = await (await fetch('/api/users')).json(); messages = await (await fetch('/api/messages')).json(); groups = await (await fetch('/api/groups')).json();
  if (messages.length) lastMessageId = messages[messages.length-1].id;
  render(); startRealtime();
}

function render() {
  app.innerHTML = `<div class="shell"><aside class="side"><div class="brand">Gilma<span>Conversa</span></div><div class="profile">${avatar(me)}<div><b>${escapeHtml(me.name)}</b><small>Online</small></div></div><div class="nav"><button data-view="chat">💬 <span>Conversas</span></button><button data-view="groups">👥 <span>Grupos</span></button>${me.role==='admin'?'<button data-view="admin">⚙️ <span>Administração</span></button>':''}</div><button class="logout" id="logout">↪ <span>Sair</span></button></aside><main class="main"><header class="top"><div><b id="viewTitle">Conversas</b><div class="muted">Conectando pessoas, aproximando histórias.</div></div></header><section class="content" id="content"></section></main></div>`;
  document.querySelectorAll('.nav button[data-view]').forEach(btn => btn.onclick = () => show(btn.dataset.view));
  $('#logout').onclick = logout;
  show(view);
}
function logout() { if (pollTimer) clearInterval(pollTimer); pollTimer=null; me=null; users=[]; messages=[]; groups=[]; selectedUser=null; selectedGroup=null; view='chat'; auth(); }

function show(v) {
  view=v; document.querySelectorAll('.nav button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view===v));
  $('#viewTitle').textContent = v==='chat' ? 'Conversas' : v==='groups' ? 'Grupos' : 'Painel de Administração';
  if(v==='admin') return admin($('#content'));
  if(v==='groups') return groupHome($('#content'));
  chat($('#content'));
}

function chat(c) {
  if (!selectedUser && !selectedGroup) {
    const list = users.filter(u => u.id !== me.id); if (list[0]) selectedUser = list[0];
  }
  c.innerHTML = `<div class="chat"><div class="contacts"><div class="search-row"><input id="search" placeholder="Pesquisar conversas..."><button title="Nova conversa" onclick="newConversation()">＋</button></div><div class="section-label">Pessoas</div><div id="list"></div><div class="section-label">Grupos</div><div id="groupMiniList"></div></div><div class="conversation">${chatHeader()}<div class="messages" id="msgs"></div><div id="filePreview"></div><div class="composer"><input id="text" placeholder="Digite uma mensagem..." onkeydown="if(event.key==='Enter')send()"><label class="attach" title="Foto ou vídeo">📎<input id="file" type="file" accept="image/*,video/*"></label><button class="send" onclick="send()">➤</button></div></div></div>`;
  $('#search').oninput = updateLists; $('#file').onchange = previewFile;
  updateLists(); fillMsgs();
}
function chatHeader() {
  const title = selectedGroup ? selectedGroup.name : selectedUser?.name || 'Escolhe uma conversa';
  const photo = selectedGroup ? `<div class="avatar group-avatar">👥</div>` : avatar(selectedUser);
  const sub = selectedGroup ? `${selectedGroup.members.length} membro(s)` : 'Online • atualização automática';
  return `<div class="chat-head">${photo}<div><b>${escapeHtml(title)}</b><div class="muted">${escapeHtml(sub)}</div></div></div>`;
}
function newConversation(){ selectedGroup=null; const first=users.find(u=>u.id!==me.id); selectedUser=first||null; chat($('#content')); }
function updateLists() {
  if(!$('#list')) return;
  const q = ($('#search')?.value||'').toLowerCase();
  const personList = users.filter(u => u.id!==me.id && u.name.toLowerCase().includes(q));
  $('#list').innerHTML = personList.map(u => {
    const last=[...messages].reverse().find(m => !m.groupId && ((m.from===me.id&&m.to===u.id)||(m.from===u.id&&m.to===me.id)));
    return `<div class="contact ${selectedUser?.id===u.id&&!selectedGroup?'selected':''}" onclick="selectUser('${u.id}')">${avatar(u)}<div><b>${escapeHtml(u.name)}</b><div class="muted">${last ? escapeHtml(last.text || (last.fileType==='image'?'📷 Foto':last.fileType==='video'?'🎥 Vídeo':'📎 Ficheiro')) : '@'+escapeHtml(u.username)}</div></div></div>`;
  }).join('') || '<p class="muted">Nenhuma pessoa encontrada.</p>';
  $('#groupMiniList').innerHTML = groups.filter(g=>g.members.includes(me.id) && g.name.toLowerCase().includes(q)).map(g=>`<div class="contact ${selectedGroup?.id===g.id?'selected':''}" onclick="selectGroup('${g.id}')"><div class="avatar group-avatar">👥</div><div><b>${escapeHtml(g.name)}</b><div class="muted">${g.members.length} membro(s)</div></div></div>`).join('') || '<p class="muted">Nenhum grupo.</p>';
}
function selectUser(id){ selectedUser=users.find(u=>u.id===id)||null; selectedGroup=null; chat($('#content')); }
function selectGroup(id){ selectedGroup=groups.find(g=>g.id===id)||null; selectedUser=null; chat($('#content')); }
function previewFile(){ const f=$('#file').files[0]; const p=$('#filePreview'); if(!f){p.innerHTML='';return;} p.innerHTML=`<div class="file-chip">${f.type.startsWith('image/')?'📷':'🎥'} ${escapeHtml(f.name)} <button onclick="clearFile()">×</button></div>`; }
function clearFile(){ $('#file').value=''; $('#filePreview').innerHTML=''; }

function mediaHtml(m){
  if(!m.file) return '';
  if(m.fileType==='image') return `<img class="chat-media image-media" src="${m.file}" alt="Foto enviada" onclick="window.open('${m.file}','_blank')">`;
  if(m.fileType==='video') return `<video class="chat-media" src="${m.file}" controls preload="metadata"></video>`;
  return `<a class="file-link" href="${m.file}" target="_blank">📎 ${escapeHtml(m.fileName||'Abrir ficheiro')}</a>`;
}
function fillMsgs(scrollToBottom=false){
  const box=$('#msgs'); if(!box) return;
  const a=messages.filter(m => selectedGroup ? m.groupId===selectedGroup.id : !m.groupId && ((m.from===me.id&&m.to===selectedUser?.id)||(m.from===selectedUser?.id&&m.to===me.id)));
  box.innerHTML=a.map(m=>`<div class="bubble ${m.from===me.id?'me':''}">${m.text?`<div>${escapeHtml(m.text)}</div>`:''}${mediaHtml(m)}<div class="muted bubble-time">${fmtTime(m.time)}</div></div>`).join('') || '<p class="muted">Começa a conversa.</p>';
  if(scrollToBottom) box.scrollTop=box.scrollHeight;
}
async function send(){
  const t=$('#text').value.trim(), f=$('#file').files[0];
  if((!t&&!f)||(!selectedUser&&!selectedGroup)) return;
  const fd=new FormData(); fd.append('from',me.id); fd.append('text',t);
  if(selectedGroup) fd.append('groupId',selectedGroup.id); else fd.append('to',selectedUser.id);
  if(f) fd.append('file',f);
  const r=await fetch('/api/messages',{method:'POST',body:fd}); const d=await r.json();
  if(!r.ok) return alert(d.error||'Não foi possível enviar.');
  messages.push(d); lastMessageId=d.id; $('#text').value=''; clearFile(); fillMsgs(true); updateLists();
}

function groupHome(c){
  const myGroups=groups.filter(g=>g.members.includes(me.id));
  c.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Grupos</h2><p class="muted">Cria grupos para família, colegas e amigos.</p></div><button class="primary small" onclick="openCreateGroup()">＋ Criar grupo</button></div><div id="groupsList" class="group-grid">${myGroups.map(g=>`<div class="group-card" onclick="selectedGroup=groups.find(x=>x.id==='${g.id}');selectedUser=null;show('chat')"><div class="avatar group-big">👥</div><div><b>${escapeHtml(g.name)}</b><div class="muted">${g.members.length} membro(s)</div></div></div>`).join('')||'<p class="muted">Ainda não tens grupos.</p>'}</div></div>`;
}
function openCreateGroup(){
  const others=users.filter(u=>u.id!==me.id);
  $('#content').innerHTML=`<div class="panel"><h2>Novo grupo</h2><div class="field"><label>Nome do grupo</label><input id="gname" placeholder="Ex.: Família"></div><label class="section-label">Adicionar pessoas</label><div class="member-picker">${others.map(u=>`<label class="member-option"><input type="checkbox" value="${u.id}"><span>${avatar(u,'mini-avatar')}</span><span>${escapeHtml(u.name)}</span></label>`).join('')||'<p class="muted">Ainda não existem outras pessoas.</p>'}</div><div class="actions"><button class="link-btn" onclick="show('groups')">Cancelar</button><button class="primary small" onclick="createGroup()">Criar grupo</button></div></div>`;
}
async function createGroup(){
  const name=$('#gname').value.trim(); if(!name) return alert('Indica o nome do grupo.');
  const members=[...document.querySelectorAll('.member-option input:checked')].map(i=>i.value);
  const r=await fetch('/api/groups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,creator:me.id,members})});
  const d=await r.json(); if(!r.ok) return alert(d.error||'Não foi possível criar o grupo.');
  groups.push(d); selectedGroup=d; selectedUser=null; show('chat');
}

async function admin(c){
  const s=await (await fetch('/api/admin/stats')).json();
  c.innerHTML=`<div class="grid"><div class="stat">Utilizadores<b>${s.users}</b></div><div class="stat">Grupos<b>${s.groups}</b></div><div class="stat">Mensagens<b>${s.messages}</b></div><div class="stat">Multimédia<b>${s.media}</b></div></div><div class="panel"><h2>Painel de Administração</h2><p class="muted">Conta de administrador: <b>admin</b></p><p>O administrador pode acompanhar o crescimento da rede, os grupos e o volume de mensagens e multimédia.</p></div>`;
}

auth();
