# 常伴（changban）— 状态说明与交接

> 一句话：**为已经离开的人，留下一份可以对话、可以听见声音的记忆。**
> 建角色（性格 / 回忆 / 方言）→ 上传 TA 的录音克隆音色 → 对话，TA 用熟悉的声音回你。
>
> 原开发者：openclaw（2026-06-09 ~ 06-10，原路径 `C:\Users\<原开发者>\.openclaw\workspace\changban`）
> 本机归档路径：`D:\exe\Hermes\project\changban` ｜ 归档整理：2026-10-12

---

## 1. 技术栈

| 层 | 实现 |
|---|---|
| 后端 | Node.js（本机 v24.15.0）+ Express 4，**无数据库**，JSON 文件存储（`data/*.json`） |
| 前端 | 单页 `public/index.html` + `public/js/app.js`（523 行），PWA（`manifest.json` + `sw.js`，可加到手机桌面） |
| 登录 | ① 用户名 + 密码（`crypto.scryptSync` 加盐，`services/auth.js`）<br>② 手机号：阿里云短信验证码注册（可用）/ 一键登录 H5 SDK（未打通，见 §5-3） |
| AI 对话 | 多供应商可切：DeepSeek（默认）/ OpenAI / Moonshot / 通义千问 / 智谱 GLM / 自定义（Ollama）<br>`server/services/openai.js`，`PROVIDER_URLS` 表 |
| 语音克隆 | 上传视频/音频 → ffmpeg 静音检测自动切片（`routes/voices.js`）→ 选段 → **ElevenLabs Instant Voice Clone**（`services/elevenlabs.js`） |
| 语音回复 | 每条回复 TTS 成 mp3 落 `public/uploads/`，前端自动朗读（`app.js: playAudio`） |
| 备用 TTS | Fish Audio 一套已写未接（`services/fishaudio.js`） |
| 角色建模 | `routes/characters.js: generatePrompt()` —— 强制口语化、短句、带语气词、"不要提你是AI"、≤30 字/句 |

## 2. 怎么跑

```bash
cd D:\exe\Hermes\project\changban
cp .env.example .env      # 首次：填密钥（仓库里没有 .env）
node server/index.js          # 或双击 start.bat
# → http://localhost:3000   （手机访问：本机局域网 IP + 3000）
PORT=3300 node server/index.js   # 换端口
```

远端仓库：**https://github.com/luokaisa/changban**（private）

依赖已装好（`node_modules/` 204 个包，含 `ffmpeg-static`）。**密钥在 `.env`（本地，已 gitignore），4 家 key 都是活的**（DeepSeek / ElevenLabs / 阿里云 AK+SK / Fish Audio）。

### 目录

```
server/
  index.js            入口：中间件、静态文件、路由挂载、SPA 回退
  config.js           读 .env
  middleware/auth.js  登录闸门（⚠️ 见 §5-1）
  routes/   auth.js  characters.js  chat.js  voices.js  avatar.js
  services/ auth.js  storage.js  openai.js  elevenlabs.js  fishaudio.js
            sms.js  phoneAuth.js  h5Token.js  auth-sdk-entry.js
public/
  index.html  js/app.js  css/style.css  manifest.json  sw.js
  phone-auth.html  phone-auth-react.jsx      手机号注册页
  assets/    阿里云 numberAuth SDK（bundle）、react 生产版
  uploads/   33 段真人语音样本 + 1 张头像（gitignored）
data/        users/characters/sessions/verify-codes/verify-tokens.json（gitignored）
_debug/      原 openclaw 的 36 个草稿/排查脚本（见 §6）
```

## 3. 已完成（今天实测通过）

2026-10-12 本机启动冒烟测试（端口 3300）：

| 检查项 | 结果 |
|---|---|
| 启动 | ✅ `✨ 语音纪念人已启动` |
| `GET /` | ✅ 200，`<title>常伴</title>` |
| `GET /manifest.json` / `/js/app.js` / `/phone-auth.html` | ✅ 全 200 |
| `GET /api/auth/status` | ✅ `{"hasUsers":true}` |
| `GET /api/characters`（未登录） | ✅ 401（闸门生效） |
| `POST /api/voices/clone/xxx`（未登录） | ⚠️ **400「请选择要克隆的音频」= 已穿过登录闸门**（见 §5-1） |

功能链路：注册 → 建角色 → 克隆声音 → 对话 → 听回复 —— 完整，6 月生产用过。

## 4. 数据现状（真实数据，勿随意清）

