// ========================================
// 常伴 - 前端 App
// ========================================

const API = '';
let currentCharId = null;
let currentAudio = null;
let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;

// ===== 认证 =====
let currentUser = null;

function getToken() { return localStorage.getItem('auth_token'); }

async function checkAuth() {
  var token = getToken();
  if (!token) { showLogin(); return false; }
  try {
    var res = await fetch('/api/auth/me', { headers: { 'x-auth-token': token } });
    if (!res.ok) throw new Error();
    var data = await res.json();
    currentUser = data.user;
    hideLogin();
    updateVerifyStatus();
    await checkNotice();
    return true;
  } catch(e) {
    localStorage.removeItem('auth_token');
    showLogin();
    return false;
  }
}

function showLogin() {
  document.getElementById('page-login').classList.add('active');
  document.getElementById('header').style.display = 'none';
  document.querySelectorAll('.page:not(#page-login)').forEach(function(p) { p.classList.remove('active'); });
}

function hideLogin() {
  document.getElementById('page-login').classList.remove('active');
  document.getElementById('header').style.display = 'flex';
  navigate('home');
}

async function doLogin(e) {
  e.preventDefault();
  var username = document.getElementById('loginUser').value.trim();
  var password = document.getElementById('loginPass').value;
  document.getElementById('loginError').textContent = '';
  try {
    var res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('auth_token', data.token);
    currentUser = data.user;
    hideLogin();
    await checkNotice();
  } catch (err) {
    document.getElementById('loginError').textContent = err.message;
  }
}

async function initAuth() {
  var res = await fetch('/api/auth/status');
  var data = await res.json();
  if (!data.hasUsers) {
    // 首次使用，跳转手机号注册
    window.location.href = '/phone-auth.html';
  }
}

// ===== 页面导航 =====
function navigate(page, param) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  var el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');

  document.getElementById('backBtn').style.display = page === 'home' ? 'none' : 'block';

  var titles = {
    home: '\uD83D\uDD4A\uFE0F \u5E38\u4F34',
    create: '\u2728 \u521B\u5EFA\u89D2\u8272',
    edit: '\u270F\uFE0F \u7F16\u8F91\u89D2\u8272',
    chat: '\uD83D\uDCAC \u5BF9\u8BDD',
    settings: '\u2699\uFE0F \u8BBE\u7F6E',
  };
  document.getElementById('headerTitle').textContent = titles[page] || '\u5E38\u4F34';

  if (page === 'home') loadCharacters();
  if (page === 'edit' && param) loadEditForm(param);
  if (page === 'settings') loadAdminReports();
  if (page === 'chat' && param) { startChat(param); startUsageReminder(); }
  else stopUsageReminder();
}

// ===== 合规：连续使用提醒（30 分钟首次，之后每小时） =====
let usageTimer = null;
let usageRounds = 0;
function startUsageReminder() {
  stopUsageReminder();
  usageRounds = 0;
  var showOnce = function() {
    usageRounds++;
    var label = usageRounds === 1 ? '30 分钟' : '很久';
    var r = document.createElement('div');
    r.className = 'usage-reminder';
    r.innerHTML = '🕯️ 不知不觉已经聊了 ' + label + ' 了。<br>TA 会一直在这里等你，注意休息，保重身体。<br><button onclick="this.parentElement.remove()">知道了</button>';
    document.body.appendChild(r);
    usageTimer = setTimeout(showOnce, 60 * 60 * 1000);
  };
  usageTimer = setTimeout(showOnce, 30 * 60 * 1000);
}
function stopUsageReminder() {
  if (usageTimer) { clearTimeout(usageTimer); usageTimer = null; }
  var r = document.querySelector('.usage-reminder');
  if (r) r.remove();
}

// ===== Toast =====
function toast(msg) {
  var t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.remove(); }, 2500);
}

// ===== API =====
async function api(path, opts) {
  if (!opts) opts = {};
  var token = getToken();
  if (!token) throw new Error('\u8BF7\u5148\u767B\u5F55');

  var headers = opts.headers || {};
  headers['x-auth-token'] = token;

  var provider = localStorage.getItem('llm_provider') || 'deepseek';
  var model = localStorage.getItem('llm_model') || '';
  var customBaseURL = localStorage.getItem('llm_custom_baseurl') || '';
  headers['x-llm-provider'] = provider;
  if (model) headers['x-llm-model'] = model;
  if (provider === 'custom' && customBaseURL) headers['x-llm-baseurl'] = customBaseURL;

  var res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...headers },
    ...opts,
  });
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || '\u8BF7\u6C42\u5931\u8D25');
  return data;
}

// ===== 首页：角色列表 =====
// 打开角色：首次走初见仪式，之后直进对话
function openCharacter(id) {
  let seen = false;
  try { seen = !!localStorage.getItem('ritual_seen_' + id); } catch (e) {}
  if (seen || typeof startMeetingRitual !== 'function') navigate('chat', id);
  else startMeetingRitual(id);
}

async function loadCharacters() {
  var list = document.getElementById('charList');
  try {
    var chars = await api('/api/characters');
    if (chars.length === 0) {
      list.innerHTML = '<div class=\"empty-state\"><div class=\"emoji\">\uD83D\uDD4A\uFE0F</div><p>\u8FD8\u6CA1\u6709\u89D2\u8272<br>\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u521B\u5EFA\u7B2C\u4E00\u4E2A</p></div>';
      return;
    }
    list.innerHTML = chars.map(function(c) {
      return '<div class=\"char-card\" onclick=\"openCharacter(\'' + c.id + '\')\">' +
        (c.hasAvatar ? '<img src=\"/api/avatar/' + c.id + '\" class=\"char-card-avatar\" onerror=\"this.style.display=\'none\'\">' : '<div class=\"char-card-avatar placeholder\">\uD83D\uDD4A\uFE0F</div>') +
        '<div class=\"char-card-info\"><h3>' + c.name + ' <span class=\"ai-tag\">AI</span></h3><p>' + (c.relationship || '') + '</p>' +
        '<div class=\"mem-progress\"><div class=\"mem-fill\" style=\"width:' + (c.completeness || 0) + '%\"></div></div>' +
        '<div class=\"mem-label\">🕯️ 回忆完整度 ' + (c.completeness || 0) + '% · ' + (c.memoryPoints || 0) + ' 记忆点</div></div>' +
        '<span class=\"char-card-arrow\" onclick=\"event.stopPropagation();navigate(\'edit\',\'' + c.id + '\')\">\u270F\uFE0F</span></div>';
    }).join('');
  } catch (err) {
    list.innerHTML = '<div class=\"empty-state\"><p>\u26A0\uFE0F ' + err.message + '</p></div>';
  }
}

