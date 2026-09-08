const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function waitForServer(child, output, port) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Mineradio server startup timeout:\n${output.text}`)), 8000);
    const onData = (chunk) => {
      output.text += chunk.toString();
      if (!output.text.includes(`http://localhost:${port}`)) return;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      resolve();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Mineradio server exited during startup (${code}):\n${output.text}`));
    });
  });
}

function requestUntilClosed(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Audio proxy request did not close')), 5000);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    const req = http.get(url, (res) => {
      res.resume();
      res.once('aborted', finish);
      res.once('close', finish);
      res.once('end', finish);
      res.once('error', finish);
    });
    req.once('error', finish);
  });
}

function requestStatus(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.once('end', () => resolve(res.statusCode));
    });
    req.once('error', reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('上游音频中断后不会重复写响应头或退出本地服务', async () => {
  const upstream = http.createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': 1024 * 1024,
    });
    res.write(Buffer.alloc(4096, 1));
    setTimeout(() => res.socket?.destroy(), 30);
  });
  const upstreamPort = await listen(upstream);

  const portProbe = http.createServer();
  const appPort = await listen(portProbe);
  await close(portProbe);

  const output = { text: '' };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(appPort),
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      ALL_PROXY: '',
      NO_PROXY: '127.0.0.1,localhost',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const collect = (chunk) => { output.text += chunk.toString(); };
  try {
    await waitForServer(child, output, appPort);
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const upstreamUrl = `http://127.0.0.1:${upstreamPort}/broken.mp3`;
    await requestUntilClosed(`http://127.0.0.1:${appPort}/api/audio?url=${encodeURIComponent(upstreamUrl)}`);
    await delay(250);

    assert.equal(child.exitCode, null, `本地服务不应退出:\n${output.text}`);
    assert.doesNotMatch(output.text, /ERR_HTTP_HEADERS_SENT/, output.text);
    assert.equal(
      await requestStatus(`http://127.0.0.1:${appPort}/api/audio`),
      400,
      '中断后本地服务仍应能处理新请求',
    );
  } finally {
    child.kill('SIGTERM');
    await close(upstream);
  }
});
