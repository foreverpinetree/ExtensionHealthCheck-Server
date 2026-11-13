const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');
const { parse: parseUrl } = require('url');

const CHECK_INTERVAL = 3 * 60 * 60 * 1000;
const REQUEST_DELAY = 2000;
const REQUEST_TIMEOUT = 15000;

function normalizeUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('URL must use HTTP(S) without credentials: ' + value);
  }
  url.hash = '';
  return url.href;
}

async function loadUrls(directory) {
  async function readList(filename, key) {
    const data = JSON.parse(await fs.readFile(path.join(directory, filename), 'utf8'));
    if (!data || !Array.isArray(data[key])) {
      throw new Error(filename + ' must contain an array named "' + key + '"');
    }
    return data[key];
  }

  const normal = await readList('data.json', 'urls');
  const additional = await readList('additional_data.json', 'urls');
  const ignored = new Set((await readList('ignore_urls.json', 'data')).map(normalizeUrl));
  const urls = new Map();
  for (const [type, entries] of [['normal', normal], ['additional', additional]]) {
    for (const entry of entries) {
      if (!entry || typeof entry.host !== 'string' || typeof entry.name !== 'string' ||
          !entry.name.trim() || typeof entry.category !== 'string') {
        throw new Error('Invalid URL entry in ' + type + ' data');
      }
      const host = normalizeUrl(entry.host);
      if (!ignored.has(host)) {
        urls.set(host, { name: entry.name, host, category: entry.category, type });
      }
    }
  }
  return Array.from(urls.values());
}

function requestUrl(value, timeoutMs = REQUEST_TIMEOUT, redirects = 5) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = normalizeUrl(value);
    } catch (error) {
      reject(error);
      return;
    }
    const transport = url.startsWith('https:') ? https : http;
    const started = Date.now();
    const request = transport.get({
      ...parseUrl(url),
      headers: { 'User-Agent': 'ExtensionHealthCheck/1.0', Accept: 'text/html,*/*' },
    });
    const timer = setTimeout(() => request.destroy(new Error('Request timed out')), timeoutMs);
    request.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    request.on('response', response => {
      clearTimeout(timer);
      const statusCode = response.statusCode;
      const location = response.headers.location;
      // Only response headers are needed; do not download entire pages or streams.
      response.destroy();
      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        const remaining = timeoutMs - (Date.now() - started);
        if (redirects === 0 || remaining <= 0) {
          reject(new Error(redirects === 0 ? 'Too many redirects' : 'Request timed out'));
          return;
        }
        let destination;
        try {
          destination = new URL(location, url).href;
        } catch (error) {
          reject(error);
          return;
        }
        requestUrl(destination, remaining, redirects - 1).then(resolve, reject);
      } else if (statusCode >= 200 && statusCode < 300) {
        resolve({ statusCode, finalUrl: url });
      } else {
        const error = new Error('HTTP ' + statusCode);
        error.statusCode = statusCode;
        reject(error);
      }
    });
  });
}

