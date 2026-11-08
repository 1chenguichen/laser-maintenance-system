import { BadRequestException } from '@nestjs/common';
export const DEFAULT_METRICS = [
  {
    key: 'temperature',
    label: '冷却液温度',
    unit: '℃',
    customerVisible: true,
    min: 5,
    max: 45,
    durationSeconds: 10,
  },
  {
    key: 'current',
    label: '工作电流',
    unit: 'A',
    customerVisible: true,
    min: 0,
    max: 35,
    durationSeconds: 10,
  },
  { key: 'runtime', label: '累计运行', unit: 'h', customerVisible: true },
  {
    key: 'vibration',
    label: '振动速度',
    unit: 'mm/s',
    customerVisible: false,
    max: 4.5,
    durationSeconds: 10,
  },
];
export function validId(v: any) {
  if (
    typeof v !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
  )
    throw new BadRequestException('记录编号无效');
  return v;
}
export function text(v: any, label: string, min = 1, max = 200) {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max)
    throw new BadRequestException(`${label}须为${min}至${max}个字符`);
  return v.trim();
}
export function metricModel(value: any) {
  if (!Array.isArray(value) || !value.length || value.length > 24)
    throw new BadRequestException('请配置1至24个指标');
  const seen = new Set();
  return value.map((m) => {
    if (
      !m ||
      typeof m.key !== 'string' ||
      !/^([a-z][a-z0-9_]{0,39})$/.test(m.key) ||
      seen.has(m.key)
    )
      throw new BadRequestException('指标标识无效或重复');
    seen.add(m.key);
    const out: any = {
      key: m.key,
      label: text(m.label, '指标名称', 1, 40),
      unit: text(m.unit ?? '', '单位', 0, 16),
      customerVisible: m.customerVisible === true,
    };
    for (const key of ['min', 'max'])
      if (m[key] !== undefined && m[key] !== null && m[key] !== '') {
        if (typeof m[key] !== 'number' || !Number.isFinite(m[key]))
          throw new BadRequestException('阈值必须为有效数字');
        out[key] = m[key];
      }
    if (out.min !== undefined && out.max !== undefined && out.min >= out.max)
      throw new BadRequestException('下限必须小于上限');
    const duration = m.durationSeconds ?? 10;
    if (!Number.isInteger(duration) || duration < 0 || duration > 86400)
      throw new BadRequestException('告警持续时间无效');
    out.durationSeconds = duration;
    return out;
  });
}
