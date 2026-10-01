'use strict';
// Chạy mọi tệp *.test.js trong tests/ bằng bộ chạy thử có sẵn của Node (node --test), tuần tự.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const files = fs.readdirSync(__dirname).filter((f) => /\.test\.js$/.test(f)).sort().map((f) => path.join(__dirname, f));
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1'].concat(process.argv.slice(2), files), { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