- **6 个用户**：`u5120`（admin，真实手机号）、`螺蛳粉`、`长安`、`螺蛳粉汤圆`、`123`、`testuser`
- **8 个角色**：奶奶、外婆、女鹅「小雨」、小a、Me、螺蛳粉… + 3 个测试残留（`123` / `Test` / `测试创建`）
- **33 段真人语音样本**（5.0 MB）+ 1 张头像 `avatar_a5aa6844.jpg`
- 14 条登录会话（有效期 7 天，已全部过期）

## 5. 已知问题（按严重度，带定位）

| # | 问题 | 位置 | 说明 / 影响 |
|---|---|---|---|
| 1 | **克隆/切片接口免登录** | `middleware/auth.js:16` | 明确放行 `/voices/clone`、`/voices/split` → 任何人可白嫖 ElevenLabs 额度。原开发者为传 token 打过补丁（`_debug/_fix_clone.js`），说明当时在救这个 |
| 2 | **对话历史只在内存** | `routes/chat.js:11` `const conversations = {}` | 进程重启即丢；角色/用户/登录态反而落盘了 |
| 3 | **一键登录链路大概率不通** | `services/h5Token.js` | 拿 `DescribeVerifyScheme.encryptToken` 当 accessToken，与阿里云 H5 SDK 要求不符；短信验证码那条路是好用的 |
| 4 | **无 git 仓库** | — | 已在本次整理中 `git init` 补齐回滚点（见 §7） |
| 5 | TTS 音频不清理 | `routes/chat.js:65` | 每轮对话落一个 mp3，长期跑会吃满磁盘（现 33 个） |
| 6 | 弱口令门槛 | `routes/auth.js:173,220` | 密码 ≥4 位、用户名 ≥2 字符 → 公网必被撞 |
| 7 | SPA 回退吞错 | `index.js:39` `app.get('*')` | 未匹配的 `/api/*` 会返回 HTML，排障时误导 |
| 8 | 无额度/无支付/无后台 | 全项目 | 目前只能自用或小圈子 |

## 6. `_debug/` 说明

原 openclaw 留在根目录的 **36 个 `_*.js / _*.cjs / _*.mjs` 草稿脚本**已归入 `_debug/`（本次整理只移动、未修改、未删除 —— 没有任何生产代码 require 它们，已 grep 确认）。

其中 13 个仍引用旧机器的绝对路径 `C:\Users\<原开发者>\.openclaw\workspace\changban\...`，**在本机跑不通**，仅作历史参考（`_fix_clone.js` 记录了免登录坑当时的修法）。

## 7. 本次整理做了什么（2026-10-12）

1. `_*.{js,cjs,mjs}` 36 个草稿 → `_debug/`（根目录只剩正式文件）
2. 本文件 `README.md`
3. 启动冒烟测试（§3 的表）
4. `git init` + 首次提交，建立回滚点（`.gitignore` 已排除 `.env`、`data/*.json`、`public/uploads/*`）
5. 推送到 GitHub：**https://github.com/luokaisa/changban**（private，`main` 分支）
   - 推送前做了发布前扫描：提交内容**无密钥、无真实手机号**（命中的 `13800138000` 是测试号）
   - 远端文件树与本地逐一比对一致；`.env` / `data/*.json` / `public/uploads/*` 确认不在远端
   - 补了 `.env.example`（仓库里没有 `.env`，clone 后 `cp .env.example .env` 再填）
   - 公开前已脱敏：旧机器路径里的用户名统一替换为 `<原开发者>`（共 20 处），仓库内不含该机器的任何身份信息
6. 转公开：为让旧用户名不出现在任何 commit 里，脱敏后**重建了历史**（单个干净基线提交），仓库改为 public

## 8. 明天从哪继续（待定）

- [ ] **A 先补坑（安全地基）**：登录闸门收敛 + 对话持久化 + 音频清理
- [ ] **B 本地验收**：起服务 + 开可见窗口，你实际点一遍（登录/建角色/克隆/对话）
- [ ] **C 恢复线上**：`changban.xyz` 现在 Cloudflare 返回 **530（源站不可达）**，需要你提供服务器/CF 信息
- [ ] **D 加功能**：支付 / 家人共享 / 后台管理（待你给需求）

## 9. 安全提示

- `.env` 里 4 家密钥都是**活的**（DeepSeek / ElevenLabs / 阿里云 AK+SK / Fish Audio）。如需把项目给别人或迁云，**先轮换**。
- 阿里云 AK 权限建议收敛为仅短信 + 号码认证，且不要开公网白名单。
- `data/*.json` 内含真实手机号，`public/uploads` 内含真人语音样本与头像 —— 都在 `.gitignore` 内，勿打包外发。
- `routes/auth.js:108` 的 `send-code` 会把验证码明文写进 `data/verify-codes.json`（"供管理员查看"），**仅适合自用，上公网前必须改掉**。
