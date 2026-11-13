const assert = require('assert').strict;
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');
const vm = require('vm');
const express = require('express');
const { createHealthMonitor, loadUrls, requestUrl } = require('../services/health-monitor');
const createHealthRoutes = require('../routes/health');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const entry = (host, name = 'Service', category = '2026') => ({ host, name, category });

async function fixture(fn) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'extension-health-test-'));
  async function write(name, data) {
    await fs.writeFile(path.join(directory, name), JSON.stringify(data), 'utf8');
  }
  await write('data.json', { urls: [entry('https://one.example'), entry('https://two.example')] });
  await write('additional_data.json', { urls: [] });
  await write('ignore_urls.json', { data: [] });
  await write('pending_urls.json', { data: [] });
  try {
    await fn(directory, write);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return 'http://127.0.0.1:' + server.address().port;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('merge, additional override, normalized ignore and exact path matching', () => fixture(async (directory, write) => {
  await write('additional_data.json', { urls: [
    entry('https://one.example/', 'Override', 'other'),
    entry('https://two.example/path', 'Path'),
  ] });
  await write('ignore_urls.json', { data: ['https://two.example/#fragment'] });
  const urls = await loadUrls(directory);
  assert.deepEqual(urls, [
    { ...entry('https://one.example/', 'Override', 'other'), type: 'additional' },
    { ...entry('https://two.example/path', 'Path'), type: 'additional' },
  ]);
}));

test('invalid input and missing files are reported, not silently ignored', () => fixture(async (directory, write) => {
  await write('additional_data.json', { urls: [entry('file:///secret')] });
  await assert.rejects(loadUrls(directory), /HTTP/);
  await write('additional_data.json', { urls: [] });
  await write('ignore_urls.json', { urls: [] });
  await assert.rejects(loadUrls(directory), /array named "data"/);
  await fs.unlink(path.join(directory, 'ignore_urls.json'));
  await assert.rejects(loadUrls(directory), /ENOENT/);
  await write('ignore_urls.json', { data: [] });
  await write('pending_urls.json', { urls: [] });
  await assert.rejects(loadUrls(directory), /pending_urls\.json.*array named "data"/);
  await write('pending_urls.json', { data: ['file:///invalid'] });
  await assert.rejects(loadUrls(directory), /HTTP/);
  await fs.unlink(path.join(directory, 'pending_urls.json'));
  await assert.rejects(loadUrls(directory), /ENOENT.*pending_urls\.json/);
}));

test('ignore and pending match trailing slashes in both directions without changing request URLs', () => fixture(async (directory, write) => {
  const kept = [
    entry('https://kept.example/path/'),
    entry('https://path-normal.example/path/child'),
    entry('https://path-normal.example/path?different=1'),
    entry('https://query-value.example/path?next=/'),
  ];
  for (const filename of ['ignore_urls.json', 'pending_urls.json']) {
    for (const exclusionHasSlash of [false, true]) {
      const collectedSlash = exclusionHasSlash ? '' : '/';
      const excludedSlash = exclusionHasSlash ? '/' : '';
      await write('data.json', { urls: [
        entry('https://root-normal.example' + collectedSlash),
        entry('https://path-normal.example/path' + collectedSlash),
        entry('https://query.example/path' + collectedSlash + '?mode=1#collected'),
        ...kept,
      ] });
      await write('additional_data.json', { urls: [
        entry('https://root-additional.example' + collectedSlash),
        entry('https://path-additional.example/path' + collectedSlash),
      ] });
      await write('ignore_urls.json', { data: [] });
      await write('pending_urls.json', { data: [] });
      await write(filename, { data: [
        'https://root-normal.example' + excludedSlash,
        'https://path-normal.example/path' + excludedSlash,
        'https://query.example/path' + excludedSlash + '?mode=1#excluded',
        'https://root-additional.example' + excludedSlash,
        'https://path-additional.example/path' + excludedSlash,
        'https://query-value.example/path?next=',
      ] });
      assert.deepEqual(await loadUrls(directory), kept.map(item => ({ ...item, type: 'normal' })));
    }
  }
}));

test('pending projects are not probed and removing an entry restores monitoring', () => fixture(async (directory, write) => {
  const calls = [];
  await write('pending_urls.json', { data: ['https://one.example/'] });
  const pendingFile = path.join(directory, 'pending_urls.json');
  const pendingContents = await fs.readFile(pendingFile, 'utf8');
  const monitor = createHealthMonitor({
    directory, delayMs: 0,
    probe: async host => { calls.push(host); return { statusCode: 200, finalUrl: host }; },
  });
  await monitor.run();
  assert.deepEqual(calls, ['https://two.example/']);
  assert.equal((await monitor.getStatus()).total, 1);
  assert.equal(await fs.readFile(pendingFile, 'utf8'), pendingContents);
  await write('pending_urls.json', { data: [] });
  const restored = await monitor.getStatus();
  assert.equal(restored.total, 2);
  assert.equal(restored.pendingCount, 1);
  await monitor.run();
  assert.deepEqual(calls, ['https://two.example/', 'https://one.example/', 'https://two.example/']);
  assert.equal((await monitor.getStatus()).healthyCount, 2);
}));

test('retry once, delay every subsequent request, persist results and expose errors', () => fixture(async directory => {
  const calls = [];
  const waits = [];
  const monitor = createHealthMonitor({
    directory,
    wait: async ms => waits.push(ms),
    probe: async host => {
      calls.push(host);
      if (host.includes('one') && calls.length === 1) throw new Error('Temporary failure');
      if (host.includes('two')) throw Object.assign(new Error('HTTP 503'), { statusCode: 503 });
      return { statusCode: 200, finalUrl: host };
    },
  });
  const result = await monitor.run();
  assert.equal(result.checking, false);
  assert.equal(result.errorCount, 1);
  assert.equal(result.healthyCount, 1);
  assert.equal(result.urls[0].attempts, 2);
  assert.equal(result.urls[1].attempts, 2);
  assert.equal(result.urls[1].statusCode, 503);
  assert.equal(result.state, 'error');
  assert.deepEqual(waits, [2000, 2000, 2000]);
  assert.deepEqual(calls, ['https://one.example/', 'https://one.example/', 'https://two.example/', 'https://two.example/']);
  const saved = JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8'));
  assert.equal(saved.checking, false);
  assert.equal(saved.errorCount, 1);
  assert.equal(saved.urls.length, 2);
  await assert.rejects(fs.stat(path.join(directory, 'result.json.tmp')), /ENOENT/);
}));

test('prevent overlapping scans and expose progress', () => fixture(async directory => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const monitor = createHealthMonitor({
    directory, delayMs: 0,
    probe: async host => { calls++; await blocked; return { statusCode: 200, finalUrl: host }; },
  });
  const first = monitor.run();
  assert.equal(first, monitor.run());
  const status = await monitor.getStatus();
  assert.equal(status.checking, true);
  assert.equal(status.state, 'unknown');
  release();
  await first;
  assert.equal(calls, 2);
  assert.equal((await monitor.getStatus()).checking, false);
}));