// ===== 创建角色 =====
async function saveCharacter(e) {
  e.preventDefault();
  var name = document.getElementById('charName').value.trim();
  if (!name) return toast('\u8BF7\u586B\u5199\u79F0\u547C');
  var consent = document.getElementById('charConsent');
  if (consent && !consent.checked) return toast('\u8BF7\u5148\u786E\u8BA4\u6388\u6743\u58F0\u660E');
  try {
    await api('/api/characters', {
      method: 'POST',
      body: JSON.stringify({
        name: name,
        relationship: document.getElementById('charRelation').value.trim(),
        personality: document.getElementById('charPersonality').value.trim(),
        memories: document.getElementById('charMemories').value.trim(),
        dialect: document.getElementById('charDialect').value,
        consent: !!(consent && consent.checked),
      }),
    });
    toast('\u2728 \u89D2\u8272\u521B\u5EFA\u6210\u529F');
    e.target.reset();
    navigate('home');
  } catch (err) {
    toast('\u274C ' + err.message);
    if (err.message.indexOf('实名') !== -1) navigate('settings');
  }
}

// ===== 合规：已登录用户补实名认证 =====
function updateVerifyStatus() {
  var el = document.getElementById('verifyStatus');
  if (!el) return;
  if (currentUser && currentUser.verified) {
    el.textContent = '✅ 已实名' + (currentUser.realName ? '（' + currentUser.realName + '）' : '');
  } else {
    el.textContent = '未实名：创建角色与克隆声音需要先完成实名认证';
  }
}

async function verifyIdMe() {
  var rn = document.getElementById('verifyRealName').value.trim();
  var id = document.getElementById('verifyIdcard').value.trim();
  if (rn.length < 2) return toast('❌ 请填写真实姓名');
  if (!id) return toast('❌ 请填写身份证号');
  try {
    var res = await fetch('/api/auth/verify-id/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': getToken() },
      body: JSON.stringify({ realName: rn, idcard: id }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    document.getElementById('verifyStatus').textContent = '✅ 已实名';
    toast('✅ 实名认证通过');
  } catch (err) { toast('❌ ' + err.message); }
}

// ===== 编辑角色 =====
async function loadEditForm(id) {
  currentCharId = id;
  document.getElementById('cloneBtn').style.display = 'none';
  document.getElementById('segmentArea').style.display = 'none';
  try {
    var char = await api('/api/characters/' + id);
    document.getElementById('editId').value = id;
    document.getElementById('editName').value = char.name || '';
    document.getElementById('editRelation').value = char.relationship || '';
    document.getElementById('editPersonality').value = char.personality || '';
    document.getElementById('editMemories').value = char.memories || '';
    document.getElementById('editDialect').value = char.dialect || '';
    var av = document.getElementById('editAvatar');
    if (char.avatar) { av.src = char.avatar; av.style.display = 'block'; }
    else { av.style.display = 'none'; }
    document.getElementById('voiceStatus').textContent = char.voiceId ? '\u2705 \u5DF2\u8BBE\u7F6E\u58F0\u97F3' : '\u672A\u8BBE\u7F6E\u58F0\u97F3';
    document.getElementById('meetingRitualBtn').onclick = function() { startMeetingRitual(id); };
    document.getElementById('farewellRitualBtn').onclick = function() { startFarewellRitual(id); };
  } catch (err) { toast('\u274C ' + err.message); navigate('home'); }
}

async function updateCharacter(e) {
  e.preventDefault();
  var id = document.getElementById('editId').value;
  try {
    await api('/api/characters/' + id, {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('editName').value.trim(),
        relationship: document.getElementById('editRelation').value.trim(),
        personality: document.getElementById('editPersonality').value.trim(),
        memories: document.getElementById('editMemories').value.trim(),
        dialect: document.getElementById('editDialect').value,
      }),
    });
    toast('\u2705 \u5DF2\u4FDD\u5B58');
    navigate('home');
  } catch (err) { toast('\u274C ' + err.message); }
}

async function deleteCharacter() {
  var id = document.getElementById('editId').value;
  if (!confirm('确定删除？云端克隆声音将同步删除，不可恢复。')) return;
  try {
    var data = await api('/api/characters/' + id, { method: 'DELETE' });
    toast(data.cloudVoiceDeleted === false ? '⚠️ 角色已删除，但云端声音删除失败，请联系客服' : '✅ 角色及云端声音已删除');
    navigate('home');
  }
  catch (err) { toast('\u274C ' + err.message); }
}

