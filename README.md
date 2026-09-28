# Uranus 小手机 · 后端

让 AI 角色用 iMessage 跟你聊天。这是**后端**：一个跑在你自己 Cloudflare 账号上的
Worker，模型密钥、角色、聊天记录都存在这里，别人看不到。

控制台（网页界面）已经托管在 <控制台链接已加密，进审核群 1127727588，（三字社区搜Uranus小手机可以直接获得链接）>，你只需要部署这个后端，然后在控制台里连上它。

不用买服务器，不用一直开着电脑。Cloudflare 免费额度够一个人用。

**图文部署教程**：<https://ccnb9dqqjtkg.feishu.cn/docx/MPKbdvaYqoQEgKxKRUWccioBnyc?edition_id=B80Ihk>

> **声明：禁止倒卖**
>
> Uranus 小手机为免费项目。禁止出售、转卖 Uranus 小手机及 Uranus_Imessage 本体，以及账号密码、访问链接、密钥等相关内容。
>
> 禁止通过「代安装」「代注册」「整合包」等形式进行变相收费。
>
> 禁止未经允许二次分发，禁止套壳 / 二改售卖，禁止恶意破坏 / 攻击，禁止所有商业化。

---

## 部署（一键）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nikonotnicotine/Uranus_Phone)

1. 点上面的按钮，用 GitHub 登录，再登录（或注册）Cloudflare。
2. 设置页上：
   - **URANUS_PASSWORD**：自己编一个后端密钥，至少 8 位、带一个大写字母。
     **记下来**，等会儿连控制台要用，部署完在后台只能改、看不到。
   - **TZ**：你所在的时区。国内填 `Asia/Shanghai`（默认就是）。
   - 其余保持默认。
3. 点 **Create and deploy**，等一两分钟构建完。
4. 部署完会显示后端地址，形如 `https://uranus-xiaoshouji.你的子域.workers.dev`。
   浏览器打开 `这个地址/api/health`，看到 `"ok":true` 就是好了。

## 连上控制台

1. 打开控制台网页：进审核群 1127727588（三字社区搜Uranus小手机可以直接获得链接）。
2. 先登录：用发给你的账号密码，或者用 Discord 登录（要先加入我们的服务器）。
   账号一人一个，别外借、别转卖，发现会停用。
3. **后端地址**填上一步的地址，**后端密钥**填你设的 `URANUS_PASSWORD`，点「连接」。
   这台浏览器记住了，下次打开直接进。
4. 在控制台里：
   - 「连接」：填模型的 API 密钥。
   - 「iMessage」：填 Photon 的 projectId / projectSecret，再填**你自己的手机号**
     （带国家码，比如 `+8613800138000`）去开通线路，拿到一个号码。
   - 「角色」：建个角色，绑上这个号码。
5. 用你的手机给那个号码发 iMessage，角色就会回你。

Photon 的项目凭据到 <https://photon.codes> 注册后在项目设置里拿。

## 常见问题

**忘了后端密钥 / 想换一个**
Cloudflare 后台 → Workers & Pages → 这个 Worker → Settings → Variables and Secrets，
把 `URANUS_PASSWORD` 改掉，点 Deploy。所有连着的浏览器会退回连接页，用新密钥重连。
配置和聊天记录不受影响。

**为什么要密钥**
Worker 地址是公开的。没有这一道，谁拿到地址都能读你的模型密钥和聊天记录。

**角色发语音**
小手机上发语音条要用 **Fish Audio** 或 **ElevenLabs**。MiniMax 和 GPT-SoVITS 在这里
发不成语音条（它们出的格式要 ffmpeg 转，Worker 里没有），会退回成文字。

**以后怎么更新**
一键部署会在你的 GitHub 下复制一份这个仓库。原仓库更新后，在你那份仓库页面点
**Sync fork**（或把新代码合进去），Cloudflare 会自动重新部署。数据都在 Durable Object 里，
更新不会丢。

---

## 手动部署（会用命令行的话）

```bash
git clone https://github.com/nikonotnicotine/Uranus_Phone.git
cd Uranus_Phone
npm install
npx wrangler login
npx wrangler secret put URANUS_PASSWORD
npx wrangler deploy
```

时区在 `wrangler.toml` 的 `[vars] TZ` 里改。

## 目录

- `src/`：Worker 入口，和把桌面版代码搬到 Worker 上用的替身（`src/shims/`）。
- `core/`：桌面版 Uranus 服务端代码的**生成副本**，别直接改。