test('current configuration is reflected without probing; new URLs stay pending', () => fixture(async (directory, write) => {
  const monitor = createHealthMonitor({ directory, delayMs: 0, probe: async host => ({ statusCode: 200, finalUrl: host }) });
  await monitor.run();
  await write('additional_data.json', { urls: [entry('https://new.example')] });
  await write('ignore_urls.json', { data: ['https://one.example'] });
  const status = await monitor.getStatus();
  assert.equal(status.total, 2);
  assert.equal(status.pendingCount, 1);
  assert.equal(status.state, 'unknown');
  await write('ignore_urls.json', { data: [] });
  await fs.writeFile(path.join(directory, 'data.json'), 'invalid json');
  const broken = await monitor.getStatus();
  assert.ok(broken.configurationError);
  assert.equal(broken.state, 'unknown');
}));

test('start checks immediately, schedules and recovers from malformed persisted JSON', () => fixture(async directory => {
  await fs.writeFile(path.join(directory, 'result.json'), '{');
  let calls = 0;
  const monitor = createHealthMonitor({
    directory, delayMs: 0,
    probe: async host => { calls++; return { statusCode: 200, finalUrl: host }; },
  });
  try {
    await monitor.start();
    const status = await monitor.getStatus();
    assert.equal(calls, 2);
    assert.equal(status.intervalMs, 10800000);
    assert.ok(Date.parse(status.nextCheckAt) > Date.now());
    assert.equal(status.state, 'healthy');
    await monitor.start();
    assert.equal(calls, 2);
  } finally {
    monitor.stop();
  }
}));