function createHealthMonitor(options = {}) {
  const directory = options.directory || path.join(__dirname, '..', 'urls');
  const intervalMs = options.intervalMs || CHECK_INTERVAL;
  const delayMs = options.delayMs === undefined ? REQUEST_DELAY : options.delayMs;
  const probe = options.probe || requestUrl;
  const wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const resultFile = path.join(directory, 'result.json');
  let urls = [];
  let results = new Map();
  let lastStartedAt = null;
  let lastCompletedAt = null;
  let nextCheckAt = null;
  let monitorError = null;
  let configurationError = null;
  let activeRun = null;
  let timer = null;
  let started = false;

  function snapshot(entries = urls) {
    const rows = entries.map(entry => ({
      ...entry,
      ...(results.get(entry.host) || {
        status: 'pending', checkedAt: null, durationMs: null, attempts: 0,
        statusCode: null, error: null, finalUrl: null,
      }),
    }));
    const errorCount = rows.filter(entry => entry.status === 'error').length;
    const healthyCount = rows.filter(entry => entry.status === 'healthy').length;
    const pendingCount = rows.length - errorCount - healthyCount;
    const stale = !lastCompletedAt || Date.now() - Date.parse(lastCompletedAt) > intervalMs * 2;
    const unavailable = !!(monitorError || configurationError || stale || pendingCount);
    return {
      state: unavailable ? 'unknown' : errorCount ? 'error' : 'healthy',
      hasErrors: errorCount > 0,
      total: rows.length, errorCount, healthyCount, pendingCount,
      checking: activeRun !== null, stale, monitorError, configurationError,
      lastStartedAt, lastCompletedAt, nextCheckAt, intervalMs, urls: rows,
    };
  }

  async function getStatus() {
    try {
      urls = await loadUrls(directory);
      configurationError = null;
    } catch (error) {
      if (configurationError !== error.message) console.error('[health] Configuration:', error);
      configurationError = error.message;
    }
    return snapshot();
  }

  async function persist(targets) {
    const temporaryFile = resultFile + '.tmp';
    await fs.writeFile(temporaryFile, JSON.stringify({ ...snapshot(targets), checking: false }, null, 2) + '\n', 'utf8');
    await fs.rename(temporaryFile, resultFile);
  }

  async function checkAll() {
    lastStartedAt = new Date().toISOString();
    try {
      const targets = await loadUrls(directory);
      urls = targets;
      configurationError = null;
      let firstRequest = true;
      for (const entry of targets) {
        let result;
        for (let attempt = 1; attempt <= 2; attempt++) {
          if (!firstRequest) await wait(delayMs);
          firstRequest = false;
          const startedAt = Date.now();
          try {
            const response = await probe(entry.host);
            result = {
              status: 'healthy', checkedAt: new Date().toISOString(),
              durationMs: Date.now() - startedAt, attempts: attempt,
              statusCode: response.statusCode, finalUrl: response.finalUrl, error: null,
            };
            break;
          } catch (error) {
            result = {
              status: 'error', checkedAt: new Date().toISOString(),
              durationMs: Date.now() - startedAt, attempts: attempt,
              statusCode: error.statusCode || null, finalUrl: null, error: error.message,
            };
            console.error('[health] Attempt ' + attempt + ' failed for ' + entry.host + ': ' + error.message);
          }
        }
        results.set(entry.host, result);
      }
      results = new Map(targets.map(entry => [entry.host, results.get(entry.host)]));
      lastCompletedAt = new Date().toISOString();
      monitorError = null;
      await persist(targets);
    } catch (error) {
      monitorError = error.message;
      console.error('[health] Check failed:', error);
    }
    return snapshot();
  }

  function run() {
    if (activeRun) return activeRun;
    activeRun = checkAll().finally(() => { activeRun = null; }).then(() => snapshot());
    return activeRun;
  }

  async function start() {
    if (started) return;
    started = true;
    try {
      const saved = JSON.parse(await fs.readFile(resultFile, 'utf8'));
      if (!Number.isFinite(Date.parse(saved.lastCompletedAt)) ||
          !Array.isArray(saved.urls) || !saved.urls.every(entry =>
        entry && typeof entry.host === 'string' &&
        ['healthy', 'error'].includes(entry.status) &&
        typeof entry.checkedAt === 'string' && Number.isFinite(Date.parse(entry.checkedAt)))) {
        throw new Error('Invalid saved health results');
      }
      results = new Map(saved.urls.map(({ name, host, category, type, ...result }) => [host, result]));
      lastCompletedAt = saved.lastCompletedAt || null;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        monitorError = error.message;
        console.error('[health] Cannot restore results:', error);
      }
    }
    nextCheckAt = new Date(Date.now() + intervalMs).toISOString();
    timer = setInterval(() => {
      nextCheckAt = new Date(Date.now() + intervalMs).toISOString();
      run();
    }, intervalMs);
    timer.unref();
    await run();
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    started = false;
    nextCheckAt = null;
  }

  return { getStatus, run, start, stop };
}

module.exports = { createHealthMonitor, loadUrls, normalizeUrl, requestUrl };
