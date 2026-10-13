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
async function loadCharacters() {
  var list = document.getElementById('charList');
  try {
    var chars = await api('/api/characters');
    if (chars.length === 0) {
      list.innerHTML = '<div class=\"empty-state\"><div class=\"emoji\">\uD83D\uDD4A\uFE0F</div><p>\u8FD8\u6CA1\u6709\u89D2\u8272<br>\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u521B\u5EFA\u7B2C\u4E00\u4E2A</p></div>';
      return;
    }
    list.innerHTML = chars.map(function(c) {
      return '<div class=\"char-card\" onclick=\"navigate(\'chat\',\'' + c.id + '\')\">' +
        (c.hasAvatar ? '<img src=\"/api/avatar/' + c.id + '\" class=\"char-card-avatar\" onerror=\"this.style.display=\'none\'\">' : '<div class=\"char-card-avatar placeholder\">\uD83D\uDD4A\uFE0F</div>') +
        '<div class=\"char-card-info\"><h3>' + c.name + ' <span class=\"ai-tag\">AI</span></h3><p>' + (c.relationship || '') + '</p></div>' +
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
  if (!confirm('\u786E\u5B9A\u5220\u9664\uFF1F')) return;
  try { await api('/api/characters/' + id, { method: 'DELETE' }); toast('\u89D2\u8272\u5DF2\u5220\u9664'); navigate('home'); }
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
  var id = document.getElementById('editId').value;
  var status = document.getElementById('voiceStatus');
  status.textContent = '\u23F3 \u6B63\u5728\u514B\u9686\u58F0\u97F3...';
  try {
    var res = await fetch('/api/voices/clone/' + id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': getToken() },
      body: JSON.stringify({ name: document.getElementById('editName').value || '\u6211\u7684\u4EB2\u4EBA', segmentIndex: index }),
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
  if (!confirm('确定删除账号及全部数据吗？此操作不可恢复！')) return;
  if (!confirm('再次确认：所有角色、对话记录都将被永久删除，继续吗？')) return;
  try {
    var res = await fetch('/api/auth/account', { method: 'DELETE', headers: { 'x-auth-token': getToken() } });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.removeItem('auth_token');
    toast('账号已删除');
    setTimeout(function() { window.location.href = '/'; }, 1000);
  } catch (err) { toast('❌ ' + err.message); }
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async function() {
  loadKeys();
  await initAuth();
  var authed = await checkAuth();
  if (authed) loadCharacters();
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(function() {}); }
});