test('timer reruns scans and reloads updated files', () => fixture(async (directory, write) => {
  let observed;
  let deadline;
  const checked = new Promise(resolve => { observed = resolve; });
  const monitor = createHealthMonitor({
    directory, intervalMs: 40, delayMs: 0,
    probe: async host => {
      if (host.includes('new')) observed();
      return { statusCode: 200, finalUrl: host };
    },
  });
  try {
    await monitor.start();
    await write('data.json', { urls: [entry('https://new.example')] });
    await Promise.race([
      checked,
      new Promise((resolve, reject) => {
        deadline = setTimeout(() => reject(new Error('Timer did not run')), 1000);
      }),
    ]);
    await monitor.run();
    assert.equal((await monitor.getStatus()).urls[0].host, 'https://new.example/');
  } finally {
    clearTimeout(deadline);
    monitor.stop();
  }
}));

test('persistence errors are surfaced as monitor failure', () => fixture(async directory => {
  await fs.mkdir(path.join(directory, 'result.json'));
  const monitor = createHealthMonitor({
    directory, delayMs: 0, probe: async host => ({ statusCode: 200, finalUrl: host }),
  });
  await monitor.run();
  const status = await monitor.getStatus();
  assert.ok(status.monitorError);
  assert.equal(status.state, 'unknown');
}));

test('restore previous results while scanning and flag results older than six hours', () => fixture(async directory => {
  const first = createHealthMonitor({ directory, delayMs: 0, probe: async host => ({ statusCode: 200, finalUrl: host }) });
  await first.run();
  const saved = JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8'));
  saved.lastCompletedAt = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
  await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(saved));
  let release;
  let ready;
  const blocked = new Promise(resolve => { release = resolve; });
  const probing = new Promise(resolve => { ready = resolve; });
  const monitor = createHealthMonitor({
    directory, delayMs: 0,
    probe: async host => { ready(); await blocked; return { statusCode: 200, finalUrl: host }; },
  });
  const startup = monitor.start();
  try {
    await probing;
    const status = await monitor.getStatus();
    assert.equal(status.healthyCount, 2);
    assert.equal(status.checking, true);
    assert.equal(status.stale, true);
    assert.equal(status.state, 'unknown');
    release();
    await startup;
    assert.equal((await monitor.getStatus()).state, 'healthy');
  } finally {
    release();
    await startup;
    monitor.stop();
  }
}));

