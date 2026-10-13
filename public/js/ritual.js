// ===== 时光机仪式：初见穿越 / 告别回到现实 =====
let ritualSkipped = false;
let ritualAudio = null;
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
  if (ritualAudio) { try { ritualAudio.pause(); } catch (e) {} ritualAudio = null; }
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

/** 播放语音并等待结束（可被跳过打断） */
function playRitualAudio(url) {
  return new Promise((resolve) => {
    if (!url) return resolve();
    ritualAudio = new Audio(url);
    ritualAudio.onended = () => resolve();
    ritualAudio.onerror = () => resolve();
    ritualAudio.play().catch(() => resolve());
    const check = setInterval(() => {
      if (ritualSkipped) { clearInterval(check); resolve(); }
    }, 200);
    ritualAudio.onended = () => { clearInterval(check); resolve(); };
  });
}

async function getCharacter(id) {
  const list = await api('/api/characters');
  return list.find((c) => c.id === id);
}

/** 初见仪式：穿越 → 听见声音 → 看见画面 → 打招呼 → 进入对话 */
async function startMeetingRitual(characterId) {
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
  await runTunnel(canvas, false, 3200);
  if (ritualSkipped) { enterChat(characterId); return; }

  const greet = await greetP;
  const reply = (greet && greet.reply) || ('好久不见，我很想你。');
  const audioUrl = greet && greet.audioUrl;

  // 听见声音 → 画面渐显
  ritualEl().querySelector('.ritual-center').innerHTML =
    '<div class="ritual-text small">听…那是 TA 的声音</div>';
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
  await runTunnel(document.getElementById('tunnelCanvas'), true, 3000);
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
      video: { facingMode: 'user' }, audio: false,
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
