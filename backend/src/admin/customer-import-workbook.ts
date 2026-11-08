import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
export type ImportRow = {
  sheet: string;
  row: number;
  values: Record<string, string>;
};
export type ImportIssue = { sheet: string; row: number; message: string };
export const CUSTOMER_COLUMNS = [
  '客户编号',
  '客户姓名',
  '手机号码',
  '客户类型',
  '客户单位',
  '联系人职务',
  '电子邮箱',
  '省份',
  '城市',
  '区县',
  '详细地址',
  '客户来源',
  '跟进阶段',
  '跟进负责人',
  '下次跟进日期',
  '开票抬头',
  '纳税人识别号',
  '备注',
];
export const DEVICE_COLUMNS = [
  '设备编号',
  '客户编号',
  '客户手机号',
  '设备类型',
  '设备型号',
  '设备序列号',
  '设备品牌',
  '购机日期',
  '质保到期日',
  '设备状态',
  '维保方案',
  '维保到期日',
  '服务工程师',
  '设备安装地址',
  '备注',
];
export const digest = (v: any) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
export function importDate(value: string) {
  if (!value) return '';
  const text = value.trim();
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split(/[-/]/).map(Number),
      date = new Date(Date.UTC(y, m - 1, d));
    if (
      y >= 1900 &&
      y <= 2200 &&
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    )
      return date.toISOString().slice(0, 10);
  }
  throw Error('日期请填写有效的 YYYY-MM-DD，例如 2026-11-05');
}
function zipLimit(buffer: Buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new BadRequestException('文件不是有效的 .xlsx 工作簿');
  const count = buffer.readUInt16LE(end + 10);
  let pos = buffer.readUInt32LE(end + 16),
    size = 0;
  if (count > 1000) throw new BadRequestException('工作簿内容过多，请拆分文件');
  for (let n = 0; n < count; n++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== 0x02014b50)
      throw new BadRequestException('工作簿压缩结构异常');
    size += buffer.readUInt32LE(pos + 24);
    if (size > 30 * 1024 * 1024)
      throw new BadRequestException(
        '工作簿解压后超过30MB，请删除多余内容后重试',
      );
    pos +=
      46 +
      buffer.readUInt16LE(pos + 28) +
      buffer.readUInt16LE(pos + 30) +
      buffer.readUInt16LE(pos + 32);
  }
}
const aliases: Record<string, string> = {
  姓名: '客户姓名',
  客户名称: '客户姓名',
  手机号: '手机号码',
  联系电话: '手机号码',
  电话: '手机号码',
  联系人: '客户姓名',
  型号: '设备型号',
  序列号: '设备序列号',
  购买日期: '购机日期',
  质保到期: '质保到期日',
};
async function normalizeWorkbook(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;
  for (const [name, entry] of Object.entries(zip.files)) {
    if (/^xl\/worksheets\/_rels\/.*\.rels$/.test(name)) {
      const rel = await entry.async('string');
      const normalized = rel.replace(
        /Target="\/xl\/tables\//g,
        'Target="../tables/',
      );
      if (rel !== normalized) {
        zip.file(name, normalized);
        changed = true;
      }
      continue;
    }
    if (!/^xl\/.*\.xml$/.test(name)) continue;
    let xml = await entry.async('string');
    const declaration = xml.match(
      /xmlns:([A-Za-z][\w.-]*)=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/,
    );
    if (!declaration) continue;
    const prefix = declaration[1];
    xml = xml.replace(
      declaration[0],
      /\sxmlns=/.test(xml)
        ? ''
        : 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
    );
    xml = xml.replace(new RegExp('(<\\/?)' + prefix + ':', 'g'), '$1');
    zip.file(name, xml);
    changed = true;
  }
  return changed ? await zip.generateAsync({ type: 'nodebuffer' }) : buffer;
}
export type ImportMode = 'customers' | 'devices';
export async function parseImport(
  buffer: Buffer,
  mode: ImportMode = 'customers',
) {
  zipLimit(buffer);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load((await normalizeWorkbook(buffer)) as any);
  } catch {
    throw new BadRequestException(
      '无法读取工作簿，请用 Excel/WPS 另存为 .xlsx 后重试',
    );
  }
  const issues: ImportIssue[] = [],
    customers: ImportRow[] = [],
    devices: ImportRow[] = [];
  let skippedExamples = 0;
  const found = new Set<string>();
  for (const sheet of wb.worksheets) {
    let kind = '';
    if (['客户名单', '客户信息', '客户'].includes(sheet.name))
      kind = 'customer';
    if (['设备与维保', '设备信息', '设备'].includes(sheet.name))
      kind = 'device';
    if (!kind || (mode === 'devices' && kind === 'customer')) continue;
    if (found.has(kind))
      throw new BadRequestException(
        '存在多个' +
          (kind === 'customer' ? '客户' : '设备') +
          '数据页，请仅保留一页',
      );
    found.add(kind);
    if (sheet.rowCount > 1010 || sheet.columnCount > 50)
      throw new BadRequestException('每张表最多1000条数据、50列，请拆分后导入');
    let header = 0;
    let columns: string[] = [];
    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
      const cells = sheet.getRow(r);
      const values = Array.from(
        { length: Math.min(sheet.columnCount, 50) },
        (_, i) => {
          const text = cells
            .getCell(i + 1)
            .text.trim()
            .replace(/[（(]必填[）)]|\*/g, '');
          return aliases[text] || text;
        },
      );
      if (values.includes(kind === 'customer' ? '客户姓名' : '设备序列号')) {
        header = r;
        columns = values;
        break;
      }
    }
    if (!header) {
      issues.push({
        sheet: sheet.name,
        row: 1,
        message: '找不到表头，请使用下载的模板',
      });
      continue;
    }
    const expected = [
      '行类型',
      ...(kind === 'customer' ? CUSTOMER_COLUMNS : DEVICE_COLUMNS),
    ];
    const nonempty = columns.filter(Boolean);
    if (new Set(nonempty).size !== nonempty.length)
      issues.push({
        sheet: sheet.name,
        row: header,
        message: '表头存在重复列',
      });
    for (const col of nonempty)
      if (!expected.includes(col))
        issues.push({
          sheet: sheet.name,
          row: header,
          message: '无法识别列「' + col + '」，请按模板填写',
        });
    if (kind === 'customer' && !columns.includes('手机号码'))
      issues.push({
        sheet: sheet.name,
        row: header,
        message: '缺少手机号码列',
      });
    for (let r = header + 1; r <= sheet.rowCount; r++) {
      const typeColumn = columns.indexOf('行类型');
      const type =
        typeColumn < 0
          ? ''
          : sheet
              .getRow(r)
              .getCell(typeColumn + 1)
              .text.trim();
      if (['示例（不导入）', '示例(不导入)', '示例'].includes(type)) {
        skippedExamples++;
        continue;
      }
      if (type && !['数据', '正式数据'].includes(type)) {
        issues.push({
          sheet: sheet.name,
          row: r,
          message: '行类型请填写「数据」，示例行保留「示例（不导入）」',
        });
      }
      const row = sheet.getRow(r),
        values: Record<string, string> = {};
      let any = false;
      columns.forEach((col, i) => {
        if (!col || col === '行类型') return;
        const cell = row.getCell(i + 1);
        let value = '';
        if (cell.type === ExcelJS.ValueType.Formula) {
          issues.push({
            sheet: sheet.name,
            row: r,
            message: '不支持公式，请将「' + col + '」粘贴为值',
          });
          value = cell.text;
        } else if (cell.value instanceof Date)
          value = cell.value.toISOString().slice(0, 10);
        else value = cell.text.trim();
        if (value) any = true;
        if (value.length > 1000)
          issues.push({
            sheet: sheet.name,
            row: r,
            message: col + '超过1000个字符',
          });
        values[col] = value;
      });
      if (any)
        (kind === 'customer' ? customers : devices).push({
          sheet: sheet.name,
          row: r,
          values,
        });
    }
  }
  if (mode === 'customers' && !found.has('customer'))
    throw new BadRequestException(
      '请将客户数据页命名为「客户名单」，并保留表头',
    );
  if (mode === 'devices' && !found.has('device'))
    throw new BadRequestException(
      '请将设备数据页命名为「设备与维保」，并保留表头',
    );
  if (mode === 'customers' && !customers.length)
    issues.push({
      sheet: '客户名单',
      row: 3,
      message: '请在示例行下方填写客户资料；示例行会自动跳过',
    });
  if (mode === 'devices' && !devices.length)
    issues.push({
      sheet: '设备与维保',
      row: 3,
      message: '请在示例行下方填写设备资料；示例行会自动跳过',
    });
  if (customers.length > 500 || devices.length > 1000)
    throw new BadRequestException('单次最多500位客户、1000台设备');
  return { customers, devices, issues, skippedExamples };
}
export async function importTemplate(mode: ImportMode = 'customers') {
  const wb = new ExcelJS.Workbook();
  wb.creator = '激光维保';
  const customer = [
    'EXAMPLE-001',
    '示例客户张先生',
    '13800001001',
    '企业',
    '示例精密制造有限公司',
    '设备主管',
    'customer@example.com',
    '广东省',
    '深圳市',
    '宝安区',
    '示例工业园1号',
    '老客户介绍',
    '待联系',
    '客服A',
    '2026-11-06',
    '示例精密制造有限公司',
    '',
    '示例仅供参考，实际客户请在下一行填写',
  ];
  const device = [
    'DEV-EXAMPLE-001',
    mode === 'devices' ? '' : 'EXAMPLE-001',
    '13800001001',
    '激光焊接机',
    'LW-500',
    'EXAMPLE-SN-001',
    '示例品牌',
    '2026-01-10',
    '2027-01-09',
    '运行正常',
    '年度维保（待签约）',
    '2027-01-09',
    '待分配',
    '同客户地址',
    '示例仅供参考，实际设备请在下一行填写',
  ];
  const configs =
    mode === 'devices'
      ? [['设备与维保', DEVICE_COLUMNS, device]]
      : [
          ['客户名单', CUSTOMER_COLUMNS, customer],
          ['设备与维保', DEVICE_COLUMNS, device],
        ];
  for (const [name, cols, example] of configs as [
    string,
    string[],
    string[],
  ][]) {
    const sheet = wb.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 2, activeCell: 'B3' }],
    });
    const headers = ['行类型', ...cols];
    sheet.columns = headers.map((h) => ({
      header: (name === '客户名单'
        ? ['客户姓名', '手机号码']
        : ['设备类型', '设备型号', '设备序列号']
      ).includes(h)
        ? h + '（必填）'
        : h,
      key: h,
      width:
        h === '行类型'
          ? 23
          : [
                '备注',
                '详细地址',
                '客户单位',
                '开票抬头',
                '设备安装地址',
              ].includes(h)
            ? 38
            : 21,
      style: { numFmt: '@',alignment:{horizontal:'left',vertical:'middle'} },
    }));
    sheet.addRow(['示例（不导入）', ...example.map(value=>value||null)]);
    sheet.addRow(['数据', ...cols.map(() => null)]);
    sheet.getRow(1).height = 32;
    sheet.getRow(1).eachCell((c) => {
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF176C50' },
      };
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.alignment = { vertical: 'middle' };
    });
    sheet.getRow(2).height = 34;
    sheet.getRow(2).eachCell((c) => {
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF0CB' },
      };
      c.font = { color: { argb: 'FF805C1B' } };
      c.alignment = { vertical: 'middle' };
    });
    sheet.getRow(3).height = 30;
    sheet.getCell('A3').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEAF4FF' },
    };
    sheet.getCell('A1').note =
      '示例行的标记保持不变，系统自动跳过。自己的资料填写在示例下方，行类型填「数据」或留空。';
    for (const h of name === '客户名单'
      ? ['客户姓名', '手机号码']
      : ['设备类型', '设备型号', '设备序列号'])
      sheet.getCell(1, headers.indexOf(h) + 1).note = '必填';
    sheet.getCell('B3').note =
      '从这一行开始填写自己的资料，可以继续向下添加多行。';
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };
  }
  const intro = wb.addWorksheet('填写说明');
  intro.columns = [{ width: 24 }, { width: 110 }];
  [
    [
      '直接照着示例填写',
      '第1行是表头，第2行是第一条示例；从第3行开始填写自己的资料。打开文件默认就是填写页。',
    ],
    [
      '示例不会入库',
      '黄色示例行的行类型为「示例（不导入）」，系统自动跳过；用户行填「数据」或留空。不要把自己的资料填到示例标记行。',
    ],
    [
      '客户填写',
      '客户姓名、手机号码必填。每位客户一行，手机号、编号按文本填写。',
    ],
    [
      '设备填写',
      mode === 'devices'
        ? '通过客户手机号或已登记的客户编号关联本企业已有客户。客户不存在时，请先在客户管理新增或导入客户。'
        : '设备通过客户编号或客户手机号关联本次客户名单。设备序列号、设备型号、设备类型必填。',
    ],
    [
      '其他格式',
      '地址须同时填写省、市、区和详细地址；日期 YYYY-MM-DD。保留表头和工作表名。',
    ],
    [
      '重复与错误',
      '相同客户或设备会跳过，不覆盖原资料；手机号、序列号或归属冲突会显示具体行号。全部校验通过后再确认导入。',
    ],
    ['限制', '仅支持.xlsx，5MB以内；单次最多500位客户、1000台设备。'],
    [
      '维保与开票',
      '相关内容仅登记为资料，不会自动创建账号、合同、付款和发票。',
    ],
  ].forEach((row) => intro.addRow(row));
  intro.getColumn(2).alignment = { wrapText: true, vertical: 'middle' };
  intro.eachRow((row) => (row.height = 40));
  wb.views = [
    {
      x: 0,
      y: 0,
      width: 1500,
      height: 900,
      visibility: 'visible',
      activeTab: 0,
      firstSheet: 0,
    },
  ];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
