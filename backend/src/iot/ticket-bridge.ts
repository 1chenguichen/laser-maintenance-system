import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IoTService } from './service.js';
import { iotStore } from './store.js';
import type { IoTScope } from './access.js';
import { registry } from '../tenancy/registry.js';
import { indexPerson, resource } from '../identity/store.js';
import { MarketService } from '../market/market.module.js';
import { validId, text } from './contracts.js';
@Injectable()
export class IoTTicketBridge {
  constructor(
    private iot: IoTService,
    private market: MarketService,
  ) {}
  async create(s: IoTScope, id: string, b: any) {
    this.iot.access.manage(s);
    let alarm = (
      await iotStore.query('SELECT * FROM iot.alarms WHERE id=$1', [
        validId(id),
      ])
    ).rows[0];
    if (!alarm) throw new NotFoundException('告警不存在');
    await this.iot.access.device(s, alarm.asset_id);
    if (alarm.ticket_id)
      return {
        id: alarm.ticket_id,
        number: alarm.ticket_number,
        existing: true,
      };
    const asset = await this.iot.asset(alarm.asset_id),
      d = await this.iot.localDevice(asset);
    if (!d.customer_id || !d.customer_phone)
      throw new BadRequestException('请先为设备绑定客户，不能自动猜测客户');
    const customer = await indexPerson(
      asset.tenant_id,
      'customer',
      d.customer_id,
      d.customer_phone,
      d.customer_name,
    );
    if (!customer.enabled) throw new ForbiddenException('客户账号已停用');
    if (!alarm.ticket_payload) {
      const city = text(b.city, '服务城市', 2, 50),
        address = text(b.address, '服务地址', 3, 200),
        note = text(b.note, '故障说明', 5, 1000);
      const category = /焊|weld/i.test(d.device_type + ' ' + d.model)
        ? 'welding'
        : /打标|mark/i.test(d.device_type + ' ' + d.model)
          ? 'marking'
          : /切割|cut/i.test(d.device_type + ' ' + d.model)
            ? 'cutting'
            : 'inspection';
      const offer = (
        await registry.query(
          "INSERT INTO market.offers(id,title,category,city,published,system_only) VALUES($1,'设备报修 · 平台派单',$2,'全国',false,true) ON CONFLICT(category) WHERE system_only AND tenant_id IS NULL DO UPDATE SET category=EXCLUDED.category RETURNING id",
          [randomUUID(), category],
        )
      ).rows[0];
      const ref = await resource(asset.tenant_id, 'device', asset.local_id);
      const device = (
        await iotStore.query(
          'SELECT metrics FROM iot.devices WHERE asset_id=$1',
          [asset.id],
        )
      ).rows[0];
      const publicSnapshot = Object.fromEntries(
        device.metrics
          .filter(
            (m: any) =>
              m.customerVisible && alarm.snapshot[m.key] !== undefined,
          )
          .map((m: any) => [m.key, alarm.snapshot[m.key]]),
      );
      const payload = {
        offerId: offer.id,
        deviceRef: ref,
        deviceModel: d.model,
        city,
        address,
        description:
          '物联网告警 · ' +
          (device.metrics.some(
            (m: any) => m.key === alarm.metric && m.customerVisible,
          )
            ? alarm.label
            : '设备运行异常') +
          '：' +
          note,
        photoIds: [],
        submissionKey: alarm.id,
        intake: {
          source: 'IOT_ALARM',
          alarmId: alarm.id,
          metric: alarm.metric,
          observedValue: Number(alarm.value),
          threshold: alarm.threshold,
          detectedAt: alarm.started_at,
          snapshot: publicSnapshot,
          publicMetricKeys: device.metrics
            .filter((m: any) => m.customerVisible)
            .map((m: any) => m.key),
          engineeringSnapshot: alarm.snapshot,
          requestedBy: { kind: s.actor.kind, id: s.actor.id },
          urgency: 'normal',
        },
      };
      await iotStore.query(
        'UPDATE iot.alarms SET ticket_payload=$2,ticket_actor=$3 WHERE id=$1 AND ticket_payload IS NULL',
        [
          alarm.id,
          JSON.stringify(payload),
          JSON.stringify({ id: customer.id, phone: d.customer_phone }),
        ],
      );
      alarm = (
        await iotStore.query('SELECT * FROM iot.alarms WHERE id=$1', [alarm.id])
      ).rows[0];
    }
    if (alarm.ticket_actor.id !== customer.id)
      throw new BadRequestException(
        '客户归属已变化，请联系管理员处理已有转单请求',
      );
    const actor = {
      kind: 'customer',
      id: customer.id,
      phone: d.customer_phone,
      name: d.customer_name,
      payload: {
        purpose: 'unified_access',
        role: 'customer',
        sub: customer.id,
        version: customer.version,
        amr: 'service',
        exp: Math.floor(Date.now() / 1000) + 60,
      },
    };
    const ticket = await this.market.create(actor, alarm.ticket_payload, true);
    await iotStore.query(
      'UPDATE iot.alarms SET ticket_id=$2,ticket_number=$3 WHERE id=$1',
      [alarm.id, ticket.id, ticket.number],
    );
    await this.iot.audit(s, 'ALARM_TICKET_CREATED', {
      alarmId: id,
      ticketId: ticket.id,
      customerId: customer.id,
    });
    return ticket;
  }
}
