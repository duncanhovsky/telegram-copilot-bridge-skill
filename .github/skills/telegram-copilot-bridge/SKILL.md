---
name: telegram-copilot-bridge
description: 'Bridge Telegram bot conversations to VS Code Copilot using MCP tools. Use when you need to receive Telegram messages, continue chat history by chat_id and topic, choose or switch Copilot agent profile, and send Copilot replies back to Telegram.'
argument-hint: 'mode=<manual|auto> chat_id=<id> topic=<name> agent=<profile> action=<sync|history|continue|reply>'
user-invocable: true
disable-model-invocation: false
---

# Telegram Copilot Bridge

Use this skill to operate a Telegram bot as a conversation channel for VS Code Copilot.

## Commands in Telegram

- `/topic <name>`: switch or create a topic under current `chat_id`.
- `/agent <profile>`: switch Copilot agent profile for current topic.
- `/history <keyword>`: query history (handled by this skill with `session.search`).

## Required MCP tools

- `telegram.fetch_updates`
- `telegram.send_message`
- `session.append`
- `session.get_history`
- `session.search`
- `session.list_threads`
- `session.continue`
- `bridge.prepare_message`
- `bridge.get_offset`
- `bridge.set_offset`

## Procedure

1. Read last offset using `bridge.get_offset`, then fetch latest updates using `telegram.fetch_updates`.
2. For each update message:
   - Call `bridge.prepare_message` with `chatId`, `text`, and optional `topic`.
   - If command is `/topic` or `/agent`, persist by writing a system message through `session.append` and send confirmation via `telegram.send_message`.
   - Otherwise append user content with `session.append`.
3. Build context:
   - Use `session.continue` for full continuation in current `chat_id + topic`.
   - Use `session.search` when message asks to query old content.
4. Generate Copilot response using selected `agent` and context summary.
5. Save assistant reply through `session.append` and send it via `telegram.send_message`.
6. Persist next offset using `bridge.set_offset`.

## Mode behavior

- `manual`: draft reply only and wait for user confirmation before sending.
- `auto`: send reply immediately after generation.
- Telegram command `/mode <manual|auto>` changes current execution mode.

## Agent customization

- Keep default agent from environment `DEFAULT_AGENT`.
- Override per topic with `/agent <profile>`.
- Always persist selected profile in session messages for reproducible continuation.

## History and continuation

- Primary session key: `chat_id + topic`.
- Use `session.list_threads` to list existing topics.
- Use `session.get_history` to retrieve recent turns.
- Use `session.continue` to continue an existing thread with summary.

## References

- [Workflow details](./references/workflow.md)
- [Safety and guardrails](./references/safety.md)
- [Troubleshooting](./references/troubleshooting.md)
- [PowerShell runbook](./scripts/runbook.ps1)
