import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('demo-embedded smoke test', () => {
  it('starts and shuts down without errors', async () => {
    const scriptPath = path.resolve(__dirname, '../dist/index.js');

    // Spawn the demo process with custom ports to avoid conflicts
    const restPort = 8899;
    const opcuaPort = 48999;

    const child = spawn('node', [
      scriptPath,
      '--rest-port',
      String(restPort),
      '--opcua-port',
      String(opcuaPort),
      '--api-key',
      'smoke-test-secret-key',
    ]);

    let output = '';
    child.stdout?.on('data', (data) => {
      output += data.toString();
    });
    child.stderr?.on('data', (data) => {
      output += data.toString();
    });

    // Detect early crash — if child exits before health check succeeds
    let childExited = false;
    let childExitCode: number | null = null;
    child.on('exit', (code) => {
      childExited = true;
      childExitCode = code;
    });

    const maxAttempts = 120;
    let success = false;

    // Poll the health endpoint
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Bail early if the child process crashed
      if (childExited) {
        console.error(
          `Smoke test child exited early with code ${childExitCode}.\n` +
            `Process output:\n${output}`,
        );
        break;
      }

      try {
        const res = await fetch(`http://127.0.0.1:${restPort}/health`);
        if (res.ok) {
          const body = (await res.json()) as any;
          if (body.status === 'ok') {
            success = true;
            break;
          }
        }
      } catch (_err) {
        // Ignore and retry
      }
    }

    // Terminate the child process
    child.kill('SIGTERM');

    // Wait for child process to exit (with a safety timeout)
    if (!childExited) {
      await Promise.race([
        new Promise<void>((resolve) => {
          child.on('exit', () => resolve());
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    }

    if (!success) {
      console.error('Smoke test process output:\n', output);
    }

    expect(success).toBe(true);
  }, 90_000);
});
