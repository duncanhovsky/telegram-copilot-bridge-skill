import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

interface RpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: {
    protocolVersion?: string;
    serverInfo?: {
      name?: string;
      version?: string;
    };
  };
  error?: {
    code: number;
    message: string;
  };
}

const children: Array<ReturnType<typeof spawn>> = [];

afterEach(async () => {
  for (const child of children.splice(0, children.length)) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      setTimeout(resolve, 300);
    });
  }
});

function findHeaderSeparator(buffer: string): number {
  const crlfIndex = buffer.indexOf('\r\n\r\n');
  if (crlfIndex !== -1) {
    return crlfIndex;
  }
  return buffer.indexOf('\n\n');
}

async function readSingleResponse(stdout: NodeJS.ReadableStream): Promise<RpcResponse> {
  let output = '';

  return new Promise<RpcResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for MCP response'));
    }, 5000);

    const onData = (chunk: string | Buffer) => {
      output += chunk.toString();

      const separatorIndex = findHeaderSeparator(output);
      if (separatorIndex === -1) {
        return;
      }

      const separatorLength = output.startsWith('\r\n\r\n', separatorIndex) ? 4 : 2;
      const header = output.slice(0, separatorIndex);
      const contentLengthLine = header
        .split(/\r?\n/)
        .find((line) => line.toLowerCase().startsWith('content-length:'));

      if (!contentLengthLine) {
        cleanup();
        reject(new Error('MCP response missing Content-Length'));
        return;
      }

      const contentLength = Number(contentLengthLine.split(':')[1]?.trim() ?? '0');
      const bodyStart = separatorIndex + separatorLength;
      const bodyEnd = bodyStart + contentLength;

      if (output.length < bodyEnd) {
        return;
      }

      const body = output.slice(bodyStart, bodyEnd);
      cleanup();
      resolve(JSON.parse(body) as RpcResponse);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      stdout.off('data', onData);
      stdout.off('error', onError);
    };

    stdout.on('data', onData);
    stdout.on('error', onError);
  });
}

async function readSingleJsonLineResponse(stdout: NodeJS.ReadableStream): Promise<RpcResponse> {
  let output = '';

  return new Promise<RpcResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for JSONL MCP response'));
    }, 5000);

    const onData = (chunk: string | Buffer) => {
      output += chunk.toString();
      const lineBreakIndex = output.indexOf('\n');
      if (lineBreakIndex === -1) {
        return;
      }

      const line = output.slice(0, lineBreakIndex).trim();
      if (!line) {
        output = output.slice(lineBreakIndex + 1);
        return;
      }

      try {
        const parsed = JSON.parse(line) as RpcResponse;
        cleanup();
        resolve(parsed);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      stdout.off('data', onData);
      stdout.off('error', onError);
    };

    stdout.on('data', onData);
    stdout.on('error', onError);
  });
}

async function runInitializeRequest(
  headerSeparator: '\n\n' | '\r\n\r\n',
  options?: { withToken?: boolean; clientName?: string }
): Promise<{ response: RpcResponse; stderrOutput: string }> {
  const env = {
    ...process.env,
    DB_PATH: path.join(os.tmpdir(), `telegram-copilot-mcp-it-${randomUUID()}.sqlite`)
  };

  if (options?.withToken === false) {
    env.TELEGRAM_BOT_TOKEN = '';
  } else {
    env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? 'test-token';
  }

  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'src/index.ts'],
    {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env
    }
  );
  children.push(child);

  let stderrOutput = '';
  child.stderr.on('data', (chunk) => {
    stderrOutput += chunk.toString();
  });

  const request = {
    jsonrpc: '2.0' as const,
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: options?.clientName ?? 'vitest', version: '1.0.0' }
    }
  };

  const requestBody = JSON.stringify(request);
  const framed = `Content-Length: ${Buffer.byteLength(requestBody, 'utf8')}${headerSeparator}${requestBody}`;

  child.stdin.write(framed);

  const response = await readSingleResponse(child.stdout);
  return { response, stderrOutput };
}

describe('mcpServer integration', () => {
  it('responds to initialize when request header uses LF separators', async () => {
    const { response, stderrOutput } = await runInitializeRequest('\n\n');

    if (response.error) {
      throw new Error(`Unexpected MCP error: ${response.error.message}`);
    }

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result?.protocolVersion).toBe('2024-11-05');
    expect(response.result?.serverInfo?.name).toBe('telegram-copilot-bridge');
    expect(stderrOutput).toBe('');
  });

  it('responds to initialize when request header uses CRLF separators', async () => {
    const { response, stderrOutput } = await runInitializeRequest('\r\n\r\n');

    if (response.error) {
      throw new Error(`Unexpected MCP error: ${response.error.message}`);
    }

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result?.protocolVersion).toBe('2024-11-05');
    expect(response.result?.serverInfo?.name).toBe('telegram-copilot-bridge');
    expect(stderrOutput).toBe('');
  });

  it('responds to initialize even when TELEGRAM_BOT_TOKEN is missing', async () => {
    const { response } = await runInitializeRequest('\n\n', { withToken: false });

    if (response.error) {
      throw new Error(`Unexpected MCP error: ${response.error.message}`);
    }

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result?.protocolVersion).toBe('2024-11-05');
    expect(response.result?.serverInfo?.name).toBe('telegram-copilot-bridge');
  });

  it('responds to initialize when payload contains multibyte UTF-8 chars', async () => {
    const { response } = await runInitializeRequest('\n\n', { clientName: '测试客户端' });

    if (response.error) {
      throw new Error(`Unexpected MCP error: ${response.error.message}`);
    }

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result?.protocolVersion).toBe('2024-11-05');
    expect(response.result?.serverInfo?.name).toBe('telegram-copilot-bridge');
  });

  it('responds to bare JSON initialize request (jsonl transport)', async () => {
    const env = {
      ...process.env,
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? 'test-token',
      DB_PATH: path.join(os.tmpdir(), `telegram-copilot-mcp-it-${randomUUID()}.sqlite`)
    };

    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'src/index.ts'],
      {
        cwd: path.resolve(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe'],
        env
      }
    );
    children.push(child);

    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'jsonl-client', version: '1.0.0' }
      }
    };

    child.stdin.write(`${JSON.stringify(request)}\n`);
    const response = await readSingleJsonLineResponse(child.stdout);

    if (response.error) {
      throw new Error(`Unexpected MCP error: ${response.error.message}`);
    }

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result?.protocolVersion).toBe('2024-11-05');
    expect(response.result?.serverInfo?.name).toBe('telegram-copilot-bridge');
  });
});
