'use strict';
/* Phiên bản Node.js dùng được: ≥ 24.16.0 (dòng 24) hoặc ≥ 26.1.0. Bản cũ hơn có lỗi node:sqlite cắt chuỗi tại ký tự NUL;
 * dòng 25 và 26.0 chưa có bản sửa nên không nhận. Viết kiểu cũ (không cú pháp mới) để chạy được cả trên Node rất cũ và báo lỗi rõ. */
var NODE_YEU_CAU = '24.16.0 trở lên (dòng 24 LTS) hoặc 26.1.0 trở lên';

function parse(v) {
  var m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function atLeast(a, b) {
  for (var i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return true;
}

function nodeOk(v) {
  var p = parse(v);
  if (!p) return false;
  if (p[0] === 24) return atLeast(p, [24, 16, 0]);
  if (p[0] >= 26) return atLeast(p, [26, 1, 0]);
  return false;
}

module.exports = { nodeOk: nodeOk, NODE_YEU_CAU: NODE_YEU_CAU, parse: parse };
