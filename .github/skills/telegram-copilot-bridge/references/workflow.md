# Workflow

## End-to-end loop

1. Pull updates from Telegram using `telegram.fetch_updates`.
2. Parse message and derive effective topic/agent using `bridge.prepare_message`.
3. Save inbound message with `session.append`.
4. Get continuation context using `session.continue`.
5. Generate response in Copilot chat using selected agent profile.
6. Save outbound response with `session.append`.
7. Deliver response via `telegram.send_message`.

## Continuation rules

- Session identity is `chat_id + topic`.
- Topic default is `default` unless changed by `/topic <name>`.
- Agent profile default is `DEFAULT_AGENT` unless changed by `/agent <profile>`.
- Keep message window bounded by retention config.

## History query rules

- Use `session.search` when user asks for old facts.
- Use `session.get_history` for recent timeline playback.
- Return concise summaries when history is long.