test('HTTP success, redirects, failures, loops, timeout and refused connection', async () => {
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/ok' }); res.end(); }
    else if (req.url === '/loop') { res.writeHead(301, { Location: '/loop' }); res.end(); }
    else if (req.url === '/failure') { res.writeHead(500); res.end(); }
    else if (req.url !== '/timeout') { res.writeHead(200); res.end('OK'); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  const base = await listen(server);
  try {
    assert.equal((await requestUrl(base + '/ok')).statusCode, 200);
    assert.equal((await requestUrl(base + '/redirect')).finalUrl, base + '/ok');
    await assert.rejects(requestUrl(base + '/failure'), /HTTP 500/);
    await assert.rejects(requestUrl(base + '/loop'), /Too many redirects/);
    await assert.rejects(requestUrl(base + '/timeout', 30), /timed out/);
  } finally {
    for (const socket of sockets) socket.destroy();
    await close(server);
  }
  await assert.rejects(requestUrl(base + '/ok'), /ECONNREFUSED/);
});

test('HTTP and HTTPS work with the legacy options/listener overload', async () => {
  const originalHttpGet = http.get;
  const originalHttpsGet = https.get;
  const requests = [];
  function legacyGet(options, listener) {
    const request = new EventEmitter();
    if (listener !== undefined) request.once('response', listener);
    requests.push(options);
    request.destroy = error => request.emit('error', error);
    process.nextTick(() => request.emit('response', {
      statusCode: 200, headers: {}, destroy() {},
    }));
    return request;
  }
  http.get = legacyGet;
  https.get = legacyGet;
  try {
    for (const protocol of ['http:', 'https:']) {
      const result = await requestUrl(protocol + '//Example.COM:8443/path?q=1#fragment');
      assert.equal(result.statusCode, 200);
      assert.equal(result.finalUrl, protocol + '//example.com:8443/path?q=1');
      const options = requests[requests.length - 1];
      assert.equal(options.protocol, protocol);
      assert.equal(options.hostname, 'example.com');
      assert.equal(options.port, '8443');
      assert.equal(options.path, '/path?q=1');
      assert.equal(options.headers['User-Agent'], 'ExtensionHealthCheck/1.0');
    }
    await requestUrl('https://[::1]:8443/path');
    assert.equal(requests[requests.length - 1].hostname, '::1');
  } finally {
    http.get = originalHttpGet;
    https.get = originalHttpsGet;
  }
});

test('homepage, API, static files and errors forbid indexing without affecting access', () => fixture(async (directory, write) => {
  let probes = 0;
  const monitor = createHealthMonitor({
    directory, delayMs: 0,
    probe: async host => { probes++; return { statusCode: 200, finalUrl: host }; },
  });
  await monitor.run();
  const app = express();
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('view engine', 'ejs');
  app.use(require('../routes/robots'));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(createHealthRoutes(monitor));
  app.use(require('../routes/index'));
  const server = http.createServer(app);
  const base = await listen(server);
  const address = new URL(base);
  const robotsPolicy = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
  async function get(url, method = 'GET') {
    return new Promise((resolve, reject) => {
      http.get({ hostname: address.hostname, port: address.port, path: url, method }, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ code: res.statusCode, headers: res.headers, body }));
        res.on('error', reject);
      }).on('error', reject);
    });
  }
  try {
    const response = await get('/api/status');
    assert.equal(response.code, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-robots-tag'], robotsPolicy);
    assert.equal(JSON.parse(response.body).hasErrors, false);
    const page = await get('/');
    assert.equal(page.code, 200);
    assert.equal(page.headers['cache-control'], 'no-store');
    assert.equal(page.headers['x-robots-tag'], robotsPolicy);
    assert.match(page.body, /<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">/);
    assert.match(page.body, /health-status.js/);
    assert.doesNotMatch(page.body, /<button\b|id="refresh"/);
    const missing = await get('/status');
    assert.equal(missing.code, 404);
    assert.equal(missing.headers['x-robots-tag'], robotsPolicy);
    const asset = await get('/javascripts/health-status.js');
    assert.equal(asset.code, 200);
    assert.equal(asset.headers['x-robots-tag'], robotsPolicy);
    const robots = await get('/robots.txt');
    assert.equal(robots.code, 200);
    assert.equal(robots.body, 'User-agent: *\nDisallow: /\n');
    assert.match(robots.headers['content-type'], /^text\/plain/);
    assert.equal(robots.headers['cache-control'], 'no-store');
    assert.equal(robots.headers['x-robots-tag'], robotsPolicy);
    const head = await get('/robots.txt', 'HEAD');
    assert.equal(head.code, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['x-robots-tag'], robotsPolicy);
    await Promise.all([get('/'), get('/'), get('/api/status'), get('/api/status')]);
    assert.equal(probes, 2);
    await assert.rejects(fs.stat(path.join(__dirname, '..', 'views', 'health-status.ejs')), /ENOENT/);
    await write('data.json', { invalid: [] });
    const unavailable = await get('/api/status');
    assert.equal(unavailable.code, 503);
    assert.equal(unavailable.headers['x-robots-tag'], robotsPolicy);
    assert.equal(JSON.parse(unavailable.body).state, 'unknown');
  } finally {
    await close(server);
  }
}));

test('dashboard loads and auto-updates without a manual refresh element', async () => {
  const ids = ['search', 'type-filter', 'status-filter', 'services', 'empty',
    'total', 'healthy', 'errors', 'pending', 'progress', 'completed', 'next', 'notice'];
  const elements = new Map(ids.map(id => [id, {
    value: '', addEventListener() {}, replaceChildren() {},
  }]));
  let requests = 0;
  let interval;
  const source = await fs.readFile(path.join(__dirname, '..', 'public', 'javascripts', 'health-status.js'), 'utf8');
  vm.runInNewContext(source, {
    AbortController,
    document: {
      getElementById(id) {
        assert.ok(elements.has(id), 'Unexpected DOM lookup: ' + id);
        return elements.get(id);
      },
      createDocumentFragment: () => ({}),
    },
    fetch: async url => {
      assert.equal(url, '/api/status');
      requests++;
      return { ok: true, json: async () => ({
        urls: [], total: 0, healthyCount: 0, errorCount: 0, pendingCount: 0,
        checking: false, state: 'healthy',
      }) };
    },
    window: {
      setTimeout, clearTimeout,
      setInterval(fn, delay) { interval = { fn, delay }; },
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 1);
  assert.equal(interval.delay, 30000);
  assert.equal(elements.get('notice').className, 'notice healthy');
  await interval.fn();
  assert.equal(requests, 2);
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log('PASS ' + name);
  }
  console.log('Passed ' + tests.length + ' health-monitor tests.');
})().catch(error => { console.error(error); process.exitCode = 1; });
