/* global document, fetch, window */
(function() {
  'use strict';
  let status = null;
  let refreshing = false;
  const element = id => document.getElementById(id);
  const formatTime = value => value ? new Date(value).toLocaleString('zh-CN') : '—';
  const labels = { healthy: '运行正常', error: '访问异常', pending: '等待检测' };

  function node(tag, text, className) {
    const result = document.createElement(tag);
    result.textContent = text;
    if (className) result.className = className;
    return result;
  }

  function renderRows() {
    if (!status) return;
    const query = element('search').value.toLowerCase();
    const type = element('type-filter').value;
    const state = element('status-filter').value;
    const rows = status.urls.filter(item =>
      (!type || item.type === type) && (!state || item.status === state) &&
      [item.name, item.host, item.category].join(' ').toLowerCase().includes(query));
    const fragment = document.createDocumentFragment();
    for (const item of rows) {
      const row = document.createElement('tr');
      const service = document.createElement('td');
      service.appendChild(node('div', item.name, 'service-name'));
      const link = node('a', item.host);
      link.href = item.host;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      service.appendChild(link);
      const availability = document.createElement('td');
      availability.appendChild(node('span', labels[item.status], 'badge ' + item.status));
      if (item.error) availability.appendChild(node('div', item.error, 'detail failure'));
      const category = node('td', item.category || '—');
      const source = document.createElement('td');
      source.appendChild(node('span', item.type, 'badge ' + item.type));
      const response = node('td', item.statusCode ? String(item.statusCode) : '—');
      response.appendChild(node('div', item.durationMs === null ? '—' : item.durationMs + ' ms', 'detail'));
      const time = node('td', formatTime(item.checkedAt));
      time.appendChild(node('div', '尝试 ' + item.attempts + ' 次', 'detail'));
      [service, availability, category, source, response, time].forEach(cell => row.appendChild(cell));
      fragment.appendChild(row);
    }
    element('services').replaceChildren(fragment);
    element('empty').hidden = rows.length !== 0;
  }

  function render(data) {
    status = data;
    element('total').textContent = data.total;
    element('healthy').textContent = data.healthyCount;
    element('errors').textContent = data.errorCount;
    element('pending').textContent = data.pendingCount;
    element('progress').textContent = data.checking ? '巡检进行中，结果将逐项更新' : '巡检已完成';
    element('completed').textContent = '上次完成：' + formatTime(data.lastCompletedAt);
    element('next').textContent = '下次检测：' + formatTime(data.nextCheckAt);
    const messages = [];
    if (data.monitorError) messages.push('监控异常：' + data.monitorError);
    if (data.configurationError) messages.push('配置读取失败：' + data.configurationError);
    if (data.stale) messages.push(data.lastCompletedAt ? '检测结果已过期，请检查监控进程。' : '等待首次巡检完成。');
    if (data.pendingCount) messages.push(data.pendingCount + ' 个服务等待检测。');
    if (data.errorCount) messages.push(data.errorCount + ' 个服务连续两次访问失败。');
    if (!messages.length) messages.push('所有服务运行正常。');
    element('notice').className = 'notice ' + data.state;
    element('notice').textContent = messages.join(' ');
    renderRows();
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/status', { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!Array.isArray(data.urls) || (!response.ok && response.status !== 503)) {
        throw new Error('HTTP ' + response.status);
      }
      render(data);
    } catch (error) {
      element('notice').className = 'notice unknown';
      element('notice').textContent = '无法获取最新状态：' + error.message + '。下方如有数据，仅为上次快照。';
    } finally {
      window.clearTimeout(timeout);
      refreshing = false;
    }
  }
  ['search', 'type-filter', 'status-filter'].forEach(id => element(id).addEventListener('input', renderRows));
  refresh();
  window.setInterval(refresh, 30000);
})();
