'use strict';
/*
 * Chèn biểu đồ cột (clustered column) vào một sheet của file xlsx đã tạo bằng ExcelJS.
 * ExcelJS không tạo được biểu đồ nên phần này ghi trực tiếp DrawingML vào gói zip.
 */
const JSZip = require('jszip');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sheetRef(sheetName) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(sheetName) ? sheetName : "'" + sheetName.replace(/'/g, "''") + "'";
}

function txPr(size, rot) {
  return '<c:txPr><a:bodyPr' + (rot ? ' rot="' + rot + '" vert="horz"' : '') + '/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="' + size +
    '"><a:solidFill><a:srgbClr val="52514E"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="vi-VN"/></a:p></c:txPr>';
}

function chartXml(opt) {
  const sr = sheetRef(opt.sheetName);
  const n = opt.categories.length;
  const catCache = '<c:strCache><c:ptCount val="' + n + '"/>' +
    opt.categories.map((c, i) => '<c:pt idx="' + i + '"><c:v>' + esc(c) + '</c:v></c:pt>').join('') + '</c:strCache>';
  const series = opt.series.map((s, idx) => {
    const vals = '<c:numCache><c:formatCode>#,##0</c:formatCode><c:ptCount val="' + n + '"/>' +
      s.values.map((v, i) => '<c:pt idx="' + i + '"><c:v>' + (Number(v) || 0) + '</c:v></c:pt>').join('') + '</c:numCache>';
    return '<c:ser><c:idx val="' + idx + '"/><c:order val="' + idx + '"/>' +
      '<c:tx><c:strRef><c:f>' + sr + '!' + s.nameCell + '</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>' + esc(s.name) + '</c:v></c:pt></c:strCache></c:strRef></c:tx>' +
      '<c:spPr><a:solidFill><a:srgbClr val="' + s.color + '"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>' +
      '<c:invertIfNegative val="0"/>' +
      '<c:cat><c:strRef><c:f>' + sr + '!' + opt.catRange + '</c:f>' + catCache + '</c:strRef></c:cat>' +
      '<c:val><c:numRef><c:f>' + sr + '!' + s.valRange + '</c:f>' + vals + '</c:numRef></c:val>' +
      '</c:ser>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<c:date1904 val="0"/><c:lang val="vi-VN"/><c:roundedCorners val="0"/>' +
    '<c:chart>' +
    '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="vi-VN" sz="1400" b="1"><a:solidFill><a:srgbClr val="1F4E78"/></a:solidFill></a:rPr><a:t>' +
    esc(opt.title) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>' +
    '<c:autoTitleDeleted val="0"/>' +
    '<c:plotArea><c:layout/>' +
    '<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>' + series +
    '<c:gapWidth val="80"/><c:overlap val="-8"/><c:axId val="50010001"/><c:axId val="50010002"/></c:barChart>' +
    '<c:catAx><c:axId val="50010001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>' +
    '<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
    '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="C3C2B7"/></a:solidFill></a:ln></c:spPr>' +
    txPr(900, '-2700000') +
    '<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>' +
    '<c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>' +
    '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E1E0D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' +
    '<c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
    '<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>' + txPr(900) +
    '<c:crossAx val="50010001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>' +
    '</c:plotArea>' +
    '<c:legend><c:legendPos val="t"/><c:overlay val="0"/>' + txPr(1000) + '</c:legend>' +
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>' +
    '</c:chart>' +
    '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr>' +
    '</c:chartSpace>';
}

function drawingXml(anchor) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<xdr:twoCellAnchor editAs="oneCell">' +
    '<xdr:from><xdr:col>' + anchor.fromCol + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + anchor.fromRow + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
    '<xdr:to><xdr:col>' + anchor.toCol + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + anchor.toRow + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
    '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Biểu đồ 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
    '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
    '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>' +
    '</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>';
}

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DRAWING_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing';
const CHART_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';

async function findSheetPath(zip, sheetName) {
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const re = /<sheet\b[^>]*>/g;
  let m;
  let rid = null;
  while ((m = re.exec(wbXml))) {
    const name = /name="([^"]*)"/.exec(m[0]);
    const id = /r:id="([^"]*)"/.exec(m[0]);
    const decoded = name && name[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (decoded === sheetName && id) { rid = id[1]; break; }
  }
  if (!rid) throw new Error('Không tìm thấy sheet ' + sheetName);
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const rel = new RegExp('<Relationship\\b[^>]*Id="' + rid + '"[^>]*>').exec(rels);
  const target = /Target="([^"]*)"/.exec(rel[0])[1].replace(/^\/?xl\//, '');
  return 'xl/' + target;
}

