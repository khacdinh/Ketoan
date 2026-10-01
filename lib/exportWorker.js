'use strict';
/*
 * Tạo file Excel trong một luồng riêng (worker_threads) khi dữ liệu lớn.
 * Dựng file 20.000 dòng mất hàng chục giây; chạy ngay trong máy chủ sẽ làm mọi yêu cầu khác (kể cả giao diện) đứng hình.
 */
const { parentPort, workerData } = require('worker_threads');
const exporter = require('./exporter');
const costExporter = require('./costExporter');

(async () => {
  try {
    const m = workerData.mod === 'cost' ? costExporter : exporter;
    const buf = await m[workerData.fn].apply(null, workerData.args);
    parentPort.postMessage({ ok: true, buf: new Uint8Array(buf) });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: e.message, status: e.status });
  }
})();
