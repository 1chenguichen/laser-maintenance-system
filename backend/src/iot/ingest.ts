import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { iotStore } from './store.js';
import { IoTAccess } from './access.js';
import { validId } from './contracts.js';
@Injectable()
export class TelemetryIngest {
  constructor(private access: IoTAccess) {}
  async receive(key: string, b: any) {
    if (!b || typeof b !== 'object' || Array.isArray(b))
      throw new BadRequestException('监测消息无效');
    if (typeof key !== 'string' || key.length < 32 || key.length > 128)
      throw new UnauthorizedException('设备凭证无效');
    const token = createHash('sha256').update(key).digest('hex');
    const known = (
      await iotStore.query(
        'SELECT asset_id,tenant_id FROM iot.devices WHERE credential_hash=$1 AND enabled',
        [token],
      )
    ).rows[0];
    if (!known) throw new UnauthorizedException('设备凭证已失效');
    await this.access.subscription(known.tenant_id);
    if (b.assetId && b.assetId !== known.asset_id)
      throw new ForbiddenException('设备身份不匹配');
    const sampleId = validId(b.sampleId),
      at = new Date(b.recordedAt),
      now = Date.now();
    if (
      !Number.isFinite(at.getTime()) ||
      at.getTime() > now + 120000 ||
      at.getTime() < now - 7 * 86400000
    )
      throw new BadRequestException(
        '采集时间应在最近7天内且不超出当前时间2分钟',
      );
    if (
      !b.values ||
      typeof b.values !== 'object' ||
      Array.isArray(b.values) ||
      Object.keys(b.values).length > 24
    )
      throw new BadRequestException('监测数据无效');
    const c = await iotStore.connect();
    try {
      await c.query('BEGIN');
      const d = (
        await c.query(
          'SELECT * FROM iot.devices WHERE asset_id=$1 FOR UPDATE',
          [known.asset_id],
        )
      ).rows[0];
      if (!d.enabled || d.credential_hash !== token)
        throw new UnauthorizedException('设备凭证已失效');
      const values: any = {};
      for (const [field, value] of Object.entries(b.values)) {
        if (!d.metrics.some((m: any) => m.key === field))
          throw new BadRequestException('数据包含未配置指标');
        if (
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          Math.abs(value) > 1e12
        )
          throw new BadRequestException('指标必须为有效数字');
        values[field] = value;
      }
      if (!Object.keys(values).length)
        throw new BadRequestException('请至少上传一个指标');
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            at: at.toISOString(),
            values: Object.keys(values)
              .sort()
              .map((k) => [k, values[k]]),
          }),
        )
        .digest('hex');
      const old = (
        await c.query(
          'SELECT fingerprint FROM iot.samples WHERE asset_id=$1 AND sample_id=$2',
          [d.asset_id, sampleId],
        )
      ).rows[0];
      if (old) {
        if (old.fingerprint !== fingerprint)
          throw new ConflictException('重复消息编号对应了不同数据');
        await c.query('COMMIT');
        return { accepted: true, duplicate: true };
      }
      await c.query(
        'INSERT INTO iot.samples(asset_id,sample_id,recorded_at,values,fingerprint) VALUES($1,$2,$3,$4,$5)',
        [d.asset_id, sampleId, at, JSON.stringify(values), fingerprint],
      );
      const latest =
        !d.latest_at || at.getTime() > new Date(d.latest_at).getTime();
      if (latest) {
        const merged = { ...d.latest, ...values };
        await c.query(
          'UPDATE iot.devices SET latest=$2,latest_at=$3,last_received_at=now(),metric_times=$4 WHERE asset_id=$1',
          [
            d.asset_id,
            JSON.stringify(merged),
            at,
            JSON.stringify({
              ...d.metric_times,
              ...Object.fromEntries(
                Object.keys(values).map((k) => [k, at.toISOString()]),
              ),
            }),
          ],
        );
        if (
          d.last_received_at &&
          Date.now() - new Date(d.last_received_at).getTime() >
            d.offline_after_seconds * 1000
        )
          await c.query('DELETE FROM iot.rule_states WHERE asset_id=$1', [
            d.asset_id,
          ]);
        // Rules use receipt time, not a device-supplied clock, to measure duration.
        for (const m of d.metrics) {
          if (values[m.key] === undefined) continue;
          const value = values[m.key],
            breach =
              (m.min !== undefined && value < m.min) ||
              (m.max !== undefined && value > m.max);
          const state = (
            await c.query(
              'SELECT * FROM iot.rule_states WHERE asset_id=$1 AND metric=$2',
              [d.asset_id, m.key],
            )
          ).rows[0];
          if (breach) {
            const since = state?.breach_since || new Date();
            await c.query(
              'INSERT INTO iot.rule_states(asset_id,metric,breach_since) VALUES($1,$2,$3) ON CONFLICT(asset_id,metric) DO UPDATE SET breach_since=coalesce(iot.rule_states.breach_since,EXCLUDED.breach_since)',
              [d.asset_id, m.key, since],
            );
            if (
              (m.durationSeconds || 0) === 0 ||
              Date.now() - new Date(since).getTime() >=
                (m.durationSeconds || 0) * 1000
            ) {
              const threshold = [
                m.min !== undefined ? '低于 ' + m.min + m.unit : '',
                m.max !== undefined ? '高于 ' + m.max + m.unit : '',
              ]
                .filter(Boolean)
                .join(' 或 ');
              await c.query(
                'INSERT INTO iot.alarms(id,asset_id,tenant_id,metric,label,value,threshold,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(asset_id,metric) WHERE recovered_at IS NULL DO NOTHING',
                [
                  randomUUID(),
                  d.asset_id,
                  d.tenant_id,
                  m.key,
                  m.label,
                  value,
                  threshold,
                  JSON.stringify(merged),
                ],
              );
            }
          } else {
            await c.query(
              'UPDATE iot.rule_states SET breach_since=NULL WHERE asset_id=$1 AND metric=$2',
              [d.asset_id, m.key],
            );
            await c.query(
              'UPDATE iot.alarms SET recovered_at=now() WHERE asset_id=$1 AND metric=$2 AND recovered_at IS NULL',
              [d.asset_id, m.key],
            );
          }
        }
      }
      await c.query('COMMIT');
      return { accepted: true, duplicate: false, latest };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
}
