// ===== 初见问候 / 告别回到现实（无全屏动画） =====
let ritualSkipped = false;
let ritualAudioEl = null; // 降级通道的 HTMLAudio
let ritualStream = null;

function ritualEl() {
  let el = document.getElementById('ritualOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ritualOverlay';
    el.className = 'ritual-overlay';
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}

function ritualShow(html) {
  const el = ritualEl();
  el.innerHTML = html +
    '<button class="ritual-skip" onclick="skipRitual()">跳过 ›</button>';
  el.style.display = 'flex';
  ritualSkipped = false;
}

function ritualHide() {
  stopRitualMedia();
  const el = document.getElementById('ritualOverlay');
  if (el) el.style.display = 'none';
}

function stopRitualMedia() {
  if (ritualSrc) { try { ritualSrc.stop(); } catch (e) {} ritualSrc = null; }
  if (ritualAudioEl) { try { ritualAudioEl.pause(); } catch (e) {} ritualAudioEl = null; }
  if (ritualStream) {
    ritualStream.getTracks().forEach((t) => t.stop());
    ritualStream = null;
  }
}

function skipRitual() {
  ritualSkipped = true;
  stopRitualMedia();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 共享 AudioContext：在点击手势内激活，之后播放问候语音不受限制 */
let ritualCtx = null;
let ritualSrc = null; // 当前播放的 buffer source（可打断）

async function ensureRitualAudio() {
  if (!ritualCtx) {
    ritualCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ritualCtx.state === 'suspended') {
    try { await ritualCtx.resume(); } catch (e) {}
  }
  return ritualCtx;
}

/** 播放语音并等待结束（可被跳过打断） */
function playRitualAudio(url) {
  return new Promise(async (resolve) => {
    if (!url) return resolve();
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try {
      const ctx = await ensureRitualAudio();
      const resp = await fetch(url);
      const buf = await ctx.decodeAudioData(await resp.arrayBuffer());
      if (ritualSkipped) return finish();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = finish;
      ritualSrc = src;
      src.start();
      setTimeout(finish, 30000); // 兜底
    } catch (e) {
      // 降级：HTMLAudio（手势有效期内可用）
      try {
        const a = new Audio(url);
        ritualAudioEl = a;
        a.onended = finish;
        a.onerror = finish;
        try { a.currentTime = 0; } catch (e2) {}
        const p = a.play();
        if (p && p.catch) p.catch(finish);
        setTimeout(finish, 30000);
      } catch (e2) { finish(); }
    }
  });
}

async function getCharacter(id) {
  const list = await api('/api/characters');
  return list.find((c) => c.id === id);
}

/** 重温初见：问候与声音，没有全屏动画 */
async function startMeetingRitual(characterId) {
  ensureRitualAudio();
  let char = null;
  try { char = await getCharacter(characterId); } catch (e) {}
  const name = char ? char.name : 'TA';
  const avatarUrl = char && char.hasAvatar ? '/api/avatar/' + characterId : null;

  ritualShow(
    '<div class="ritual-center"><div class="ritual-eq"><span></span><span></span><span></span><span></span><span></span></div></div>'
  );

  const greet = await api('/api/chat/' + characterId + '/greet', { method: 'POST' }).catch(() => null);
  if (ritualSkipped) { enterChat(characterId); return; }

  const reply = (greet && greet.reply) || ('好久不见，我很想你。');
  const audioUrl = greet && greet.audioUrl;
  const audioP = playRitualAudio(audioUrl);

  ritualEl().querySelector('.ritual-center').innerHTML =
    (avatarUrl
      ? '<img src="' + avatarUrl + '" class="ritual-avatar">'
      : '<div class="ritual-avatar placeholder">🕊️</div>') +
    '<div class="ritual-name">' + name + '</div>' +
    '<div class="ritual-reply">' + reply + '</div>';
  await audioP;
  if (ritualSkipped) { enterChat(characterId); return; }

  const center = ritualEl().querySelector('.ritual-center');
  const btn = document.createElement('button');
  btn.className = 'ritual-btn';
  btn.textContent = '开始对话';
  btn.onclick = () => enterChat(characterId);
  center.appendChild(btn);
  const skip = ritualEl().querySelector('.ritual-skip');
  if (skip) skip.style.display = 'none';
}

function enterChat(characterId) {
  ritualHide();
  navigate('chat', characterId);
}

/** 告别仪式：告别语之后直接回到现实，没有反向动画 */
async function startFarewellRitual(characterId) {
  ensureRitualAudio();
  let char = null;
  try { char = await getCharacter(characterId); } catch (e) {}
  const name = char ? char.name : 'TA';

  ritualShow(
    '<div class="ritual-center"><div class="ritual-text">好好告个别吧…</div></div>'
  );

  const fwP = api('/api/chat/' + characterId + '/farewell', { method: 'POST' }).catch(() => null);
  await sleep(1500);
  if (ritualSkipped) { ritualHide(); return; }

  const fw = await fwP;
  const reply = (fw && fw.reply) || '你要好好吃饭，好好生活，我会一直在你心里。';
  ritualEl().querySelector('.ritual-center').innerHTML =
    '<div class="ritual-name">' + name + '</div>' +
    '<div class="ritual-reply">' + reply + '</div>';
  await playRitualAudio(fw && fw.audioUrl);
  if (ritualSkipped) { ritualHide(); return; }

  const overlay = ritualEl();
  overlay.innerHTML =
    '<div class="camera-wrap"><video id="ritualVideo" autoplay playsinline muted></video>' +
    '<div class="camera-mask"></div>' +
    '<div class="ritual-center over-camera">' +
    '<div class="ritual-text big">我们回到了现在</div>' +
    '<div class="ritual-reply">好好生活，TA 会希望看到你笑 ☀️</div>' +
    '<button class="ritual-btn" onclick="closeFarewell()">回到现实</button>' +
    '</div></div>';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }, audio: false,
    });
    ritualStream = stream;
    document.getElementById('ritualVideo').srcObject = stream;
  } catch (e) {
    // 拒绝/无摄像头：纯文字版
    const vw = document.getElementById('ritualVideo');
    if (vw) vw.style.display = 'none';
  }
}