/**
 * opts: { sheetName, title, catRange:'$A$5:$A$19', categories:[...],
 *         series:[{ name, nameCell:'$C$4', valRange:'$C$5:$C$19', values:[...], color:'2A78D6' }],
 *         anchor:{ fromCol, fromRow, toCol, toRow } } (hàng/cột tính từ 0)
 */
async function addColumnChart(buffer, opts) {
  const zip = await JSZip.loadAsync(buffer);
  const sheetPath = await findSheetPath(zip, opts.sheetName);
  const sheetFile = sheetPath.split('/').pop();
  const sheetRelsPath = 'xl/worksheets/_rels/' + sheetFile + '.rels';

  let k = 1;
  while (zip.file('xl/charts/chart' + k + '.xml')) k++;
  let d = 1;
  while (zip.file('xl/drawings/drawing' + d + '.xml')) d++;

  zip.file('xl/charts/chart' + k + '.xml', chartXml(opts));
  zip.file('xl/drawings/drawing' + d + '.xml', drawingXml(opts.anchor));
  zip.file('xl/drawings/_rels/drawing' + d + '.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="' + REL_NS + '">' +
    '<Relationship Id="rId1" Type="' + CHART_REL + '" Target="../charts/chart' + k + '.xml"/></Relationships>');

  // Quan hệ sheet -> drawing
  let relsXml = zip.file(sheetRelsPath) ? await zip.file(sheetRelsPath).async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="' + REL_NS + '"></Relationships>';
  let n = 1;
  while (relsXml.indexOf('Id="rIdChart' + n + '"') >= 0) n++;
  const relId = 'rIdChart' + n;
  relsXml = relsXml.replace('</Relationships>',
    '<Relationship Id="' + relId + '" Type="' + DRAWING_REL + '" Target="../drawings/drawing' + d + '.xml"/></Relationships>');
  zip.file(sheetRelsPath, relsXml);

  // Thẻ <drawing> phải đứng đúng vị trí theo lược đồ của worksheet
  let sheetXml = await zip.file(sheetPath).async('string');
  if (/<drawing\b/.test(sheetXml)) throw new Error('Sheet đã có drawing');
  if (!/xmlns:r="/.test(sheetXml.slice(0, 1000))) {
    sheetXml = sheetXml.replace(/<worksheet\b/, '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  }
  const tag = '<drawing r:id="' + relId + '"/>';
  const after = ['<legacyDrawing', '<legacyDrawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'];
  let pos = -1;
  for (const t of after) {
    const i = sheetXml.indexOf(t);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  sheetXml = sheetXml.slice(0, pos) + tag + sheetXml.slice(pos);
  zip.file(sheetPath, sheetXml);

  // Khai báo kiểu nội dung
  let ct = await zip.file('[Content_Types].xml').async('string');
  const add = (part, type) => {
    if (ct.indexOf('PartName="' + part + '"') < 0) ct = ct.replace('</Types>', '<Override PartName="' + part + '" ContentType="' + type + '"/></Types>');
  };
  add('/xl/charts/chart' + k + '.xml', 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml');
  add('/xl/drawings/drawing' + d + '.xml', 'application/vnd.openxmlformats-officedocument.drawing+xml');
  zip.file('[Content_Types].xml', ct);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 1 } });
}

module.exports = { addColumnChart };
