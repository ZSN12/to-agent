# GitHub MCP 浏览器登录（OAuth）

插件市场的 **GitHub** 集成使用 Copilot 托管 MCP：`https://api.githubcopilot.com/mcp/`。推荐通过 **PKCE 浏览器授权** 获取访问令牌；无法使用本机回调时自动回退 **Device Flow**。

## 推荐：直接点「连接 GitHub」（无需先配 OAuth App）

1. 本机安装 [GitHub CLI](https://cli.github.com/) 并登录：

```bash
gh auth login
```

2. 回到 TaskWeaver → 插件 → **连接 GitHub** → 点 **连接 GitHub**。  
   应用会读取 `gh auth token` 并连接 Copilot 托管 MCP（与 VS Code 的 PAT 路径类似）。

若已设置 `GH_TOKEN` / `GITHUB_TOKEN`，也会自动使用。

## 可选：自建 OAuth App（浏览器授权，不依赖 gh）

1. 打开 [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)，**New OAuth App**。
2. **Authorization callback URL** 填：`http://127.0.0.1/callback`（或 `http://localhost/callback`；本机使用随机端口，GitHub 对 loopback 不强制端口一致）。
3. 记下 **Client ID**；生成 **Client secret**（PKCE 兑换时通常需要）。
4. 在启动 TaskWeaver **之前** 设置环境变量（也可写入 shell 配置或 `launchd` / `.env` 由你自行加载）：

```bash
export TASKWEAVER_GITHUB_OAUTH_CLIENT_ID="Ov23xxxxxxxx"
export TASKWEAVER_GITHUB_OAUTH_CLIENT_SECRET="xxxxxxxx"   # 若应用要求
```

5. 重启 TaskWeaver → 插件 → 连接 GitHub → **在浏览器中登录 GitHub**。

> 官方 `github-mcp-server` 二进制内嵌的 OAuth 凭据**不会**出现在开源仓库中；TaskWeaver 使用自有 OAuth App，与 VS Code 内置客户端无关。

## 高级：Personal Access Token

弹窗内 **高级：使用 Personal Access Token** 仍可用；行为与旧版一致，凭据加密存入本机 `taskweaver-mcp.json`。

## 组织策略

企业/组织可能限制 Remote MCP 或 OAuth scope；若浏览器登录成功但 MCP 连接失败，可改用 PAT 或联系管理员放行 Copilot MCP 策略。
