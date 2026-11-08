import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository, EntityManager } from 'typeorm';
import { Customer } from '../database/entities/customer.entity.js';
import { Device } from '../database/entities/device.entity.js';
import { Address } from '../database/entities/address.entity.js';
import { currentTenant } from '../tenancy/context.js';
import { indexPerson, indexAsset } from '../identity/store.js';
import {
  parseImport,
  importDate,
  digest,
  ImportIssue,
  ImportRow,
  ImportMode,
} from './customer-import-workbook.js';
@Injectable()
export class CustomerImportService {
  constructor(
    @InjectRepository(Customer) private customers: Repository<Customer>,
    private jwt: JwtService,
  ) {}
  private async plan(
    buffer: Buffer,
    m: EntityManager,
    mode: ImportMode = 'customers',
  ) {
    const parsed = await parseImport(buffer, mode),
      issues = [...parsed.issues];
    const existingCustomers = await m.find(Customer),
      existingDevices = await m.find(Device),
      existingAddresses = await m.find(Address);
    const byPhone = new Map(existingCustomers.map((c) => [c.phone, c])),
      bySerial = new Map(existingDevices.map((d) => [d.serialNumber, d]));
    const seenPhones = new Set<string>(),
      ids = new Map<string, string>(),
      seenSerials = new Set<string>();
    const customers: any[] = [],
      devices: any[] = [],
      addresses: any[] = [],
      preview: any[] = [];
    const issue = (r: ImportRow, message: string) =>
      issues.push({ sheet: r.sheet, row: r.row, message });
    for (const r of parsed.customers) {
      const v = { ...r.values },
        phone = v['手机号码'] || '',
        name = v['客户姓名'] || '';
      if (!name || name.length > 50) issue(r, '客户姓名必填且最多50字');
      if (!/^1[3-9]\d{9}$/.test(phone))
        issue(r, '手机号码必须为有效的11位号码');
      if (seenPhones.has(phone))
        issue(r, '表内手机号码重复，请每位客户只保留一行');
      seenPhones.add(phone);
      if (v['客户编号']) {
        if (ids.has(v['客户编号'])) issue(r, '客户编号重复');
        ids.set(v['客户编号'], phone);
      }
      const old = byPhone.get(phone);
      if (old && old.name !== name)
        issue(r, '该手机号已属于客户「' + old.name + '」，请核对姓名');
      if (v['电子邮箱'] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v['电子邮箱']))
        issue(r, '电子邮箱格式不正确');
      for (const key of ['下次跟进日期'])
        if (v[key])
          try {
            v[key] = importDate(v[key]);
          } catch (e: any) {
            issue(r, key + '：' + e.message);
          }
      if (v['客户类型'] && !['企业', '个人'].includes(v['客户类型']))
        issue(r, '客户类型请填写企业或个人');
      const customer = { source: r, phone, name, old, profile: v };
      customers.push(customer);
      const region = ['省份', '城市', '区县', '详细地址'];
      if (region.some((k) => v[k])) {
        if (region.some((k) => !v[k]))
          issue(r, '地址必须同时填写省份、城市、区县和详细地址');
        if (
          region.slice(0, 3).some((k) => (v[k] || '').length > 20) ||
          (v['详细地址'] || '').length > 200
        )
          issue(r, '省市区最多20字，详细地址最多200字');
        const same =
          old &&
          existingAddresses.some(
            (a) =>
              a.customerId === old.id &&
              a.province === v['省份'] &&
              a.city === v['城市'] &&
              a.district === v['区县'] &&
              a.detail === v['详细地址'],
          );
        if (!same) addresses.push(customer);
      }
      preview.push({
        sheet: r.sheet,
        row: r.row,
        label: name || '未填写姓名',
        identifier: phone,
        action: old ? '跳过已有客户' : '新增客户',
      });
    }
    for (const r of parsed.devices) {
      const v = { ...r.values },
        serial = (v['设备序列号'] || '').replace(/\s+/g, '');
      let phone = v['客户手机号'] || ids.get(v['客户编号']) || '';
      let owner: any;
      if (mode === 'devices') {
        const matches = v['客户编号']
          ? existingCustomers.filter(
              (c) => c.profile?.['客户编号'] === v['客户编号'],
            )
          : [];
        if (v['客户编号'] && matches.length !== 1)
          issue(
            r,
            matches.length
              ? '客户编号对应多位客户，请改用客户手机号'
              : '该客户编号不存在，请先登记客户或填写已登记的客户手机号',
          );
        if (
          v['客户手机号'] &&
          v['客户编号'] &&
          matches.length === 1 &&
          matches[0].phone !== v['客户手机号']
        )
          issue(r, '客户编号与客户手机号指向不同客户');
        phone =
          v['客户手机号'] || (matches.length === 1 ? matches[0].phone : '');
        const existing = byPhone.get(phone);
        if (existing) {
          owner = customers.find((c) => c.phone === phone);
          if (!owner) {
            owner = {
              phone,
              name: existing.name,
              old: existing,
              profile: existing.profile,
            };
            customers.push(owner);
          }
        } else
          issue(
            r,
            '请填写本企业已登记的客户手机号或客户编号；客户不存在时请先新增客户',
          );
      } else {
        if (v['客户编号'] && !ids.has(v['客户编号']))
          issue(r, '客户编号未在本次客户名单中找到');
        if (
          v['客户手机号'] &&
          v['客户编号'] &&
          ids.get(v['客户编号']) !== v['客户手机号']
        )
          issue(r, '客户编号与客户手机号指向不同客户');
        owner = customers.find((c) => c.phone === phone);
        if (!owner) issue(r, '请用客户编号或客户手机号关联本次客户名单');
      }
      if (!serial || serial.length > 50) issue(r, '设备序列号必填且最多50字');
      if (seenSerials.has(serial)) issue(r, '表内设备序列号重复');
      seenSerials.add(serial);
      if (!v['设备型号'] || v['设备型号'].length > 100)
        issue(r, '设备型号必填且最多100字');
      if (!v['设备类型'] || v['设备类型'].length > 50)
        issue(r, '设备类型必填且最多50字');
      for (const key of ['购机日期', '质保到期日', '维保到期日'])
        if (v[key])
          try {
            v[key] = importDate(v[key]);
          } catch (e: any) {
            issue(r, key + '：' + e.message);
          }
      if (v['购机日期'] && v['质保到期日'] && v['购机日期'] > v['质保到期日'])
        issue(r, '质保到期日不能早于购机日期');
      const old = bySerial.get(serial);
      if (old) {
        if (!owner?.old || old.customerId !== owner.old.id)
          issue(r, '序列号已属于其他客户或未绑定，请在设备管理中核对');
        else if (
          old.model !== v['设备型号'] ||
          old.deviceType !== v['设备类型'] ||
          (v['购机日期'] &&
            String(old.purchaseDate).slice(0, 10) !== v['购机日期']) ||
          (v['质保到期日'] &&
            String(old.warrantyExpire).slice(0, 10) !== v['质保到期日'])
        )
          issue(r, '相同序列号的设备资料与系统不一致，请先核对');
      }
      devices.push({ source: r, values: v, serial, owner, old });
      preview.push({
        sheet: r.sheet,
        row: r.row,
        label: v['设备型号'] || '未填写型号',
        identifier: serial,
        action: old ? '跳过已有设备' : '新增设备',
      });
    }
    const state = digest({
      customers: existingCustomers
        .map((c) => [c.id, c.phone, c.name, c.updatedAt])
        .sort(),
      devices: existingDevices
        .map((d) => [d.id, d.customerId, d.serialNumber, d.model, d.updatedAt])
        .sort(),
      addresses: existingAddresses.map((a) => [a.id, a.updatedAt]).sort(),
    });
    const summary = {
      newCustomers: customers.filter((c) => !c.old).length,
      skippedCustomers:
        mode === 'devices' ? 0 : customers.filter((c) => c.old).length,
      skippedExamples: parsed.skippedExamples,
      newDevices: devices.filter((d) => !d.old).length,
      skippedDevices: devices.filter((d) => d.old).length,
      newAddresses: addresses.length,
    };
    return { customers, devices, addresses, summary, issues, preview, state };
  }
  async preview(
    buffer: Buffer,
    userId: string,
    mode: ImportMode = 'customers',
  ) {
    const p = await this.plan(buffer, this.customers.manager, mode);
    return {
      summary: p.summary,
      issues: p.issues,
      rows: p.preview,
      token: p.issues.length
        ? null
        : this.jwt.sign(
            {
              purpose: 'customer_import',
              mode,
              tenantId: currentTenant().id,
              sub: userId,
              file: digest(buffer.toString('base64')),
              state: p.state,
            },
            { expiresIn: '15m' },
          ),
    };
  }
  async commit(
    buffer: Buffer,
    userId: string,
    token: string,
    mode: ImportMode = 'customers',
  ) {
    let ticket: any;
    try {
      ticket = this.jwt.verify(token);
    } catch {
      throw new BadRequestException('导入预览已失效，请重新检查文件');
    }
    if (
      ticket.purpose !== 'customer_import' ||
      (ticket.mode || 'customers') !== mode ||
      ticket.tenantId !== currentTenant().id ||
      ticket.sub !== userId ||
      ticket.file !== digest(buffer.toString('base64'))
    )
      throw new BadRequestException('文件或企业已变化，请重新检查文件');
    const saved = await this.customers.manager.transaction(async (m) => {
      await m.query(
        'LOCK TABLE customers,devices,addresses IN SHARE ROW EXCLUSIVE MODE',
      );
      const p = await this.plan(buffer, m, mode);
      if (p.issues.length)
        throw new BadRequestException('表格包含错误，请重新检查文件');
      if (p.state !== ticket.state)
        throw new ConflictException(
          '客户或设备数据已变化，请重新检查后确认导入',
        );
      const local = new Map<string, Customer>();
      for (const row of p.customers) {
        let c = row.old;
        if (!c) {
          const profile = { ...row.profile };
          delete profile['客户姓名'];
          delete profile['手机号码'];
          profile['设备补充资料'] = p.devices
            .filter((d) => d.owner === row)
            .map((d) => ({ ...d.values, 设备序列号: d.serial }));
          c = await m.save(
            Customer,
            m.create(Customer, { name: row.name, phone: row.phone, profile }),
          );
        }
        if (row.old) {
          const extras = p.devices
            .filter((d) => d.owner === row && !d.old)
            .map((d) => ({ ...d.values, 设备序列号: d.serial }));
          if (extras.length) {
            const previous = Array.isArray(c.profile?.['设备补充资料'])
              ? c.profile['设备补充资料']
              : [];
            c.profile = {
              ...c.profile,
              设备补充资料: [
                ...previous,
                ...extras.filter(
                  (d) =>
                    !previous.some(
                      (old: any) => old['设备序列号'] === d['设备序列号'],
                    ),
                ),
              ],
            };
            c = await m.save(Customer, c);
          }
        }
        local.set(row.phone, c);
      }
      for (const row of p.addresses) {
        const c = local.get(row.phone)!;
        await m.save(
          Address,
          m.create(Address, {
            customerId: c.id,
            province: row.profile['省份'],
            city: row.profile['城市'],
            district: row.profile['区县'],
            detail: row.profile['详细地址'],
            label: '设备地址',
            isDefault: !(await m.count(Address, {
              where: { customerId: c.id, isDefault: true },
            })),
          }),
        );
      }
      const assets: Device[] = [];
      for (const row of p.devices) {
        let device = row.old;
        if (!device)
          device = await m.save(
            Device,
            m.create(Device, {
              customerId: local.get(row.owner.phone)!.id,
              serialNumber: row.serial,
              model: row.values['设备型号'],
              deviceType: row.values['设备类型'],
              purchaseDate: row.values['购机日期'] || null,
              warrantyExpire: row.values['质保到期日'] || null,
            } as any),
          );
        assets.push(device);
      }
      return { summary: p.summary, customers: [...local.values()], assets };
    });
    let identitySynced = true;
    try {
      for (const c of saved.customers)
        await indexPerson(
          currentTenant().id,
          'customer',
          c.id,
          c.phone,
          c.name,
        );
      for (const d of saved.assets)
        await indexAsset(currentTenant().id, d.id, d.serialNumber);
    } catch {
      identitySynced = false;
    }
    return {
      summary: saved.summary,
      identitySynced,
      message: identitySynced
        ? '导入完成'
        : '资料已保存，但登录关联同步失败；请重新导入同一文件以重试同步，不会重复新增',
    };
  }
}
