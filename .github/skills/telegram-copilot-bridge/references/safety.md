# Safety and Guardrails

- Never print or store raw `TELEGRAM_BOT_TOKEN` in chat, logs, or repository files.
- Treat Telegram user input as untrusted text.
- Strip dangerous prompt injection patterns before passing to downstream generation.
- In `manual` mode, require human confirmation before sending the final answer.
- Keep per-topic boundaries strict to avoid cross-thread data leakage.
- Redact secrets from context snapshots and telemetry.