function closeFarewell() {
  ritualHide();
}

// ===== 建角成功后的时光隧道成片 =====
// 只在创建角色成功、进入首页之前播放。再次打开角色直接进对话。
const TUNNEL_INTRO_SRC = '/assets/tunnel-rewind.mp4';
let tunnelPhase = 'idle'; // idle | priming | playing
let tunnelIntroResolve = null;
let tunnelIntroBound = false;

function tunnelIntroNodes() {
  return {
    el: document.getElementById('tunnelIntro'),
    video: document.getElementById('tunnelIntroVideo'),
    unmute: document.getElementById('tunnelIntroUnmute'),
  };
}

function setTunnelShell(mode) {
  const el = document.getElementById('tunnelIntro');
  if (!el) return;
  el.classList.toggle('is-priming', mode === 'prime');
  el.classList.toggle('is-open', mode === 'open');
  el.hidden = mode === 'off';
}

function setTunnelUnmute(visible) {
  const btn = document.getElementById('tunnelIntroUnmute');
  if (btn) btn.hidden = !visible;
}

function bindTunnelIntro() {
  if (tunnelIntroBound) return;
  const nodes = tunnelIntroNodes();
  if (!nodes.video || !nodes.el) return;
  tunnelIntroBound = true;
  nodes.video.playsInline = true;
  nodes.video.setAttribute('playsinline', 'true');
  nodes.video.setAttribute('webkit-playsinline', 'true');
  if (!nodes.video.getAttribute('src')) nodes.video.src = TUNNEL_INTRO_SRC;
  nodes.video.addEventListener('playing', function() {
    const card = nodes.video.closest('.tunnel-intro-card');
    if (card) card.classList.add('is-playing');
  });
  nodes.video.addEventListener('ended', finishCreationTunnel);
  nodes.video.addEventListener('error', function() {
    if (tunnelPhase === 'playing') finishCreationTunnel();
  });
  const skip = document.getElementById('tunnelIntroSkip');
  if (skip) skip.addEventListener('click', finishCreationTunnel);
  if (nodes.unmute) {
    nodes.unmute.addEventListener('click', function() {
      nodes.video.muted = false;
      setTunnelUnmute(false);
      const p = nodes.video.play();
      if (p && p.catch) p.catch(function() {});
    });
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && tunnelPhase === 'playing') finishCreationTunnel();
  });
}

