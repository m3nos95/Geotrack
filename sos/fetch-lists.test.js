'use strict';
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const Fetch = require('./fetch-lists.js');

delete process.env.SOS_PROGRAM_DIR;
delete process.env.SOS_CORPUS_DIR;
delete process.env.SOS_WATCH_CONFIG;

(async () => {
  process.env.SOS_AGGREGATE_CHART = path.join(__dirname, 'no-such-Approved-Source-List.xlsx');
  const missing = Fetch.pullOfficeAggregateChart();
  assert.strictEqual(missing.ok, false);
  assert.ok(/not found|Approved Source List/i.test(missing.error));
  console.log('OK pull reports missing chart');

  const liveChart = [
    '/home/ubuntu/.cursor/projects/workspace/uploads/Approved_Source_List_5b4b.xlsx',
  ].find(p => fs.existsSync(p));

  if (!liveChart) {
    console.log('skip live Approved Source List.xlsx');
    return;
  }

  process.env.SOS_AGGREGATE_CHART = liveChart;
  const pulled = Fetch.pullOfficeAggregateChart();
  assert.strictEqual(pulled.ok, true, pulled.error || 'pull failed');
  assert.ok(pulled.aggregate.entries.length > 10, 'chart rows');
  console.log('OK pull parses office Approved Source List', pulled.aggregate.entries.length, 'rows');

  const server = http.createServer(Fetch.handleHelperRequest);
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  try {
    const body = await getJson(port, '/api/pull-chart');
    assert.strictEqual(body.ok, true);
    assert.ok(body.aggregate.entries.length > 10);
    const st = await getJson(port, '/api/chart-status');
    assert.strictEqual(st.helper, true);
    assert.strictEqual(st.reachable, true);
    console.log('OK helper /api/pull-chart');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

function getJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: urlPath }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}
