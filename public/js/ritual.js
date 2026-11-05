// ===== 时光机仪式：初见穿越 / 告别回到现实 =====
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
  const tunnel = document.getElementById('tunnelCanvas');
  if (tunnel) tunnel.dataset.stop = '1';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 时光隧道：粒子 warp；reverse=true 为反向（回到现实） */
function runTunnel(canvas, reverse, duration) {
  return new Promise((resolve) => {
    const ctx = canvas.getContext('2d');
    const W = (canvas.width = window.innerWidth);
    const H = (canvas.height = window.innerHeight);
    const CX = W / 2, CY = H / 2;
    const N = 240;
    const parts = [];
    for (let i = 0; i < N; i++) {
      parts.push({
        x: (Math.random() * 2 - 1),
        y: (Math.random() * 2 - 1),
        z: Math.random(),
        px: 0, py: 0,
      });
    }
    const t0 = Date.now();
    function frame() {
      if (canvas.dataset.stop === '1' || ritualSkipped) return resolve();
      if (Date.now() - t0 > duration) return resolve();
      ctx.fillStyle = 'rgba(5,5,12,0.28)';
      ctx.fillRect(0, 0, W, H);
      const scale = Math.min(W, H) * 0.55;
      for (const p of parts) {
        p.px = CX + (p.x / p.z) * scale;
        p.py = CY + (p.y / p.z) * scale;
        p.z += reverse ? 0.012 : -0.014;
        if (p.z <= 0.03) { p.z = 1; p.x = Math.random() * 2 - 1; p.y = Math.random() * 2 - 1; }
        if (p.z > 1.2) { p.z = 0.05; p.x = Math.random() * 2 - 1; p.y = Math.random() * 2 - 1; }
        const nx = CX + (p.x / p.z) * scale;
        const ny = CY + (p.y / p.z) * scale;
        const a = Math.max(0, Math.min(1, 1.1 - p.z));
        ctx.strokeStyle = `rgba(255,${190 + Math.floor(40 * a)},140,${(a * 0.9).toFixed(2)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(nx, ny);
        ctx.stroke();
      }
      requestAnimationFrame(frame);
    }
    frame();
  });
}

/** 时光机音效：噪声扫频 whoosh，由大到小（Web Audio 现场合成，复用手势激活的 context） */
function playWarpSound(durationMs) {
  return new Promise(async (resolve) => {
    try {
      const ctx = await ensureRitualAudio();
      const dur = durationMs / 1000;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.4;
      filter.frequency.setValueAtTime(180, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(4200, ctx.currentTime + dur * 0.85);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
      noise.onended = () => { resolve(); };
      setTimeout(resolve, durationMs + 500);
    } catch (e) { resolve(); }
  });
}

/** 共享 AudioContext：在点击手势内激活，隧道播完（手势过期）后依然有效 */
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
      // 降级：HTMLAudio（短隧道/手势有效期内可用）
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

/** 初见仪式：穿越 → 听见声音 → 看见画面 → 打招呼 → 进入对话 */
async function startMeetingRitual(characterId) {
  ensureRitualAudio(); // 手势内激活音频，后续播放不受限制
  let char = null;
  try { char = await getCharacter(characterId); } catch (e) {}
  const name = char ? char.name : 'TA';
  const avatarUrl = char && char.hasAvatar ? '/api/avatar/' + characterId : null;

  ritualShow(
    '<canvas id="tunnelCanvas" class="tunnel-canvas"></canvas>' +
    '<div class="ritual-center"><div class="ritual-text">正在穿越时光…</div></div>'
  );
  const canvas = document.getElementById('tunnelCanvas');

  // 隧道与问候并行准备
  const greetP = api('/api/chat/' + characterId + '/greet', { method: 'POST' }).catch(() => null);
  await Promise.all([
    runTunnel(canvas, false, 5000),
    playWarpSound(5000),
  ]);
  if (ritualSkipped) { enterChat(characterId); return; }

  const greet = await greetP;
  const reply = (greet && greet.reply) || ('好久不见，我很想你。');
  const audioUrl = greet && greet.audioUrl;

  // 听见声音（只留播放指示器，不放文字） → 画面渐显
  ritualEl().querySelector('.ritual-center').innerHTML =
    '<div class="ritual-eq"><span></span><span></span><span></span><span></span><span></span></div>';
  const audioP = playRitualAudio(audioUrl);
  await sleep(1200);
  if (ritualSkipped) { enterChat(characterId); return; }

  ritualEl().querySelector('.ritual-center').innerHTML =
    (avatarUrl
      ? '<img src="' + avatarUrl + '" class="ritual-avatar">'
      : '<div class="ritual-avatar placeholder">🕊️</div>') +
    '<div class="ritual-name">' + name + '</div>' +
    '<div class="ritual-reply">' + reply + '</div>';
  await audioP;
  if (ritualSkipped) { enterChat(characterId); return; }
  await sleep(800);

  // 进入对话按钮
  const center = ritualEl().querySelector('.ritual-center');
  const btn = document.createElement('button');
  btn.className = 'ritual-btn';
  btn.textContent = '开始对话';
  btn.onclick = () => enterChat(characterId);
  center.appendChild(btn);
  // 隐藏跳过（已到终点）
  const skip = ritualEl().querySelector('.ritual-skip');
  if (skip) skip.style.display = 'none';
}

function enterChat(characterId) {
  try { localStorage.setItem('ritual_seen_' + characterId, '1'); } catch (e) {}
  ritualHide();
  navigate('chat', characterId);
}

/** 告别仪式：告别语 → 反向穿越 → 摄像头回到现实 */
async function startFarewellRitual(characterId) {
  ensureRitualAudio(); // 手势内激活音频
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

  // 反向穿越
  const overlay = ritualEl();
  overlay.innerHTML =
    '<canvas id="tunnelCanvas" class="tunnel-canvas"></canvas>' +
    '<div class="ritual-center"><div class="ritual-text">正在回到现实…</div></div>' +
    '<button class="ritual-skip" onclick="skipRitual()">跳过 ›</button>';
  await Promise.all([
    runTunnel(document.getElementById('tunnelCanvas'), true, 5000),
    playWarpSound(5000),
  ]);
  if (ritualSkipped) { ritualHide(); return; }

  // 摄像头：回到现在
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
// 只在创建角色成功、进入首页之前播放。再次打开角色仍走上面的粒子初见仪式。
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