/** 在创建按钮的点击手势里调用，解锁之后的有声播放。失败不影响建角。 */
function primeCreationTunnel() {
  bindTunnelIntro();
  const video = document.getElementById('tunnelIntroVideo');
  if (!video || tunnelPhase === 'playing') return;
  tunnelPhase = 'priming';
  setTunnelUnmute(false);
  setTunnelShell('prime');
  video.muted = false;
  try { video.currentTime = 0; } catch (e) {}
  const p = video.play();
  if (p && p.then) {
    p.then(function() {
      // 正式开播后不要再暂停；失败或已取消时必须停掉，避免藏着出声
      if (tunnelPhase === 'playing') return;
      video.pause();
      try { video.currentTime = 0; } catch (e) {}
      if (tunnelPhase === 'priming') setTunnelShell('off');
    }).catch(function() {
      if (tunnelPhase === 'priming') setTunnelShell('off');
    });
  }
}

/** 建角失败时收起预热，避免挡住报错。 */
function cancelCreationTunnel() {
  if (tunnelPhase === 'playing') return;
  tunnelPhase = 'idle';
  const video = document.getElementById('tunnelIntroVideo');
  if (video) {
    try { video.pause(); } catch (e) {}
    try { video.currentTime = 0; } catch (e) {}
  }
  setTunnelUnmute(false);
  setTunnelShell('off');
}

/**
 * 播放 4:3 时光隧道成片。播完或跳过 resolve。
 * 资源缺失或自动播放被彻底拦截时也会结束，避免卡在遮罩上。
 */
function playCreationTunnel() {
  return new Promise(function(resolve) {
    bindTunnelIntro();
    const nodes = tunnelIntroNodes();
    if (!nodes.el || !nodes.video) { resolve(); return; }
    tunnelPhase = 'playing';
    tunnelIntroResolve = resolve;
    setTunnelUnmute(false);
    const card = nodes.el.querySelector('.tunnel-intro-card');
    if (card) card.classList.remove('is-playing');
    setTunnelShell('open');
    try { nodes.video.currentTime = 0; } catch (e) {}
    nodes.video.muted = false;
    const started = nodes.video.play();
    if (started && started.catch) {
      started.catch(function() {
        if (tunnelPhase !== 'playing') return;
        // 手势已过期时退到静音播放，并给一次开声入口
        nodes.video.muted = true;
        setTunnelUnmute(true);
        const retry = nodes.video.play();
        if (retry && retry.then) {
          retry.then(function() {
            if (tunnelPhase !== 'playing') nodes.video.pause();
          }).catch(function() {
            if (tunnelPhase === 'playing') finishCreationTunnel();
          });
        }
      });
    }
  });
}

function finishCreationTunnel() {
  if (tunnelPhase !== 'playing') return;
  const resolve = tunnelIntroResolve;
  tunnelIntroResolve = null;
  tunnelPhase = 'idle';
  const nodes = tunnelIntroNodes();
  if (nodes.video) {
    try { nodes.video.pause(); } catch (e) {}
    try { nodes.video.currentTime = 0; } catch (e) {}
    nodes.video.muted = false;
  }
  if (nodes.el) {
    const card = nodes.el.querySelector('.tunnel-intro-card');
    if (card) card.classList.remove('is-playing');
  }
  setTunnelUnmute(false);
  setTunnelShell('off');
  if (resolve) resolve();
}
