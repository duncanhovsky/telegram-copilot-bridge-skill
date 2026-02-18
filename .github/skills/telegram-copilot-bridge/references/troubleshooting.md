# Troubleshooting

## MCP server not listed

- Ensure dependencies are installed and project is built.
- Verify `.vscode/mcp.json` points to `dist/index.js`.
- Restart VS Code window.

## Telegram updates always empty

- Verify bot token and bot privacy mode.
- Send a new message after server start.
- Confirm network can reach `https://api.telegram.org`.

## History cannot continue

- Verify DB path is writable.
- Check that topic name matches expected thread.
- Ensure retention rules did not prune old turns.

## Duplicate replies

- Track and persist Telegram update offsets.
- Do not process the same `update_id` twice.