async function uploadAvatar(e) {
  var file = e.target.files[0];
  if (!file) return;
  var id = document.getElementById('editId').value;
  var fd = new FormData(); fd.append('avatar', file);
  try {
    var res = await fetch('/api/avatar/' + id + '?auth=' + encodeURIComponent(getToken() || ''), {
      method: 'POST',
      headers: { 'x-auth-token': getToken() },
      body: fd,
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    var av = document.getElementById('editAvatar');
    av.src = data.avatar; av.style.display = 'block';
    toast('\u2705 \u5934\u50CF\u5DF2\u66F4\u65B0');
  } catch (err) { toast('\u274C ' + err.message); }
}

// ===== 声音克隆 =====
let cloneRecordedBlob = null;
let cloneMediaRecorder = null;
let cloneChunks = [];
let cloneTimer = null;

function onVoiceFileSelected(e) {
  var file = e.target.files[0];
  if (!file) return;
  var box = document.getElementById('voiceUploadBox');
  var text = document.getElementById('voiceFileName');
  box.classList.add('has-file');
  text.textContent = '\u2705 ' + file.name;

  var videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm'];
  var ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  var cloneBtn = document.getElementById('cloneBtn');

  if (videoExts.includes(ext)) {
    uploadAndSplit(file);
    cloneBtn.style.display = 'none';
  } else {
    document.getElementById('segmentArea').style.display = 'none';
    cloneBtn.style.display = 'block';
  }
}

async function uploadAndSplit(file) {
  var id = document.getElementById('editId').value;
  var status = document.getElementById('voiceStatus');
  status.textContent = '\u23F3 \u6B63\u5728\u5206\u5272\u89C6\u9891...';
  var fd = new FormData(); fd.append('video', file);
  try {
    var res = await fetch('/api/voices/split/' + id + '?auth=' + encodeURIComponent(getToken() || ''), {
      method: 'POST',
      headers: { 'x-auth-token': getToken() },
      body: fd,
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || '分割失败');
    status.textContent = '\u2705 \u5DF2\u5206\u5272\u4E3A ' + data.segments.length + ' \u4E2A\u7247\u6BB5';
    var area = document.getElementById('segmentArea');
    var list = document.getElementById('segmentList');
    area.style.display = 'block';
    list.innerHTML = data.segments.map(function(seg, i) {
      return '<div class=\"segment-item\" style=\"display:flex;align-items:center;gap:8px;padding:8px;margin:4px 0;background:#1a1a2e;border-radius:8px;border:1px solid #334155\">' +
        '<span style=\"flex:1;font-size:13px\">' + seg.label + '</span>' +
        '<button class=\"btn-secondary\" style=\"padding:6px 12px;font-size:12px\" onclick=\"playSegment(\'' + seg.file + '\')\">\u25B6\uFE0F \u8BD5\u542C</button>' +
        '<button class=\"btn-primary\" style=\"padding:6px 12px;font-size:12px\" onclick=\"cloneSegment(' + i + ')\">\uD83C\uDFA4 \u514B\u9686</button></div>';
    }).join('');
  } catch (err) { status.textContent = '\u274C ' + err.message; }
}

function playSegment(url) { var a = new Audio(url); a.play().catch(function() {}); }

async function cloneSegment(index) {
  if (!voiceConsentGiven) return ensureVoiceConsent(function() { cloneSegment(index); });
  var id = document.getElementById('editId').value;
  var status = document.getElementById('voiceStatus');
  status.textContent = '\u23F3 \u6B63\u5728\u514B\u9686\u58F0\u97F3...';
  try {
    var res = await fetch('/api/voices/clone/' + id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': getToken() },
      body: JSON.stringify({ name: document.getElementById('editName').value || '\u6211\u7684\u4EB2\u4EBA', segmentIndex: index, voiceConsent: true }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    status.textContent = '\u2705 \u58F0\u97F3\u514B\u9686\u6210\u529F\uFF01';
    document.getElementById('segmentArea').style.display = 'none';
    toast('\uD83C\uDFA4 \u58F0\u97F3\u5DF2\u514B\u9686\uFF0C\u53EF\u4EE5\u5BF9\u8BDD\u4E86\uFF01');
  } catch (err) { status.textContent = '\u274C ' + err.message; }
}

function startCloneRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { return toast('\u60A8\u7684\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u5F55\u97F3'); }
  var btn = document.getElementById('recordVoiceBtn');
  if (btn.classList.contains('recording')) { if (cloneMediaRecorder && cloneMediaRecorder.state !== 'inactive') cloneMediaRecorder.stop(); return; }
  var overlay = document.createElement('div');
  overlay.className = 'recording-overlay';
  overlay.innerHTML = '<div class=\"recording-card\"><div class=\"mic-icon\">\uD83C\uDF99\uFE0F</div><div class=\"timer\" id=\"cloneRecTimer\">0:00</div><p style=\"color:var(--text-dim);margin-bottom:16px\">\u5F55\u5236\u4EB2\u4EBA\u7684\u58F0\u97F3...</p><button class=\"stop-btn\" onclick=\"stopCloneRecording()\">\u23F9\uFE0F \u505C\u6B62\u5F55\u5236</button></div>';
  overlay.id = 'cloneRecOverlay';
  document.body.appendChild(overlay);
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    cloneChunks = []; cloneRecordedBlob = null;
    cloneMediaRecorder = new MediaRecorder(stream);
    cloneMediaRecorder.ondataavailable = function(e) { cloneChunks.push(e.data); };
    cloneMediaRecorder.onstop = function() {
      document.getElementById('cloneRecOverlay').remove();
      stream.getTracks().forEach(function(t) { t.stop(); });
      cloneRecordedBlob = new Blob(cloneChunks, { type: 'audio/webm' });
      btn.classList.remove('recording');
      btn.textContent = '\uD83C\uDF99\uFE0F \u5DF2\u5F55\u5236 \u2713';
      toast('\u2705 \u5F55\u5236\u5B8C\u6210');
    };
    cloneMediaRecorder.start();
    btn.classList.add('recording');
    btn.textContent = '\u23F9\uFE0F \u505C\u6B62';
    var secs = 0;
    document.getElementById('cloneRecTimer').textContent = '0:00';
    cloneTimer = setInterval(function() {
      secs++;
      var m = Math.floor(secs / 60);
      var s = secs % 60;
      document.getElementById('cloneRecTimer').textContent = m + ':' + (s < 10 ? '0' : '') + s;
      if (secs >= 30) { stopCloneRecording(); toast('\u5F55\u97F3\u5DF2\u8FBE\u4E0A\u9650'); }
    }, 1000);
  }).catch(function() { document.getElementById('cloneRecOverlay').remove(); toast('\u65E0\u6CD5\u8BBF\u95EE\u9EA6\u514B\u98CE'); });
}

function stopCloneRecording() { clearInterval(cloneTimer); if (cloneMediaRecorder && cloneMediaRecorder.state !== 'inactive') cloneMediaRecorder.stop(); }

function onVoiceFileSelectedOld(e) {
  var file = e.target.files[0]; if (!file) return;
  var box = document.getElementById('voiceUploadBox');
  document.getElementById('voiceFileName').textContent = '\u2705 ' + file.name;
  box.classList.add('has-file');
}

async function cloneVoice() {
  if (!voiceConsentGiven) return ensureVoiceConsent(cloneVoice);
  var file = document.getElementById('voiceSample').files[0];
  var id = document.getElementById('editId').value;
  if (!id) return toast('\u8BF7\u5148\u4FDD\u5B58\u89D2\u8272\u4FE1\u606F');
  var status = document.getElementById('voiceStatus');
  if (!file && cloneRecordedBlob) file = new File([cloneRecordedBlob], 'recording.webm', { type: 'audio/webm' });
  if (!file) return toast('\u8BF7\u9009\u62E9\u97F3\u9891\u6587\u4EF6\u6216\u5F55\u5236\u58F0\u97F3');
  status.textContent = '\u23F3 \u6B63\u5728\u514B\u9686\u58F0\u97F3\uFF08\u7EA7 10-20 \u79D2\uFF09...';
  var fd = new FormData();
  fd.append('name', document.getElementById('editName').value || '\u6211\u7684\u4EB2\u4EBA');
  fd.append('audio', file);
  fd.append('voiceConsent', 'true');
  try {
    var res = await fetch('/api/voices/clone/' + id, { method: 'POST', headers: { 'x-auth-token': getToken() }, body: fd });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    status.textContent = '\u2705 \u58F0\u97F3\u514B\u9686\u6210\u529F\uFF01';
    toast('\uD83C\uDFA4 \u58F0\u97F3\u5DF2\u514B\u9686\uFF0C\u53EF\u4EE5\u5BF9\u8BDD\u4E86\uFF01');
  } catch (err) { status.textContent = '\u274C ' + err.message; toast('\u274C ' + err.message); }
}

// ===== 对话 =====
let currentCharData = null;

async function startChat(characterId) {
  currentCharId = characterId;
  try {
    currentCharData = await api('/api/characters/' + characterId);
    document.getElementById('chatName').textContent = currentCharData.name;
    document.getElementById('chatRelation').textContent = currentCharData.relationship || '';
    var av = document.getElementById('chatAvatar');
    if (currentCharData.avatar) { av.src = currentCharData.avatar; av.className = 'chat-avatar'; }
    else { av.src = ''; av.className = 'chat-avatar placeholder'; av.textContent = '\uD83D\uDD4A\uFE0F'; }
    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('chatInput').value = '';
    document.getElementById('chatInput').focus();
    applyFontSize();
    updateAutoVoiceBtn();
  } catch (err) { toast('\u274C \u52A0\u8F7D\u89D2\u8272\u5931\u8D25'); navigate('home'); }
}

async function sendMessage() {
  var input = document.getElementById('chatInput');
  var text = input.value.trim();
  if (!text || !currentCharId) return;
  input.value = '';
  addMessage('user', text);
  var msgs = document.getElementById('chatMessages');
  var typing = document.createElement('div');
  typing.className = 'typing';
  typing.id = 'typing-indicator';
  typing.innerHTML = '<span></span><span></span><span></span>';
  msgs.appendChild(typing);
  msgs.scrollTop = msgs.scrollHeight;
  try {
    var res = await api('/api/chat/' + currentCharId, { method: 'POST', body: JSON.stringify({ message: text }) });
    document.getElementById('typing-indicator').remove();
    addMessage('ai', res.reply, res.audioUrl || null, res.crisis || false);
  } catch (err) { document.getElementById('typing-indicator').remove(); toast('\u274C ' + err.message); }
}

function addMessage(role, text, audioUrl, isCrisis) {
  var msgs = document.getElementById('chatMessages');
  if (isCrisis) {
    var banner = document.createElement('div');
    banner.className = 'crisis-banner';
    banner.innerHTML = '<strong>⚠️ 温馨提醒</strong><br>如果你正经历强烈的痛苦，请不要独自承受。下方有 24 小时心理援助热线，随时可以拨打。';
    msgs.appendChild(banner);
  }
  var wrapper = document.createElement('div');
  wrapper.className = 'msg-row ' + role;
  var time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  var avatarDiv = document.createElement('div');
  avatarDiv.className = 'msg-avatar';
  if (role === 'ai' && currentCharData) {
    if (currentCharData.avatar) { avatarDiv.innerHTML = '<img src=\"' + currentCharData.avatar + '\" class=\"msg-avatar-img\" onerror=\"this.style.display=\'none\'\">'; }
    else { avatarDiv.innerHTML = '<div class=\"msg-avatar-placeholder\">\uD83D\uDD4A\uFE0F</div>'; }
  } else { avatarDiv.innerHTML = '<div class=\"msg-avatar-placeholder user-avatar\">\uD83D\uDC64</div>'; }
  var contentArea = document.createElement('div');
  contentArea.className = 'msg-content';
  var bubble = document.createElement('div');
  bubble.className = 'msg-bubble ' + (role === 'ai' ? 'ai' : 'user') + (isCrisis ? ' crisis' : '');
  var displayText = (text || '').replace(/\n/g, '<br>');
  bubble.innerHTML = displayText + '<span class=\"time\">' + time + '</span>';
  contentArea.appendChild(bubble);
  if (role === 'ai') {
    var badge = document.createElement('div');
    badge.className = 'ai-badge';
    badge.textContent = '🤖 AI 生成';
    contentArea.appendChild(badge);
  }
  if (audioUrl) {
    var player = createVoicePlayer(audioUrl);
    contentArea.appendChild(player);
    // 自动连播（可在 header 一键开关；浏览器若拦截则回落为手动）
    if (role === 'ai' && !isCrisis && autoVoiceOn()) {
      setTimeout(function() { player._toggle(); }, 400);
    }
  }
  wrapper.appendChild(avatarDiv);
  wrapper.appendChild(contentArea);
  msgs.appendChild(wrapper);
  msgs.scrollTop = msgs.scrollHeight;
}

// ===== 语音播放条 =====
var currentVoiceAudio = null;

function autoVoiceOn() {
  return localStorage.getItem('auto_voice') !== '0';
}

function toggleAutoVoice() {
  var on = !autoVoiceOn();
  localStorage.setItem('auto_voice', on ? '1' : '0');
  updateAutoVoiceBtn();
  toast(on ? '🔊 已开启语音自动播放' : '🔇 已关闭语音自动播放');
}

function updateAutoVoiceBtn() {
  var b = document.getElementById('autoVoiceBtn');
  if (b) b.textContent = autoVoiceOn() ? '🔊' : '🔇';
}

function createVoicePlayer(audioUrl) {
  var wrap = document.createElement('div');
  wrap.className = 'voice-player';
  wrap.innerHTML = '<button class="vp-btn">▶</button>' +
    '<div class="vp-track"><div class="vp-fill"></div></div>' +
    '<span class="vp-time">0:00</span>';
  var audio = new Audio(audioUrl);
  var btn = wrap.querySelector('.vp-btn');
  var fill = wrap.querySelector('.vp-fill');
  var time = wrap.querySelector('.vp-time');
  var track = wrap.querySelector('.vp-track');

  function fmt(s) {
    s = Math.floor(s || 0);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function toggle() {
    if (audio.paused) {
      if (currentVoiceAudio && currentVoiceAudio !== audio) { try { currentVoiceAudio.pause(); } catch (e) {} }
      currentVoiceAudio = audio;
      audio.play().catch(function() {});
    } else {
      audio.pause();
    }
  }
  btn.onclick = toggle;
  audio.onplay = function() { btn.textContent = '⏸'; };
  audio.onpause = function() { btn.textContent = '▶'; };
  audio.onended = function() { btn.textContent = '▶'; fill.style.width = '0'; };
  audio.ontimeupdate = function() {
    if (audio.duration) fill.style.width = (audio.currentTime / audio.duration * 100) + '%';
    time.textContent = fmt(audio.currentTime);
  };
  audio.onloadedmetadata = function() { time.textContent = fmt(audio.duration); };
  track.onclick = function(e) {
    var r = track.getBoundingClientRect();
    var ratio = (e.clientX - r.left) / r.width;
    if (audio.duration) audio.currentTime = ratio * audio.duration;
  };
  wrap._toggle = toggle;
  return wrap;
}

// ===== 字号切换（正常 / 大 / 更大） =====
var FONT_SIZES = ['', 'fs-2', 'fs-3'];
var FONT_NAMES = ['标准字号', '大字号', '超大字号'];

function applyFontSize() {
  var idx = parseInt(localStorage.getItem('chat_fs') || '0', 10) || 0;
  var msgs = document.getElementById('chatMessages');
  FONT_SIZES.forEach(function(c) { if (c) msgs.classList.remove(c); });
  if (FONT_SIZES[idx]) msgs.classList.add(FONT_SIZES[idx]);
}

function cycleFontSize() {
  var idx = (parseInt(localStorage.getItem('chat_fs') || '0', 10) || 0) + 1;
  if (idx >= FONT_SIZES.length) idx = 0;
  localStorage.setItem('chat_fs', String(idx));
  applyFontSize();
  toast('🅰️ ' + FONT_NAMES[idx]);
}

// ===== 寄心意（心意豆） =====
let giftCache = null;
let giftPayEnabled = false;
let beanBalance = 0;
let pendingGiftId = null; // 充值完成后自动续送的心意

async function openGiftSheet() {
  if (!currentCharId) return toast('请先选择角色');
  document.getElementById('giftSheet').style.display = 'flex';
  var grid = document.getElementById('giftGrid');
  try {
    var data = await api('/api/chat/gifts');
    giftPayEnabled = !!data.payEnabled;
    giftCache = data.list;
    if (giftPayEnabled) {
      var w = await api('/api/pay/wallet');
      beanBalance = w.balance;
    }
  } catch (err) { grid.innerHTML = '<p class="hint">加载失败</p>'; return; }
  renderGiftGrid();
  // 从微信支付回跳：充值已到账则补送心意
  resumePendingRecharge();
}

function renderGiftGrid() {
  var grid = document.getElementById('giftGrid');
  var head = '';
  if (giftPayEnabled) {
    head = '<div class="bean-bar"><span>🫘 心意豆 <strong>' + beanBalance + '</strong></span>' +
      '<button class="recharge-link" onclick="openRechargeSheet(null)">充值</button></div>';
    document.getElementById('giftHint').textContent = '送一份心意，TA 会真心回应你 · 1 元 = 10 心意豆';
  } else {
    document.getElementById('giftHint').textContent = '送一份心意，TA 会真心回应你 · 内测期间免费';
  }
  grid.innerHTML = head + giftCache.map(function(g) {
    var tag = (giftPayEnabled && g.beanPrice > 0)
      ? '<div class="gift-price">🫘 ' + g.beanPrice + '豆</div>'
      : '<div class="gift-points">免费 · +' + g.points + ' 记忆点</div>';
    return '<div class="gift-item" onclick="sendGift(\'' + g.id + '\')">' +
      '<div class="gift-emoji">' + g.emoji + '</div>' +
      '<div class="gift-name">' + g.name + '</div>' + tag + '</div>';
  }).join('');
}

function closeGiftSheet() {
  document.getElementById('giftSheet').style.display = 'none';
}

async function sendGift(giftId) {
  var g = (giftCache || []).find(function(x) { return x.id === giftId; });
  if (!g) return;
  if (giftPayEnabled && g.beanPrice > 0 && beanBalance < g.beanPrice) {
    openRechargeSheet(giftId); // 豆不够，先充值
    return;
  }
  closeGiftSheet();
  doDeliverGift(giftId);
}

// 实际发货（服务端扣豆，余额不足返回 needRecharge）
async function doDeliverGift(giftId) {
  var g = (giftCache || []).find(function(x) { return x.id === giftId; });
  addGiftMessage(g);
  var msgs = document.getElementById('chatMessages');
  var typing = document.createElement('div');
  typing.className = 'typing';
  typing.id = 'typing-indicator';
  typing.innerHTML = '<span></span><span></span><span></span>';
  msgs.appendChild(typing);
  msgs.scrollTop = msgs.scrollHeight;
  try {
    var res = await api('/api/chat/' + currentCharId + '/gift', {
      method: 'POST',
      body: JSON.stringify({ giftId: giftId }),
    });
    if (res.needRecharge) { // 并发扣完/余额不足，转充值
      var t = document.getElementById('typing-indicator');
      if (t) t.remove();
      beanBalance = res.balance;
      openRechargeSheet(giftId);
      return;
    }
    document.getElementById('typing-indicator').remove();
    if (typeof res.beanBalance === 'number') beanBalance = res.beanBalance;
    addMessage('ai', res.reply, res.audioUrl || null, false);
    toast('🕯️ +' + res.pointsEarned + ' 记忆点 · ' + res.milestone);
  } catch (err) {
    var t2 = document.getElementById('typing-indicator');
    if (t2) t2.remove();
    toast('❌ ' + err.message);
  }
}

// ===== 心意豆充值 =====
function openRechargeSheet(giftId) {
  pendingGiftId = giftId || null;
  closeGiftSheet();
  document.getElementById('paySheet').style.display = 'flex';
  document.getElementById('payTitle').textContent = '充值心意豆';
  var body = document.getElementById('payBody');
  body.innerHTML = '<p class="hint" style="text-align:center">加载档位…</p>';
  api('/api/pay/wallet').then(function(w) {
    beanBalance = w.balance;
    body.innerHTML =
      '<div class="pay-item"><div class="bean-big">🫘</div>' +
      '<div class="pay-item-name">当前余额 <strong>' + w.balance + '</strong> 豆</div>' +
      '<p class="hint">' + w.rate + ' · 只进不出</p></div>' +
      '<div class="tier-grid">' + w.tiers.map(function(t) {
        return '<div class="tier-item" onclick="rechargeTier(\'' + t.id + '\')">' +
          '<div class="tier-beans">' + t.beans + '豆</div>' +
          '<div class="tier-cny">¥' + t.cny + '</div></div>';
      }).join('') + '</div>' +
      '<div id="tierPay"></div>';
  }).catch(function(err) {
    body.innerHTML = '<p class="hint">加载失败：' + err.message + '</p>';
  });
}

function closePaySheet() {
  document.getElementById('paySheet').style.display = 'none';
  pendingGiftId = null;
}

async function rechargeTier(tierId) {
  var box = document.getElementById('tierPay');
  box.innerHTML = '<p class="hint" style="text-align:center">创建订单…</p>';
  try {
    var res = await api('/api/pay/create', {
      method: 'POST',
      body: JSON.stringify({ tierId: tierId }),
    });
    if (res.mock) {
      box.innerHTML = '<p class="hint" style="text-align:center">🧪 测试模式</p>' +
        '<button class="wechat-pay-btn" onclick="mockConfirmRecharge(\'' + res.orderId + '\')">' +
        '<span class="wx-icon">💬</span> 微信支付 ¥' + res.cny + '（模拟）</button>';
    } else {
      sessionStorage.setItem('pendingRecharge', JSON.stringify({
        orderId: res.orderId, giftId: pendingGiftId, characterId: currentCharId,
      }));
      location.href = res.h5_url;
    }
  } catch (err) {
    box.innerHTML = '<p class="hint">❌ ' + err.message + '</p>';
  }
}

async function mockConfirmRecharge(orderId) {
  try {
    var res = await api('/api/pay/mock-confirm', {
      method: 'POST',
      body: JSON.stringify({ orderId: orderId }),
    });
    beanBalance = res.balance;
    toast('🫘 充值成功，余额 ' + res.balance + ' 豆');
    closePaySheet();
    if (pendingGiftId) {
      var gid = pendingGiftId;
      pendingGiftId = null;
      doDeliverGift(gid); // 充值完自动续送
    }
  } catch (err) {
    toast('❌ ' + err.message);
  }
}

// 从微信支付回跳：到账后自动续送心意
async function resumePendingRecharge() {
  var raw = null;
  try { raw = sessionStorage.getItem('pendingRecharge'); } catch (e) {}
  if (!raw) return;
  var p = JSON.parse(raw);
  if (p.characterId !== currentCharId) return;
  sessionStorage.removeItem('pendingRecharge');
  try {
    var st = await api('/api/pay/status/' + p.orderId);
    if (st.status === 'paid') {
      beanBalance = st.balance;
      toast('🫘 充值成功，余额 ' + st.balance + ' 豆');
      if (p.giftId) {
        closeGiftSheet();
        doDeliverGift(p.giftId);
      } else {
        renderGiftGrid();
      }
    }
  } catch (err) { /* 忽略 */ }
}

// 心意消息气泡（特殊样式）
function addGiftMessage(g) {
  var msgs = document.getElementById('chatMessages');
  var wrapper = document.createElement('div');
  wrapper.className = 'msg-row user';
  var bubble = document.createElement('div');
  bubble.className = 'msg-bubble gift-bubble';
  var time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  bubble.innerHTML = '<div class="gift-big">' + (g ? g.emoji : '🎁') + '</div>' +
    '<div>寄出心意 · ' + (g ? g.name : '') + '</div>' +
    '<span class="time">' + time + '</span>';
  wrapper.appendChild(bubble);
  msgs.appendChild(wrapper);
  msgs.scrollTop = msgs.scrollHeight;
}

function playAudio(url) {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  currentAudio = new Audio(url);
  currentAudio.play().catch(function() {});
  currentAudio.onended = function() { currentAudio = null; };
}

async function clearChat() {
  if (!currentCharId) return;
  try { await api('/api/chat/' + currentCharId, { method: 'DELETE' }); document.getElementById('chatMessages').innerHTML = ''; }
  catch(e) {}
}

function startVoiceInput() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { return toast('\u60A8\u7684\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u8BED\u97F3\u8F93\u5165'); }
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.onresult = function(event) { document.getElementById('chatInput').value = event.results[0][0].transcript; sendMessage(); };
  recognition.onerror = function() { toast('\u8BED\u97F3\u8BC6\u522B\u5931\u8D25'); };
  recognition.start();
}

// ===== 设置 =====
function onProviderChange() {
  var val = document.getElementById('setProvider').value;
  document.getElementById('customBaseURLGroup').style.display = val === 'custom' ? 'block' : 'none';
  var hints = { openai: 'gpt-4o-mini', deepseek: 'deepseek-chat', moonshot: 'moonshot-v1-8k', qwen: 'qwen-turbo', glm: 'glm-4-flash', custom: '\u8BF7\u8F93\u5165\u6A21\u578B\u540D' };
  document.getElementById('modelHint').textContent = '\u793A\u4F8B: ' + (hints[val] || '');
  localStorage.setItem('llm_provider', val);
}

function loadKeys() {
  document.getElementById('setProvider').value = localStorage.getItem('llm_provider') || 'deepseek';
  document.getElementById('setModel').value = localStorage.getItem('llm_model') || '';
  document.getElementById('setCustomBaseURL').value = localStorage.getItem('llm_custom_baseurl') || '';
  onProviderChange();
}

async function changePassword() {
  var oldP = document.getElementById('oldPass').value;
  var newP = document.getElementById('newPass').value;
  var newP2 = document.getElementById('newPass2').value;
  var msg = document.getElementById('passMsg');
  if (!oldP) return msg.textContent = '\u8BF7\u8F93\u5165\u5F53\u524D\u5BC6\u7801';
  if (newP.length < 4) return msg.textContent = '\u65B0\u5BC6\u7801\u81F3\u5C114\u4F4D';
  if (newP !== newP2) return msg.textContent = '\u4E24\u6B21\u5BC6\u7801\u4E0D\u4E00\u81F4';
  msg.textContent = '';
  try {
    var res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': getToken() },
      body: JSON.stringify({ oldPassword: oldP, newPassword: newP }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('auth_token', data.token);
    msg.textContent = '\u2705 \u5BC6\u7801\u5DF2\u4FEE\u6539';
    msg.style.color = '#22c55e';
    document.getElementById('oldPass').value = '';
    document.getElementById('newPass').value = '';
    document.getElementById('newPass2').value = '';
  } catch (err) { msg.textContent = '\u274C ' + err.message; msg.style.color = '#ef4444'; }
}

// ===== 合规：数据权利 =====
async function exportMyData() {
  try {
    var res = await fetch('/api/auth/export', { headers: { 'x-auth-token': getToken() } });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'changban-data-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('✅ 数据已导出');
  } catch (err) { toast('❌ ' + err.message); }
}

async function deleteMyAccount() {
  if (!confirm('确定删除账号及全部数据吗？云端克隆声音将同步删除，此操作不可恢复！')) return;
  if (!confirm('再次确认：所有角色、对话记录、云端声音都将被永久删除，继续吗？')) return;
  try {
    var res = await fetch('/api/auth/account', { method: 'DELETE', headers: { 'x-auth-token': getToken() } });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.removeItem('auth_token');
    var failed = (data.cloudVoices || []).filter(function(r) { return !r.deleted; });
    toast(failed.length ? '⚠️ 账号已删除，但 ' + failed.length + ' 个云端声音删除失败，请联系客服' : '账号及云端声音已删除');
    setTimeout(function() { window.location.href = '/'; }, 1000);
  } catch (err) { toast('❌ ' + err.message); }
}

// ===== 合规：使用须知 / 声音同意 / 举报 =====
var NOTICE_ITEMS = [
  '<b>你在与 AI 对话</b>：这里的"亲人"是 AI 纪念角色，不是真人；语音为 AI 合成。',
  '<b>年满 18 岁</b>方可使用本服务。',
  '<b>逝者授权</b>：创建逝者纪念角色，须确认已获得逝者生前意愿或全体近亲属一致同意；如声明不实，责任由你承担。',
  '<b>声音是敏感个人信息</b>：声音克隆与语音合成会将你的录音/文字传输至境外服务商（ElevenLabs，美国）处理，克隆前需另行单独同意。',
  '<b>理性使用</b>：连续使用会有休息提醒；AI 不能替代现实生活，也不能替代专业心理咨询。',
  '<b>举报与下架</b>：如发现违规内容可举报；接到权利人异议，我们会下架相关角色。',
  '<b>你的数据</b>：可随时导出个人数据、删除账号及相关数据。'
];
function noticeHTML() {
  return '<ol style="padding-left:20px;line-height:1.8;font-size:13px;color:#cbd5e1;text-align:left">' +
    NOTICE_ITEMS.map(function(t) { return '<li style="margin-bottom:8px">' + t + '</li>'; }).join('') + '</ol>';
}

// 通用弹窗
function showComplianceModal(title, bodyHTML, buttons, blocking) {
  closeComplianceModal();
  var mask = document.createElement('div');
  mask.id = 'complianceModal';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px';
  var box = document.createElement('div');
  box.style.cssText = 'background:#1a1a2e;border:1px solid #334155;border-radius:14px;max-width:380px;width:100%;max-height:82vh;display:flex;flex-direction:column';
  var head = document.createElement('div');
  head.style.cssText = 'padding:14px 16px;font-weight:700;font-size:16px;border-bottom:1px solid #334155';
  head.textContent = title;
  var body = document.createElement('div');
  body.style.cssText = 'padding:14px 16px;overflow-y:auto';
  body.innerHTML = bodyHTML;
  var foot = document.createElement('div');
  foot.style.cssText = 'padding:12px 16px;border-top:1px solid #334155;display:flex;gap:10px';
  (buttons || [{ text: '关闭' }]).forEach(function(b) {
    var btn = document.createElement('button');
    btn.textContent = b.text;
    btn.className = b.primary ? 'btn-primary' : 'btn-secondary';
    btn.style.cssText = 'flex:1;padding:12px;border-radius:10px;font-size:15px;cursor:pointer;border:none;' +
      (b.primary ? 'background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff;font-weight:600;' : 'background:#1e293b;color:#cbd5e1;');
    btn.onclick = function() { closeComplianceModal(); if (b.fn) b.fn(); };
    foot.appendChild(btn);
  });
  box.appendChild(head); box.appendChild(body); box.appendChild(foot);
  mask.appendChild(box);
  if (!blocking) mask.addEventListener('click', function(e) { if (e.target === mask) closeComplianceModal(); });
  document.body.appendChild(mask);
}
function closeComplianceModal() {
  var m = document.getElementById('complianceModal');
  if (m) m.remove();
}

// --- 老用户补确认《使用须知》（阻塞式） ---
async function checkNotice() {
  if (!currentUser || !currentUser.needNotice) return;
  showComplianceModal('📜 常伴使用须知', noticeHTML() + '<p style="font-size:12px;color:#64748b">继续使用即表示你已阅读并同意上述须知。</p>', [
    { text: '已阅读，同意', primary: true, fn: async function() {
      try {
        await api('/api/auth/accept-notice', { method: 'POST' });
        currentUser.needNotice = false;
      } catch (e) { toast('❌ 确认失败，请重试'); checkNotice(); }
    } }
  ], true);
}

// --- 声音克隆单独同意 ---
var VOICE_CONSENT_HTML = '<ol style="padding-left:20px;line-height:1.8;font-size:13px;color:#cbd5e1;text-align:left">' +
  '<li style="margin-bottom:8px"><b>声纹是敏感个人信息</b>：克隆会提取并存储说话人的声纹特征。</li>' +
  '<li style="margin-bottom:8px"><b>数据会出境</b>：克隆与合成由境外服务商 ElevenLabs（美国）处理，你的录音将传输至境外。</li>' +
  '<li style="margin-bottom:8px"><b>来源承诺</b>：你保证这段录音来自你本人，或已获得逝者全体近亲属一致同意；虚假声明责任自负。</li>' +
  '<li style="margin-bottom:8px">删除角色时，云端声音将同步删除。</li></ol>';
var voiceConsentGiven = false;
function ensureVoiceConsent(next) {
  showComplianceModal('🎤 声音克隆须知', VOICE_CONSENT_HTML, [
    { text: '取消' },
    { text: '已阅读，同意并继续', primary: true, fn: function() { voiceConsentGiven = true; next(); } }
  ]);
}

// --- 举报角色 ---
function openReport() {
  if (!currentCharId) return toast('请先进入一个对话');
  var body = '<p style="font-size:13px;color:#94a3b8;margin-bottom:8px">举报对象：' + escapeHtml(currentCharData ? currentCharData.name : '') + '</p>' +
    '<select id="reportReason" style="width:100%;padding:10px;border-radius:8px;background:#0f0f1a;color:#e2e8f0;border:1px solid #334155;margin-bottom:8px">' +
    ['未经授权', '冒充亲属', '有害内容', '诈骗嫌疑', '其他'].map(function(r) { return '<option>' + r + '</option>'; }).join('') + '</select>' +
    '<textarea id="reportDetail" placeholder="补充说明（可选）" style="width:100%;padding:10px;border-radius:8px;background:#0f0f1a;color:#e2e8f0;border:1px solid #334155;min-height:60px;font-size:13px"></textarea>';
  showComplianceModal('🚩 举报', body, [
    { text: '取消' },
    { text: '提交举报', primary: true, fn: async function() {
      var reason = document.getElementById('reportReason').value;
      var detail = document.getElementById('reportDetail').value;
      try {
        await api('/api/reports', { method: 'POST', body: JSON.stringify({ characterId: currentCharId, reason: reason, detail: detail }) });
        toast('✅ 举报已提交，我们会尽快处理');
      } catch (e) { toast('❌ ' + e.message); }
    } }
  ]);
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}

// --- 管理员：举报列表 ---
async function loadAdminReports() {
  var sec = document.getElementById('adminReportsSection');
  if (!sec) return;
  if (!currentUser || currentUser.role !== 'admin') { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  var listEl = document.getElementById('reportsList');
  try {
    var reports = await api('/api/reports');
    if (!reports.length) { listEl.innerHTML = '<p class="hint">暂无举报</p>'; return; }
    listEl.innerHTML = reports.map(function(r) {
      var st = r.status === 'pending' ? '<span style="color:#f59e0b">待处理</span>' : (r.status === 'takedown' ? '<span style="color:#ef4444">已下架</span>' : '<span style="color:#64748b">已驳回</span>');
      var btns = r.status === 'pending'
        ? '<button class="btn-secondary" style="padding:4px 10px;font-size:12px" onclick="handleReport(\'' + r.id + '\',\'dismiss\')">驳回</button> ' +
          '<button class="btn-primary" style="padding:4px 10px;font-size:12px" onclick="handleReport(\'' + r.id + '\',\'takedown\')" title="下架角色并同步删除云端声音，不可恢复">下架角色</button>'
        : '';
      return '<div style="border:1px solid #334155;border-radius:8px;padding:10px;margin-bottom:8px;font-size:13px">' +
        '<div><b>' + escapeHtml(r.characterName) + '</b> · ' + escapeHtml(r.reason) + ' · ' + st + '</div>' +
        '<div style="color:#94a3b8;margin:4px 0">举报人：' + escapeHtml(r.reporterName) + ' · ' + new Date(r.createdAt).toLocaleString() + '</div>' +
        (r.detail ? '<div style="color:#cbd5e1">' + escapeHtml(r.detail) + '</div>' : '') +
        (r.note ? '<div style="color:#64748b">备注：' + escapeHtml(r.note) + '</div>' : '') +
        (btns ? '<div style="margin-top:8px">' + btns + '</div>' : '') + '</div>';
    }).join('');
  } catch (e) { listEl.innerHTML = '<p class="hint">加载失败</p>'; }
}
async function handleReport(id, action) {
  var note = action === 'takedown' ? prompt('下架原因备注（可选）：', '') : '';
  if (note === null) return;
  try {
    await api('/api/reports/' + id + '/handle', { method: 'POST', body: JSON.stringify({ action: action, note: note || '' }) });
    toast(action === 'takedown' ? '✅ 角色已下架' : '✅ 已驳回');
    loadAdminReports();
  } catch (e) { toast('❌ ' + e.message); }
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async function() {
  loadKeys();
  await initAuth();
  var authed = await checkAuth();
  if (authed) loadCharacters();
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(function() {}); }
});
