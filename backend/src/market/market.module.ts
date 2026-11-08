import {IoTIntakePrivacy} from '../iot/privacy.interceptor.js';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  Injectable,
  Module,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  CanActivate,
  ExecutionContext,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import sharp from 'sharp';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, createHash } from 'node:crypto';
import { registry, validateIdentity } from '../tenancy/registry.js';
import {
  validatePerson,
  personLinks,
  businessClient,
} from '../identity/store.js';
import { AuthModule } from '../auth/auth.module.js';
import { CATEGORIES } from './schema.js';
import { ServiceNetworkService } from './service-network.js';
function text(v: any, label: string, min = 1, max = 200) {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max)
    throw new BadRequestException(
      label + '请填写' + min + '至' + max + '个字符',
    );
  return v.trim();
}
function uuid(v: any) {
  if (
    typeof v !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    )
  )
    throw new BadRequestException('记录编号无效');
  return v;
}
function skill(v: any) {
  if (!CATEGORIES.includes(v))
    throw new BadRequestException('请选择有效服务类别');
  return v;
}
const SELECT = `SELECT r.*,o.title AS service_title,ct.name AS commissioner_name,pt.name AS provider_name,at.name AS assigned_provider_name,p.name AS engineer_name,coalesce(r.service_kind_snapshot,sp.kind) AS service_kind FROM market.requests r JOIN market.offers o ON o.id=r.offer_id LEFT JOIN platform.tenants ct ON ct.id=r.commissioner_id LEFT JOIN platform.tenants pt ON pt.id=r.provider_id LEFT JOIN platform.tenants at ON at.id=r.assigned_provider_id LEFT JOIN identity.people p ON p.id=r.engineer_id LEFT JOIN market.service_profiles sp ON sp.tenant_id=r.assigned_provider_id `;
@Injectable()
export class MarketGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  async canActivate(c: ExecutionContext) {
    const req = c.switchToHttp().getRequest();
    let payload: any;
    try {
      payload = this.jwt.verify(
        (req.headers.authorization || '').replace(/^Bearer /, ''),
      );
    } catch {
      throw new UnauthorizedException('请重新登录');
    }
    if (
      payload.purpose === 'platform_access' &&
      payload.role === 'platform_admin'
    ) {
      const admin = (
        await registry.query(
          'SELECT id,name FROM platform.admins WHERE id=$1 AND version=$2 AND enabled',
          [payload.sub, payload.version],
        )
      ).rows[0];
      if (!admin) throw new UnauthorizedException('平台身份已失效');
      req.marketActor = { kind: 'platform', id: admin.id, name: admin.name };
      return true;
    }
    if (payload.purpose === 'access' && payload.role === 'cs_operator') {
      const tenant = await validateIdentity(payload);
      req.marketActor = {
        kind: 'company',
        id: payload.sub,
        tenantId: tenant.id,
        name: tenant.name,
      };
      return true;
    }
    const person = await validatePerson(payload);
    req.marketActor = {
      kind: payload.role,
      id: person.id,
      name: person.name,
      phone: person.phone,
      payload,
    };
    return true;
  }
}
@Injectable()
export class MarketService {
  constructor(private network: ServiceNetworkService) {}
  private role(a: any, ...roles: string[]) {
    if (!roles.includes(a.kind))
      throw new ForbiddenException('当前身份无权执行此操作');
  }
  private async tx(fn: (c: any) => Promise<any>) {
    const c = await registry.connect();
    try {
      await c.query('BEGIN');
      const v = await fn(c);
      await c.query('COMMIT');
      return v;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  private async log(
    c: any,
    a: any,
    id: string | null,
    action: string,
    note = '',
  ) {
    await c.query(
      'INSERT INTO market.events(id,request_id,actor_id,action,note) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), id, a.id, action, note],
    );
  }
  async catalog(city = '', category = '') {
    if (city.length > 50) throw new BadRequestException('城市过长');
    if (category) skill(category);
    return (
      await registry.query(
        `SELECT o.*,t.name AS provider_name,t.company_logo AS logo FROM market.offers o LEFT JOIN platform.tenants t ON t.id=o.tenant_id WHERE o.published AND NOT o.system_only AND (o.tenant_id IS NULL OR (t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()))) AND ($1='' OR o.city=$1 OR o.city='全国') AND ($2='' OR o.category=$2) ORDER BY o.created_at DESC LIMIT 200`,
        [city, category],
      )
    ).rows;
  }
  async courses(a: any) {
    return (
      await registry.query(
        `SELECT c.*,c.start_date::text AS start_date,(SELECT count(*)::int FROM market.enrollments e WHERE e.course_id=c.id AND e.state<>'CANCELLED') AS enrolled,(SELECT state FROM market.enrollments WHERE course_id=c.id AND person_id=$1) AS my_state FROM market.courses c WHERE c.published ORDER BY c.start_date,c.id LIMIT 200`,
        [a.id],
      )
    ).rows;
  }
  async me(a: any) {
    this.role(a, 'customer', 'engineer');
    return {
      person: { name: a.name, phone: a.phone },
      engineer:
        (
          await registry.query(
            'SELECT * FROM market.engineers WHERE person_id=$1',
            [a.id],
          )
        ).rows[0] || null,
      qualifications: (
        await registry.query(
          'SELECT * FROM market.qualifications WHERE person_id=$1 ORDER BY updated_at DESC',
          [a.id],
        )
      ).rows,
      employers: (await personLinks({ ...a.payload, role: 'engineer' })).map(
        (l: any) => ({ id: l.link_id, tenantId: l.id, name: l.name }),
      ),
      enrollments: (
        await registry.query(
          'SELECT e.*,c.title,c.center_name,c.skill FROM market.enrollments e JOIN market.courses c ON c.id=e.course_id WHERE e.person_id=$1',
          [a.id],
        )
      ).rows,
    };
  }
  async profile(a: any, b: any) {
    this.role(a, 'customer', 'engineer');
    const mode = b.mode;
    if (!['ORG', 'INDEPENDENT'].includes(mode))
      throw new BadRequestException('请选择服务身份');
    if (!Array.isArray(b.cities) || !b.cities.length || b.cities.length > 20)
      throw new BadRequestException('请填写服务城市，最多20个');
    const cities = [
      ...new Set(b.cities.map((v: any) => text(v, '服务城市', 1, 30))),
    ];
    if (
      mode === 'ORG' &&
      !(await personLinks({ ...a.payload, role: 'engineer' })).length
    )
      throw new BadRequestException(
        '尚未关联服务机构，请联系企业管理员或选择平台合作工程师',
      );
    const intro = text(b.introduction, '服务经历', 5, 1000),
      name = text(b.name, '姓名', 2, 50);
    return this.tx(async (c) => {
      await c.query('UPDATE identity.people SET name=$2 WHERE id=$1', [
        a.id,
        name,
      ]);
      await c.query(
        "INSERT INTO market.engineers(person_id,mode,cities,introduction) VALUES($1,$2,$3,$4) ON CONFLICT(person_id) DO UPDATE SET mode=EXCLUDED.mode,cities=EXCLUDED.cities,introduction=EXCLUDED.introduction,state='PENDING',review_note='',updated_at=now()",
        [a.id, mode, JSON.stringify(cities), intro],
      );
      await this.log(c, a, null, 'ENGINEER_APPLICATION');
      return { message: '申请已提交，审核通过并取得相应资质后可接单' };
    });
  }
  private async boundDevice(a: any, id: string) {
    const ref = (
        await registry.query(
          "SELECT * FROM identity.resources WHERE id=$1 AND kind='device'",
          [uuid(id)],
        )
      ).rows[0],
      links = await personLinks(a.payload);
    const link = ref && links.find((l: any) => l.id === ref.tenant_id);
    if (!link) throw new ForbiddenException('设备不属于当前客户');
    const db = businessClient(link.database_name);
    try {
      await db.connect();
      const device = (
        await db.query(
          'SELECT d.* FROM devices d JOIN customers c ON c.id=d.customer_id WHERE d.id=$1 AND c.phone=$2',
          [ref.local_id, a.phone],
        )
      ).rows[0];
      if (!device) throw new ForbiddenException('设备归属已变化');
      return { ref, device };
    } finally {
      await db.end();
    }
  }
  async deviceRepair(a: any, b: any) {
    this.role(a, 'customer');
    if (b.contractId)
      throw new BadRequestException('企业合同请使用协议报修流程');
    const { device } = await this.boundDevice(a, b.deviceId);
    const address = (
      await registry.query(
        'SELECT data FROM identity.addresses WHERE id=$1 AND person_id=$2 AND NOT deleted',
        [uuid(b.addressId), a.id],
      )
    ).rows[0]?.data;
    if (!address)
      throw new BadRequestException('服务地址不存在或不属于当前客户');
    const category = /焊|weld/i.test(device.device_type + ' ' + device.model)
      ? 'welding'
      : /打标|mark/i.test(device.device_type + ' ' + device.model)
        ? 'marking'
        : /切割|cut/i.test(device.device_type + ' ' + device.model)
          ? 'cutting'
          : 'inspection';
    const offer = (
      await registry.query(
        "INSERT INTO market.offers(id,title,category,city,published,system_only) VALUES($1,'设备报修 · 平台派单',$2,'全国',false,true) ON CONFLICT(category) WHERE system_only AND tenant_id IS NULL DO UPDATE SET category=EXCLUDED.category RETURNING id",
        [randomUUID(), category],
      )
    ).rows[0];
    const fault = text(b.faultType, '故障类型', 1, 50),
      description = text(b.faultDescription, '故障描述', 5, 2000);
    if (
      !['normal', 'urgent'].includes(b.urgency) ||
      !['asap', 'tomorrow', 'this_week'].includes(b.preferredTime)
    )
      throw new BadRequestException('请选择有效的紧急程度和上门时间');
    if (
      !Array.isArray(b.photoIds) ||
      b.photoIds.length > 5 ||
      new Set(b.photoIds).size !== b.photoIds.length
    )
      throw new BadRequestException('最多上传5张故障图片');
    b.photoIds.forEach(uuid);
    return this.create(
      a,
      {
        offerId: offer.id,
        deviceRef: b.deviceId,
        deviceModel: device.model,
        city: address.city,
        address: [
          address.province,
          address.city,
          address.district,
          address.detail,
        ]
          .filter(Boolean)
          .join(' '),
        description: fault + '：' + description,
        photoIds: b.photoIds,
        submissionKey: uuid(b.clientRequestId),
        intake: {
          source: 'DEVICE_REPAIR',
          faultType: fault,
          urgency: b.urgency,
          preferredTime: b.preferredTime,
          warrantyExpire: device.warranty_expire || null,
        },
      },
      true,
    );
  }
  async upload(a: any, file: any) {
    this.role(a, 'customer');
    if (
      !file?.buffer ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    )
      throw new BadRequestException('请上传 JPG、PNG 或 WebP 图片');
    if (
      (
        await registry.query(
          "SELECT count(*)::int n FROM market.attachments WHERE owner_id=$1 AND created_at>now()-interval '1 day'",
          [a.id],
        )
      ).rows[0].n >= 40
    )
      throw new BadRequestException('今日图片上传次数已达上限');
    let buffer: Buffer;
    try {
      const image = sharp(file.buffer, { limitInputPixels: 25000000 });
      if (
        !['jpeg', 'png', 'webp'].includes((await image.metadata()).format || '')
      )
        throw Error('Unsupported image');
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
      throw new BadRequestException('图片无法读取，请更换文件');
    }
    const id = randomUUID(),
      dir = join(process.cwd(), 'private-market-media');
    await mkdir(dir, { recursive: true });
    const path = join(dir, id + '.webp');
    await writeFile(path, buffer);
    try {
      await registry.query(
        'INSERT INTO market.attachments(id,owner_id) VALUES($1,$2)',
        [id, a.id],
      );
    } catch (e) {
      await unlink(path);
      throw e;
    }
    return { id };
  }
  async attachment(a: any, id: string) {
    const file = (
      await registry.query('SELECT * FROM market.attachments WHERE id=$1', [
        uuid(id),
      ])
    ).rows[0];
    if (!file) throw new NotFoundException('图片不存在');
    if (file.request_id) await this.detail(a, file.request_id);
    else if (a.kind !== 'customer' || file.owner_id !== a.id)
      throw new NotFoundException('图片不存在');
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
  async create(a: any, b: any, internal = false) {
    this.role(a, 'customer');
    const offerId = uuid(b.offerId),
      city = text(b.city, '服务城市', 1, 50),
      address = text(b.address, '上门地址', 3, 200),
      description = text(b.description, '服务需求', 5, 2000);
    let commissioner: string | null = null,
      model = text(b.deviceModel, '设备型号', 1, 100),
      deviceRef: string | null = null,
      serial: string | null = null;
    if (b.deviceRef) {
      deviceRef = uuid(b.deviceRef);
      const ref = (
          await registry.query(
            "SELECT * FROM identity.resources WHERE id=$1 AND kind='device'",
            [deviceRef],
          )
        ).rows[0],
        links = await personLinks(a.payload);
      if (!ref || !links.some((l: any) => l.id === ref.tenant_id))
        throw new ForbiddenException('设备不属于当前客户');
      const link = links.find((l: any) => l.id === ref.tenant_id),
        db = businessClient(link.database_name);
      try {
        await db.connect();
        const d = (
          await db.query(
            'SELECT d.model,d.serial_number FROM devices d JOIN customers c ON c.id=d.customer_id WHERE d.id=$1 AND c.phone=$2',
            [ref.local_id, a.phone],
          )
        ).rows[0];
        if (!d) throw new ForbiddenException('设备归属已变化');
        commissioner = ref.tenant_id;
        model = d.model;
        serial = d.serial_number;
      } finally {
        await db.end();
      }
    }
    return this.tx(async (c) => {
      const fingerprint = internal
        ? createHash('sha256').update(JSON.stringify(b)).digest('hex')
        : null;
      if (internal) {
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          'repair:' + a.id + ':' + b.submissionKey,
        ]);
        const previous = (
          await c.query(
            'SELECT id,number,submission_fingerprint FROM market.requests WHERE customer_id=$1 AND submission_key=$2',
            [a.id, b.submissionKey],
          )
        ).rows[0];
        if (previous) {
          if (previous.submission_fingerprint !== fingerprint)
            throw new ConflictException(
              '该提交已创建服务单，请先查看已有服务单',
            );
          return { id: previous.id, number: previous.number };
        }
      }
      const offer = (
        await c.query(
          `SELECT o.* FROM market.offers o LEFT JOIN platform.tenants t ON t.id=o.tenant_id WHERE o.id=$1 AND (o.published OR ($2 AND o.system_only)) AND (o.tenant_id IS NULL OR (t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()))) FOR SHARE OF o`,
          [offerId, internal],
        )
      ).rows[0];
      if (!offer) throw new NotFoundException('服务已下架');
      if (offer.city !== '全国' && offer.city !== city)
        throw new BadRequestException('该服务暂不覆盖所填城市');
      const id = randomUUID(),
        number =
          'FW' +
          Date.now() +
          Math.floor(Math.random() * 1000)
            .toString()
            .padStart(3, '0');
      await c.query(
        'INSERT INTO market.requests(id,number,customer_id,offer_id,commissioner_id,provider_id,device_ref,device_model,category,city,address,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [
          id,
          number,
          a.id,
          offer.id,
          commissioner,
          offer.tenant_id,
          deviceRef,
          model,
          offer.category,
          city,
          address,
          description,
        ],
      );
      await c.query(
        'UPDATE market.requests SET device_serial=$2,intake=$3,submission_key=$4,submission_fingerprint=$5 WHERE id=$1',
        [
          id,
          serial,
          JSON.stringify(internal ? b.intake : {}),
          internal ? b.submissionKey : null,
          fingerprint,
        ],
      );
      if (internal)
        for (const photoId of b.photoIds) {
          const linked = await c.query(
            'UPDATE market.attachments SET request_id=$3 WHERE id=$1 AND owner_id=$2 AND request_id IS NULL RETURNING id',
            [photoId, a.id, id],
          );
          if (!linked.rowCount)
            throw new BadRequestException('故障图片无效，请重新上传');
        }
      if (internal && !offer.tenant_id)
        await this.network.route(c, id, commissioner, city, offer.category);
      await this.log(c, a, id, 'REQUESTED');
      return { id, number, message: '需求已提交，等待安排服务或工程师接单' };
    });
  }
  async requests(a: any) {
    this.role(a, 'customer', 'engineer');
    return (
      await registry.query(
        SELECT +
          (a.kind === 'customer'
            ? 'WHERE r.customer_id=$1'
            : 'WHERE r.engineer_id=$1') +
          ' ORDER BY r.created_at DESC LIMIT 200',
        [a.id],
      )
    ).rows;
  }
  private async eligibility(
    c: any,
    personId: string,
    r: any,
    serviceId?: string,
  ) {
    const profile = (
      await c.query(
        "SELECT e.* FROM market.engineers e JOIN identity.people p ON p.id=e.person_id AND p.enabled WHERE e.person_id=$1 AND e.state='APPROVED' FOR SHARE OF e,p",
        [personId],
      )
    ).rows[0];
    if (!profile) throw new ForbiddenException('请先完成工程师平台审核');
    if (!profile.cities.includes('全国') && !profile.cities.includes(r.city))
      throw new ForbiddenException('任务城市不在获批服务区域');
    if (
      !(
        await c.query(
          'SELECT 1 FROM market.qualifications WHERE person_id=$1 AND skill=$2 AND expires_at>now() FOR SHARE',
          [personId, r.category],
        )
      ).rows.length
    )
      throw new ForbiddenException('缺少有效的对应服务资质，请先完成培训考核');
    const links = (
      await c.query(
        `SELECT l.id,l.tenant_id FROM identity.links l JOIN identity.people p ON p.id=l.person_id AND p.enabled JOIN platform.memberships m ON m.tenant_id=l.tenant_id AND m.role=l.role AND m.subject_id=l.local_id::text AND m.phone=p.phone AND m.enabled JOIN platform.tenants t ON t.id=l.tenant_id AND t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()) WHERE l.person_id=$1 AND l.role='engineer'`,
        [personId],
      )
    ).rows;
    let provider = r.assigned_provider_id || r.provider_id || null;
    if (provider && !links.some((l: any) => l.tenant_id === provider))
      throw new ForbiddenException('该任务仅向承接企业的工程师开放');
    if(provider && serviceId && !links.some((l:any)=>l.id===serviceId&&l.tenant_id===provider))throw new ForbiddenException('所选工作身份与本单履约企业不一致');
    if (!provider && profile.mode === 'ORG') {
      const link = links.find((l: any) => l.id === serviceId);
      if (!link) throw new BadRequestException('请选择本次履约的企业工作身份');
      provider = link.tenant_id;
    }
    return provider;
  }
  async pool(a: any) {
    this.role(a, 'engineer');
    const rows = (
      await registry.query(
        `SELECT r.id,r.number,r.version,r.category,r.city,r.device_model,r.provider_id,r.assigned_provider_id,r.delegation_state,r.dispatch_source,o.title AS service_title,(SELECT name FROM platform.tenants WHERE id=coalesce(r.assigned_provider_id,r.provider_id)) AS provider_name FROM market.requests r JOIN market.offers o ON o.id=r.offer_id LEFT JOIN platform.tenants t ON t.id=r.provider_id WHERE r.status='REQUESTED' AND r.engineer_id IS NULL AND r.delegation_state IN ('NONE','ACCEPTED') AND (r.provider_id IS NULL OR (t.enabled AND t.provisioning_status='READY' AND (t.expires_at IS NULL OR t.expires_at>now()))) ORDER BY r.created_at DESC LIMIT 100`,
      )
    ).rows;
    const out = [];
    for (const row of rows) {
      try {
        await this.eligibility(
          registry,
          a.id,
          row,
          row.assigned_provider_id||row.provider_id?undefined:(await personLinks(a.payload))[0]?.link_id,
        );
        out.push(row);
      } catch {}
    }
    return out;
  }
  async action(a: any, id: string, b: any) {
    uuid(id);
    if (
      [
        'delegate',
        'delegate-accept',
        'delegate-reject',
        'delegate-withdraw',
      ].includes(b.action)
    )
      return this.network.action(a, id, b);
    this.role(a, 'customer', 'engineer', 'platform', 'company');
    const action = text(b.action, '操作', 1, 30);
    if (a.kind === 'company' && action !== 'assign')
      throw new ForbiddenException('企业仅可处理委托与派单');
    return this.tx(async (c) => {
      const r = (
        await c.query('SELECT * FROM market.requests WHERE id=$1 FOR UPDATE', [
          id,
        ])
      ).rows[0];
      if (!r) throw new NotFoundException('服务单不存在');
      if (a.kind === 'customer' && r.customer_id !== a.id)
        throw new NotFoundException('服务单不存在');
      if (a.kind === 'engineer' && action !== 'claim' && r.engineer_id !== a.id)
        throw new NotFoundException('服务单不存在');
      if (b.version !== r.version)
        throw new ConflictException('服务单状态已变化，请刷新后重试');
      let next = r.status,
        engineer = r.engineer_id,
        provider = r.assigned_provider_id,
        amount = r.quote_amount,
        note = r.quote_note,
        report = r.report;
      if (['claim', 'assign'].includes(action)) {
        if (action === 'claim') this.role(a, 'engineer');
        else this.role(a, 'platform', 'company');
        if (
          a.kind === 'company' &&
          (r.assigned_provider_id !== a.tenantId ||
            r.delegation_state !== 'ACCEPTED')
        )
          throw new ForbiddenException('仅已接单的承接企业可派本企业人员');
        if (
          a.kind === 'platform' &&
          ['PENDING', 'REJECTED'].includes(r.delegation_state)
        )
          throw new BadRequestException('请等待企业接单，或撤回后重新安排');
        if (
          action === 'claim' &&
          !['NONE', 'ACCEPTED'].includes(r.delegation_state)
        )
          throw new BadRequestException('承接企业尚未确认委托');
        if (r.status !== 'REQUESTED' || engineer)
          throw new ConflictException('该任务已被领取或安排');
        engineer = action === 'claim' ? a.id : uuid(b.engineerId);
        provider = await this.eligibility(c, engineer, r, b.serviceId);
        if (provider && r.delegation_state !== 'ACCEPTED') {
          const organization = (
            await c.query(
              'SELECT kind FROM market.service_profiles WHERE tenant_id=$1',
              [provider],
            )
          ).rows[0];
          if (organization?.kind === 'OUTSOURCE')
            throw new BadRequestException(
              '外包企业需先接受服务委托，再由企业安排工程师',
            );
        }

        next = 'ASSIGNED';
      } else if (action === 'accept') {
        this.role(a, 'engineer');
        if (r.status !== 'ASSIGNED')
          throw new BadRequestException('当前不可确认接单');
        next = 'ACCEPTED';
      } else if (action === 'quote') {
        this.role(a, 'engineer');
        if (r.status !== 'ACCEPTED')
          throw new BadRequestException('请先确认接单');
        if (
          typeof b.amount !== 'number' ||
          !Number.isFinite(b.amount) ||
          b.amount < 0 ||
          b.amount > 10000000 ||
          Math.abs(b.amount * 100 - Math.round(b.amount * 100)) > 0.00001
        )
          throw new BadRequestException('请填写有效报价，最多两位小数');
        amount = b.amount;
        note = text(b.note, '报价说明', 5, 1000);
        next = 'QUOTED';
      } else if (action === 'approve') {
        this.role(a, 'customer');
        if (r.status !== 'QUOTED')
          throw new BadRequestException('当前没有待确认报价');
        next = 'APPROVED';
      } else if (action === 'start') {
        this.role(a, 'engineer');
        if (r.status !== 'APPROVED')
          throw new BadRequestException('需客户确认报价后开始服务');
        next = 'IN_SERVICE';
      } else if (action === 'complete') {
        this.role(a, 'engineer');
        if (r.status !== 'IN_SERVICE')
          throw new BadRequestException('当前不可提交完工');
        report = text(b.report, '服务记录', 5, 3000);
        next = 'AWAITING_ACCEPTANCE';
      } else if (action === 'confirm') {
        this.role(a, 'customer');
        if (r.status !== 'AWAITING_ACCEPTANCE')
          throw new BadRequestException('尚未提交完工');
        next = 'COMPLETED';
      } else if (action === 'cancel') {
        this.role(a, 'customer', 'platform');
        if (!['REQUESTED', 'ASSIGNED', 'ACCEPTED', 'QUOTED'].includes(r.status))
          throw new BadRequestException('当前不可自行取消，请联系平台处理');
        next = 'CANCELLED';
        text(b.note, '取消原因', 2, 500);
      } else throw new BadRequestException('不支持的操作');
      await c.query(
        'UPDATE market.requests SET status=$2,engineer_id=$3,assigned_provider_id=$4,quote_amount=$5,quote_note=$6,report=$7,version=version+1,updated_at=now() WHERE id=$1',
        [id, next, engineer, provider, amount, note, report],
      );
      if (['claim', 'assign'].includes(action))
        await c.query(
          'UPDATE market.requests SET dispatcher_kind=$2,dispatcher_id=$3,service_kind_snapshot=(SELECT kind FROM market.service_profiles WHERE tenant_id=market.requests.assigned_provider_id) WHERE id=$1',
          [id, a.kind, a.id],
        );
      await this.log(c, a, id, action, b.note || b.report || '');
      return { message: '操作已完成', status: next };
    });
  }
  async detail(a: any, id: string) {
    uuid(id);
    const r = (await registry.query(SELECT + ' WHERE r.id=$1', [id])).rows[0];
    if (
      !r ||
      !(
        a.kind === 'platform' ||
        (a.kind === 'customer' && r.customer_id === a.id) ||
        (a.kind === 'engineer' && r.engineer_id === a.id) ||
        (a.kind === 'company' &&
          [r.commissioner_id, r.provider_id, r.assigned_provider_id].includes(
            a.tenantId,
          ))
      )
    )
      throw new NotFoundException('服务单不存在');
    const contacts = (
      await registry.query(
        'SELECT name,phone FROM identity.people WHERE id=$1',
        [r.customer_id],
      )
    ).rows[0];
    return {
      ...r,
      photos: (
        await registry.query(
          'SELECT id FROM market.attachments WHERE request_id=$1 ORDER BY created_at',
          [id],
        )
      ).rows,
      customer: contacts,
      events: (
        await registry.query(
          'SELECT action,note,created_at FROM market.events WHERE request_id=$1 ORDER BY created_at',
          [id],
        )
      ).rows,
    };
  }
  async enroll(a: any, id: string) {
    this.role(a, 'customer', 'engineer');
    uuid(id);
    return this.tx(async (c) => {
      const course = (
        await c.query(
          'SELECT * FROM market.courses WHERE id=$1 AND published FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!course) throw new NotFoundException('培训不存在或已下架');
      if (
        (
          await c.query(
            'SELECT 1 FROM market.enrollments WHERE course_id=$1 AND person_id=$2',
            [id, a.id],
          )
        ).rows.length
      )
        throw new ConflictException('已报名该培训');
      const count = (
        await c.query(
          "SELECT count(*)::int n FROM market.enrollments WHERE course_id=$1 AND state<>'CANCELLED'",
          [id],
        )
      ).rows[0].n;
      if (count >= course.capacity) throw new ConflictException('报名名额已满');
      await c.query(
        'INSERT INTO market.enrollments(id,course_id,person_id) VALUES($1,$2,$3)',
        [randomUUID(), id, a.id],
      );
      await this.log(c, a, null, 'COURSE_ENROLLED', id);
      return { message: '报名已登记，培训地点将联系确认；报名不等于通过考核' };
    });
  }
  async company(a: any) {
    this.role(a, 'company');
    return {
      offers: (
        await registry.query(
          'SELECT * FROM market.offers WHERE tenant_id=$1 ORDER BY created_at DESC',
          [a.tenantId],
        )
      ).rows,
      requests: (
        await registry.query(
          SELECT +
            ' WHERE r.commissioner_id=$1 OR r.provider_id=$1 OR r.assigned_provider_id=$1 ORDER BY r.created_at DESC LIMIT 200',
          [a.tenantId],
        )
      ).rows,
    };
  }
  async platform(a: any) {
    this.role(a, 'platform');
    return {
      offers: (
        await registry.query(
          'SELECT o.*,t.name AS provider_name FROM market.offers o LEFT JOIN platform.tenants t ON t.id=o.tenant_id WHERE NOT o.system_only ORDER BY o.created_at DESC LIMIT 200',
        )
      ).rows,
      courses: (
        await registry.query(
          'SELECT c.*,c.start_date::text AS start_date FROM market.courses c ORDER BY c.start_date DESC LIMIT 200',
        )
      ).rows,
      requests: (
        await registry.query(SELECT + ' ORDER BY r.created_at DESC LIMIT 200')
      ).rows,
      engineers: (
        await registry.query(
          `SELECT e.*,p.name,p.phone,coalesce((SELECT json_agg(json_build_object('id',l.id,'tenantId',t.id,'name',t.name)) FROM identity.links l JOIN platform.tenants t ON t.id=l.tenant_id JOIN platform.memberships m ON m.tenant_id=l.tenant_id AND m.role='engineer' AND m.subject_id=l.local_id::text AND m.enabled WHERE l.person_id=e.person_id AND l.role='engineer' AND t.enabled),'[]'::json) AS employers FROM market.engineers e JOIN identity.people p ON p.id=e.person_id ORDER BY e.updated_at DESC LIMIT 200`,
        )
      ).rows,
      enrollments: (
        await registry.query(
          'SELECT e.*,p.name,p.phone,c.title,c.skill FROM market.enrollments e JOIN identity.people p ON p.id=e.person_id JOIN market.courses c ON c.id=e.course_id ORDER BY e.created_at DESC LIMIT 200',
        )
      ).rows,
    };
  }
  async manage(a: any, b: any) {
    this.role(a, 'platform');
    return this.tx(async (c) => {
      const type = b.type;
      if (type === 'offer') {
        const title = text(b.title, '服务名称', 2, 100),
          category = skill(b.category),
          city = text(b.city, '服务城市', 1, 50),
          description = text(b.description, '服务说明', 5, 2000);
        let tenant = null;
        if (b.tenantId) {
          tenant = uuid(b.tenantId);
          if (
            !(
              await c.query(
                "SELECT 1 FROM platform.tenants WHERE id=$1 AND enabled AND provisioning_status='READY'",
                [tenant],
              )
            ).rows.length
          )
            throw new BadRequestException('承接企业不可用');
        }
        await c.query(
          'INSERT INTO market.offers(id,tenant_id,title,category,city,description,published) VALUES($1,$2,$3,$4,$5,$6,true)',
          [randomUUID(), tenant, title, category, city, description],
        );
      } else if (type === 'publish') {
        if (typeof b.published !== 'boolean')
          throw new BadRequestException('上下架状态无效');
        if (!['offers', 'courses'].includes(b.resource))
          throw new BadRequestException('资源类型无效');
        const r = await c.query(
          'UPDATE market.' +
            b.resource +
            ' SET published=$2 WHERE id=$1 RETURNING id',
          [uuid(b.id), b.published],
        );
        if (!r.rows.length) throw new NotFoundException('记录不存在');
      } else if (type === 'course') {
        const date = text(b.startDate, '培训日期', 10, 10);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date
        )
          throw new BadRequestException('日期无效');
        if (!Number.isInteger(b.capacity) || b.capacity < 1 || b.capacity > 500)
          throw new BadRequestException('名额须为1至500');
        await c.query(
          'INSERT INTO market.courses(id,title,skill,city,center_name,address,start_date,capacity,published,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9)',
          [
            randomUUID(),
            text(b.title, '课程名称', 2, 100),
            skill(b.skill),
            text(b.city, '城市', 1, 50),
            text(b.centerName, '培训地点名称', 2, 100),
            text(b.address, '培训地址', 3, 200),
            date,
            b.capacity,
            text(b.description, '课程说明', 5, 2000),
          ],
        );
      } else if (type === 'review') {
        if (!['APPROVED', 'REJECTED', 'SUSPENDED'].includes(b.state))
          throw new BadRequestException('审核状态无效');
        const r = await c.query(
          'UPDATE market.engineers SET state=$2,review_note=$3,updated_at=now() WHERE person_id=$1 RETURNING person_id',
          [uuid(b.personId), b.state, text(b.note, '审核说明', 2, 500)],
        );
        if (!r.rows.length) throw new NotFoundException('申请不存在');
      } else if (type === 'assessment') {
        const enrollment = (
          await c.query(
            'SELECT e.*,c.skill FROM market.enrollments e JOIN market.courses c ON c.id=e.course_id WHERE e.id=$1 FOR UPDATE OF e',
            [uuid(b.enrollmentId)],
          )
        ).rows[0];
        if (!enrollment) throw new NotFoundException('报名不存在');
        if (enrollment.state !== 'ENROLLED')
          throw new ConflictException('该报名已完成考核');
        if (!['PASSED', 'FAILED'].includes(b.result))
          throw new BadRequestException('考核结果无效');
        const note = text(b.note, '考核说明', 2, 500);
        await c.query(
          'UPDATE market.enrollments SET state=$2,note=$3 WHERE id=$1',
          [enrollment.id, b.result, note],
        );
        if (b.result === 'PASSED')
          await c.query(
            "INSERT INTO market.qualifications(id,person_id,skill,expires_at,source) VALUES($1,$2,$3,now()+interval '1 year',$4) ON CONFLICT(person_id,skill) DO UPDATE SET expires_at=EXCLUDED.expires_at,source=EXCLUDED.source,updated_at=now()",
            [
              randomUUID(),
              enrollment.person_id,
              enrollment.skill,
              '培训考核：' + enrollment.course_id,
            ],
          );
      } else throw new BadRequestException('不支持的资源操作');
      await this.log(
        c,
        a,
        null,
        'PLATFORM_' + type.toUpperCase(),
        b.note || b.title || b.id || '',
      );
      return { message: '已保存' };
    });
  }
}
@Controller('market')
@UseGuards(MarketGuard)
@UseInterceptors(IoTIntakePrivacy)
export class MarketController {
  constructor(
    private service: MarketService,
    private network: ServiceNetworkService,
  ) {}
  @Get('service-network') networkOverview(@Request() r: any) {
    return this.network.overview(r.marketActor);
  }
  @Post('service-network') networkManage(@Request() r: any, @Body() b: any) {
    return this.network.manage(r.marketActor, b);
  }
  @Get('service-policy/:id') networkPolicy(
    @Request() r: any,
    @Param('id') id: string,
  ) {
    return this.network.policy(r.marketActor, id);
  }
  @Get('catalog') catalog(
    @Query('city') city = '',
    @Query('category') category = '',
  ) {
    return this.service.catalog(city, category);
  }
  @Get('courses') courses(@Request() r: any) {
    return this.service.courses(r.marketActor);
  }
  @Get('me') me(@Request() r: any) {
    return this.service.me(r.marketActor);
  }
  @Post('engineer-profile') profile(@Request() r: any, @Body() b: any) {
    return this.service.profile(r.marketActor, b);
  }
  @Get('requests') requests(@Request() r: any) {
    return this.service.requests(r.marketActor);
  }
  @Post('requests') create(@Request() r: any, @Body() b: any) {
    return this.service.create(r.marketActor, b);
  }
  @Post('device-repairs') deviceRepair(@Request() r: any, @Body() b: any) {
    return this.service.deviceRepair(r.marketActor, b);
  }
  @Post('attachments')
  @UseInterceptors(
    FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  upload(@Request() r: any, @UploadedFile() file: any) {
    return this.service.upload(r.marketActor, file);
  }
  @Get('attachments/:id') attachment(
    @Request() r: any,
    @Param('id') id: string,
  ) {
    return this.service.attachment(r.marketActor, id);
  }
  @Get('pool') pool(@Request() r: any) {
    return this.service.pool(r.marketActor);
  }
  @Get('requests/:id') detail(@Request() r: any, @Param('id') id: string) {
    return this.service.detail(r.marketActor, id);
  }
  @Post('requests/:id/action') action(
    @Request() r: any,
    @Param('id') id: string,
    @Body() b: any,
  ) {
    return this.service.action(r.marketActor, id, b);
  }
  @Post('courses/:id/enroll') enroll(
    @Request() r: any,
    @Param('id') id: string,
  ) {
    return this.service.enroll(r.marketActor, id);
  }
  @Get('company') company(@Request() r: any) {
    return this.service.company(r.marketActor);
  }
  @Get('platform') platform(@Request() r: any) {
    return this.service.platform(r.marketActor);
  }
  @Post('platform') manage(@Request() r: any, @Body() b: any) {
    return this.service.manage(r.marketActor, b);
  }
}
@Module({
  imports: [AuthModule],
  controllers: [MarketController],
  providers: [MarketGuard, MarketService, ServiceNetworkService],
  exports: [MarketGuard, MarketService],
})
export class MarketModule {}
