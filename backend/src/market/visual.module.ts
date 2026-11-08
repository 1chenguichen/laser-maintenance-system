import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Injectable,
  Module,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { registry } from '../tenancy/registry.js';
import { personLinks, businessClient, resource } from '../identity/store.js';
import { MarketModule, MarketGuard, MarketService } from './market.module.js';
import { AuthModule } from '../auth/auth.module.js';
function uuid(id: any) {
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new BadRequestException('图片关联编号无效');
  return id;
}
const SLOTS: Record<string, string[]> = {
  device: ['overview', 'nameplate', 'component'],
  request: ['REPORTED', 'DIAGNOSIS', 'AFTER'],
  legacy: ['REPORTED', 'DIAGNOSIS', 'AFTER'],
  engineer: ['portrait', 'skill'],
  company: ['team', 'workshop'],
  part: ['product', 'packaging', 'label'],
  course: ['cover', 'venue', 'practice'],
};
@Injectable()
class VisualService {
  constructor(private market: MarketService) {}
  async engineer(a: any, id: string) {
    await this.access(a, 'engineer', id);
    const person = (
        await registry.query(
          'SELECT id,name FROM identity.people WHERE id=$1',
          [id],
        )
      ).rows[0],
      profile = (
        await registry.query(
          'SELECT mode,cities,introduction,state FROM market.engineers WHERE person_id=$1',
          [id],
        )
      ).rows[0];
    const employers = (
      await registry.query(
        "SELECT t.id,t.name,t.company_logo AS logo FROM identity.links l JOIN identity.people p ON p.id=l.person_id JOIN platform.memberships m ON m.tenant_id=l.tenant_id AND m.subject_id=l.local_id::text AND m.role='engineer' AND m.phone=p.phone AND m.enabled JOIN platform.tenants t ON t.id=l.tenant_id AND t.enabled AND (t.expires_at IS NULL OR t.expires_at>now()) WHERE l.person_id=$1 AND l.role='engineer'",
        [id],
      )
    ).rows;
    const skills = (
      await registry.query(
        'SELECT skill,expires_at FROM market.qualifications WHERE person_id=$1 AND expires_at>now()',
        [id],
      )
    ).rows;
    return { ...person, profile, employers, skills };
  }
  async company(a: any, id: string) {
    uuid(id);
    if (['customer', 'engineer'].includes(a.kind)) {
      const link = (
        await registry.query(
          'SELECT tenant_id FROM identity.links WHERE id=$1 AND person_id=$2',
          [id, a.id],
        )
      ).rows[0];
      if (link) id = link.tenant_id;
    }
    const t = (
      await registry.query(
        "SELECT id,name,company_profile,company_logo,contact_phone FROM platform.tenants WHERE id=$1 AND enabled AND provisioning_status='READY' AND (expires_at IS NULL OR expires_at>now())",
        [id],
      )
    ).rows[0];
    if (!t) throw new NotFoundException('服务企业不可用');
    const p = t.company_profile || {};
    return {
      id: t.id,
      name: t.name,
      logo: t.company_logo,
      description: p.description || '',
      address: p.address || '',
      serviceArea: p.serviceArea || '',
      serviceHours: p.serviceHours || '',
      contactPhone: t.contact_phone || '',
      shortName: p.shortName || '',
    };
  }
  async access(
    a: any,
    kind: string,
    id: string,
    write = false,
    slot?: string,
  ): Promise<any> {
    uuid(id);
    if (!SLOTS[kind]) throw new BadRequestException('不支持的图片类型');
    if (write && !SLOTS[kind].includes(slot || ''))
      throw new BadRequestException('请选择正确的图片用途');
    if (kind === 'company') {
      const company = await this.company(a, id);
      if (write && (a.kind !== 'company' || a.tenantId !== company.id))
        throw new ForbiddenException('仅所属企业管理员可维护企业图片');
      return {
        id: company.id,
        tenantId: company.id,
        canUpload: a.kind === 'company' && a.tenantId === company.id,
        company,
      };
    }
    if (kind === 'course') {
      const course = (
        await registry.query('SELECT * FROM market.courses WHERE id=$1', [id])
      ).rows[0];
      if (!course || (!course.published && a.kind !== 'platform'))
        throw new NotFoundException('课程不存在');
      if (write && a.kind !== 'platform')
        throw new ForbiddenException('仅平台可维护培训图片');
      return { id, canUpload: a.kind === 'platform' };
    }
    if (kind === 'engineer') {
      const person = (
        await registry.query(
          'SELECT p.id,p.name,p.enabled,e.state FROM identity.people p LEFT JOIN market.engineers e ON e.person_id=p.id WHERE p.id=$1 AND p.enabled',
          [id],
        )
      ).rows[0];
      if (!person || (id !== a.id && person.state !== 'APPROVED'))
        throw new NotFoundException('工程师资料不可用');
      const own = ['customer', 'engineer'].includes(a.kind) && id === a.id;
      if (write && !own) throw new ForbiddenException('仅本人可维护工程师图片');
      return { id, canUpload: own };
    }
    if (kind === 'request') {
      const request = await this.market.detail(a, id);
      const allowed =
        (a.kind === 'customer' &&
          request.customer_id === a.id &&
          !['COMPLETED', 'CANCELLED'].includes(request.status)) ||
        (a.kind === 'engineer' &&
          request.engineer_id === a.id &&
          [
            'ACCEPTED',
            'APPROVED',
            'IN_SERVICE',
            'AWAITING_ACCEPTANCE',
          ].includes(request.status));
      if (write) {
        if (!allowed) throw new ForbiddenException('当前阶段不可上传服务照片');
        if (a.kind === 'customer' && slot !== 'REPORTED')
          throw new ForbiddenException('客户仅能补充报修照片');
        if (
          a.kind === 'engineer' &&
          (!['DIAGNOSIS', 'AFTER'].includes(slot || '') ||
            (slot === 'AFTER' &&
              !['IN_SERVICE', 'AWAITING_ACCEPTANCE'].includes(request.status)))
        )
          throw new ForbiddenException('请在正确服务阶段上传照片');
      }
      return {
        id,
        requestId: id,
        canUpload: allowed,
        slots:
          a.kind === 'customer'
            ? ['REPORTED']
            : [
                'DIAGNOSIS',
                ...(['IN_SERVICE', 'AWAITING_ACCEPTANCE'].includes(
                  request.status,
                )
                  ? ['AFTER']
                  : []),
              ],
      };
    }
    const resourceKind = kind === 'legacy' ? 'order' : kind;
    let ref = (
      await registry.query(
        'SELECT * FROM identity.resources WHERE id=$1 AND kind=$2',
        [id, resourceKind],
      )
    ).rows[0];
    if (a.kind === 'company' && !ref) {
      ref = { tenant_id: a.tenantId, local_id: id };
    }
    if (!ref || (a.kind === 'company' && ref.tenant_id !== a.tenantId))
      throw new NotFoundException('资料不存在');
    const tenant = (
      await registry.query(
        "SELECT * FROM platform.tenants WHERE id=$1 AND enabled AND provisioning_status='READY' AND (expires_at IS NULL OR expires_at>now())",
        [ref.tenant_id],
      )
    ).rows[0];
    if (!tenant) throw new NotFoundException('资料所属企业不可用');
    const links = ['customer', 'engineer'].includes(a.kind)
        ? await personLinks(a.payload)
        : [],
      link = links.find((l: any) => l.id === tenant.id);
    const db = businessClient(tenant.database_name);
    try {
      await db.connect();
      const table =
        kind === 'device'
          ? 'devices'
          : kind === 'part'
            ? 'parts'
            : 'work_orders';
      const row = (
        await db.query('SELECT * FROM ' + table + ' WHERE id=$1', [
          ref.local_id,
        ])
      ).rows[0];
      if (!row) throw new NotFoundException('资料不存在');
      let allowed =
          a.kind === 'platform' ||
          (a.kind === 'company' && a.tenantId === tenant.id),
        canUpload = a.kind === 'company' && a.tenantId === tenant.id;
      if (kind === 'part' && a.kind === 'engineer' && link) allowed = true;
      if (kind === 'device') {
        if (a.kind === 'customer' && link) {
          allowed = !!(
            await db.query('SELECT 1 FROM customers WHERE id=$1 AND phone=$2', [
              row.customer_id,
              a.phone,
            ])
          ).rows.length;
          canUpload = allowed;
        }
        if (a.kind === 'engineer') {
          allowed = !!(
            await registry.query(
              'SELECT 1 FROM market.requests WHERE device_ref=$1 AND engineer_id=$2',
              [id, a.id],
            )
          ).rows.length;
          if (!allowed && link)
            allowed = !!(
              await db.query(
                'SELECT 1 FROM work_orders WHERE device_id=$1 AND engineer_id=$2',
                [row.id, link.local_id],
              )
            ).rows.length;
        }
      }
      if (kind === 'legacy') {
        if (a.kind === 'customer' && link)
          allowed = !!(
            await db.query('SELECT 1 FROM customers WHERE id=$1 AND phone=$2', [
              row.customer_id,
              a.phone,
            ])
          ).rows.length;
        if (a.kind === 'engineer' && link)
          allowed = row.engineer_id === link.local_id;
        canUpload =
          allowed &&
          ((a.kind === 'customer' &&
            !['COMPLETED', 'CANCELLED'].includes(row.status)) ||
            (a.kind === 'engineer' &&
              [
                'ACCEPTED',
                'PENDING_PAYMENT',
                'REPAIRING',
                'PENDING_FINAL_PAYMENT',
              ].includes(row.status)));
        if (
          write &&
          ((a.kind === 'customer' && slot !== 'REPORTED') ||
            (a.kind === 'engineer' &&
              (!['DIAGNOSIS', 'AFTER'].includes(slot || '') ||
                (slot === 'AFTER' &&
                  !['REPAIRING', 'PENDING_FINAL_PAYMENT'].includes(
                    row.status,
                  )))))
        )
          canUpload = false;
      }
      if (!allowed) throw new NotFoundException('资料不存在');
      if (write && !canUpload)
        throw new ForbiddenException('当前身份或阶段不可维护图片');
      const canonical = await resource(tenant.id, resourceKind, ref.local_id);
      return {
        id: canonical,
        tenantId: tenant.id,
        canUpload,
        slots:
          kind === 'legacy'
            ? a.kind === 'customer'
              ? ['REPORTED']
              : [
                  'DIAGNOSIS',
                  ...(['REPAIRING', 'PENDING_FINAL_PAYMENT'].includes(
                    row.status,
                  )
                    ? ['AFTER']
                    : []),
                ]
            : SLOTS[kind],
        record:
          kind === 'device'
            ? {
                model: row.model,
                serialNumber: row.serial_number,
                deviceType: row.device_type,
                warrantyExpire: row.warranty_expire,
                serviceName: tenant.name,
              }
            : undefined,
      };
    } finally {
      await db.end();
    }
  }
  async list(a: any, kind: string, id: string) {
    const access = await this.access(a, kind, id);
    const items = (
      await registry.query(
        'SELECT id,slot,actor_kind,actor_id,created_at FROM market.visuals WHERE kind=$1 AND entity_id=$2 ORDER BY created_at',
        [kind, access.id],
      )
    ).rows;
    if (kind === 'request')
      items.push(
        ...(
          await registry.query(
            "SELECT id,'REPORTED' AS slot,'customer' AS actor_kind,owner_id AS actor_id,created_at,'attachment' AS source FROM market.attachments WHERE request_id=$1 ORDER BY created_at",
            [id],
          )
        ).rows,
      );
    return {
      ...access,
      slots: ['request', 'legacy'].includes(kind)
        ? SLOTS[kind]
        : access.slots || SLOTS[kind],
      uploadSlots: access.slots || SLOTS[kind],
      items: items.map((item) => ({
        id: item.id,
        slot: item.slot,
        created_at: item.created_at,
        source: item.source,
        canDelete:
          !item.source &&
          access.canUpload &&
          ((kind !== 'request' && kind !== 'legacy') ||
            (item.actor_kind === a.kind && item.actor_id === a.id)),
      })),
    };
  }
  async save(a: any, b: any, file: any) {
    const access = await this.access(a, b.kind, b.id, true, b.slot);
    if (
      !file?.buffer ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    )
      throw new BadRequestException('请上传 JPG、PNG 或 WebP 图片');
    if (
      (
        await registry.query(
          "SELECT count(*)::int n FROM market.visuals WHERE actor_kind=$1 AND actor_id=$2 AND created_at>now()-interval '1 day'",
          [a.kind, a.id],
        )
      ).rows[0].n >= 60
    )
      throw new BadRequestException('今日图片上传已达上限');
    let buffer: Buffer;
    try {
      const image = sharp(file.buffer, { limitInputPixels: 25000000 });
      if (
        !['jpeg', 'png', 'webp'].includes((await image.metadata()).format || '')
      )
        throw Error();
      buffer = await image
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException('图片无法读取');
    }
    const id = randomUUID(),
      dir = join(process.cwd(), 'private-market-media'),
      path = join(dir, id + '.webp');
    await mkdir(dir, { recursive: true });
    await writeFile(path, buffer);
    const c = await registry.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        b.kind + ':' + access.id,
      ]);
      if (
        (
          await c.query(
            'SELECT count(*)::int n FROM market.visuals WHERE kind=$1 AND entity_id=$2',
            [b.kind, access.id],
          )
        ).rows[0].n >= 12
      )
        throw new BadRequestException('本项资料最多保留12张图片，请先移除旧图');
      await this.access(a, b.kind, b.id, true, b.slot);
      await c.query(
        'INSERT INTO market.visuals(id,kind,entity_id,tenant_id,request_id,slot,actor_kind,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          id,
          b.kind,
          access.id,
          access.tenantId || null,
          access.requestId || null,
          b.slot,
          a.kind,
          a.id,
        ],
      );
      await c.query('COMMIT');
      return { id };
    } catch (e) {
      await c.query('ROLLBACK');
      await unlink(path).catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  async content(a: any, id: string) {
    const row = (
      await registry.query('SELECT * FROM market.visuals WHERE id=$1', [
        uuid(id),
      ])
    ).rows[0];
    if (!row) throw new NotFoundException('图片不存在');
    await this.access(a, row.kind, row.entity_id);
    try {
      return new StreamableFile(
        await readFile(
          join(process.cwd(), 'private-market-media', id + '.webp'),
        ),
        { type: 'image/webp', disposition: 'inline' },
      );
    } catch {
      throw new NotFoundException('图片不存在');
    }
  }
  async remove(a: any, id: string) {
    const row = (
      await registry.query('SELECT * FROM market.visuals WHERE id=$1', [
        uuid(id),
      ])
    ).rows[0];
    if (!row) throw new NotFoundException('图片不存在');
    await this.access(a, row.kind, row.entity_id, true, row.slot);
    if (
      ['request', 'legacy'].includes(row.kind) &&
      (row.actor_kind !== a.kind || row.actor_id !== a.id)
    )
      throw new ForbiddenException('只能移除本人上传的服务照片');
    await registry.query('DELETE FROM market.visuals WHERE id=$1', [id]);
    await unlink(
      join(process.cwd(), 'private-market-media', id + '.webp'),
    ).catch(() => {});
    return { message: '图片已移除' };
  }
}
@Controller('market/visual')
@UseGuards(MarketGuard)
class VisualController {
  constructor(private service: VisualService) {}
  @Get() list(
    @Request() r: any,
    @Query('kind') kind: string,
    @Query('id') id: string,
  ) {
    return this.service.list(r.marketActor, kind, id);
  }
  @Post()
  @UseInterceptors(
    FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  save(@Request() r: any, @Body() b: any, @UploadedFile() file: any) {
    return this.service.save(r.marketActor, b, file);
  }
  @Get('company/:id') company(@Request() r: any, @Param('id') id: string) {
    return this.service.company(r.marketActor, id);
  }
  @Get('engineer/:id') engineer(@Request() r: any, @Param('id') id: string) {
    return this.service.engineer(r.marketActor, id);
  }
  @Get(':id/content') content(@Request() r: any, @Param('id') id: string) {
    return this.service.content(r.marketActor, id);
  }
  @Delete(':id') remove(@Request() r: any, @Param('id') id: string) {
    return this.service.remove(r.marketActor, id);
  }
}
@Module({
  imports: [MarketModule, AuthModule],
  providers: [VisualService],
  controllers: [VisualController],
})
export class VisualModule {}
