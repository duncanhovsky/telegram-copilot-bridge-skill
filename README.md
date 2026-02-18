# Telegram ↔ VS Code Copilot Bridge Skill

## 环境搭建

### 1) 前置条件

- Node.js 20+
- VS Code（建议 Insiders）+ Copilot Chat（支持 MCP）
- Telegram Bot Token（从 `@BotFather` 获取）

### 2) 安装依赖并构建

```powershell
npm install
npm run build
```

### 3) 配置环境变量

至少需要设置：

- `TELEGRAM_BOT_TOKEN`
- `COPILOT_API_KEY`（或 `GITHUB_TOKEN`，用于自动调用大模型）

可选：

- `HTTP_PROXY`
- `HTTPS_PROXY`
- `NO_PROXY`
- `COPILOT_CHAT_COMPLETIONS_URL`（默认 `https://models.inference.ai.azure.com/chat/completions`）
- `COPILOT_MAX_RETRIES`（默认 `3`）
- `COPILOT_RETRY_BASE_MS`（默认 `600`）
- `COPILOT_TIMEOUT_MS`（默认 `45000`）
- `COPILOT_MIN_INTERVAL_MS`（默认 `1200`，按 `chat_id + topic` 限流）
- `COPILOT_USAGE_LOG_PATH`（默认 `./data/copilot-usage.log`）
- `COPILOT_PRICE_INPUT_PER_1M`（默认 `0`，用于成本估算）
- `COPILOT_PRICE_OUTPUT_PER_1M`（默认 `0`，用于成本估算）

项目默认从 [.vscode/mcp.json](.vscode/mcp.json) 读取配置，其中 Token 建议保持为 `${env:TELEGRAM_BOT_TOKEN}`。

### 4) 启用 MCP 服务

1. 确认 VS Code 工作区包含 [.vscode/mcp.json](.vscode/mcp.json)
2. 执行 `Developer: Reload Window`
3. 在命令面板执行 `MCP: Start Server`，选择 `telegram-copilot-bridge`

---

## 如何使用

### 1) 在 Copilot Chat 调用技能

在 Copilot Chat 中输入：

```text
/telegram-copilot-bridge
```

### 2) 常用 Telegram 命令

- `/start`：查看欢迎信息
- `/topic <name>`：切换话题线程
- `/agent <profile>`：切换话题 Agent
- `/models`：查看可用模型
- `/model <id>`：切换当前话题模型
- `/history <keyword>`：搜索历史
- `/paper`：查看当前论文
- `/ask <问题>`：基于当前论文问答

### 3) 推荐工作流

1. Telegram 发送消息或命令
2. 在 Copilot Chat 执行 `/telegram-copilot-bridge`
3. 技能拉取更新并写入会话
4. 生成回复并回发 Telegram

### 4) 常见问题快速检查

- MCP 一直启动中：先 `npm run build`，再 `Developer: Reload Window` 后重启 MCP
- 工具名告警：已使用下划线工具名（如 `telegram_fetch_updates`）
- Token 相关错误：检查 `TELEGRAM_BOT_TOKEN` 是否已在系统环境变量中生效
