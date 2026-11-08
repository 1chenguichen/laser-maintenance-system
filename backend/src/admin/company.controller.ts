import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  Injectable,
  ConflictException,
} from '@nestjs/common';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import sharp from 'sharp';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { currentTenant } from '../tenancy/context.js';
import { registry } from '../tenancy/registry.js';
class CompanyDto {
  @IsInt() @Min(1) version: number;
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2,{message:'企业全称至少2个字符'})
  @MaxLength(100,{message:'企业全称最多100个字符'})
  name: string;
  @IsOptional() @IsString() @MaxLength(30) shortName?: string;
  @IsOptional() @IsString() @MaxLength(100) englishName?: string;
  @IsOptional() @IsString() @MaxLength(50) industry?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(60) serviceArea?: string;
  @IsOptional() @IsString() @MaxLength(80) serviceHours?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsOptional() @IsString() @MaxLength(100) email?: string;
  @IsOptional() @IsString() @MaxLength(50) contactName?: string;
  @IsOptional() @IsString() @MaxLength(32) contactPhone?: string;
}
const PROFILE_KEYS = [
  'shortName',
  'englishName',
  'industry',
  'description',
  'address',
  'serviceArea',
  'serviceHours',
  'website',
  'email',
] as const;
function view(t: any) {
  return {
    id: t.id,
    name: t.name,
    profile: t.company_profile || {},
    logoDataUrl: t.company_logo || null,
    version: t.company_version,
    contactName: t.contact_name,
    contactPhone: t.contact_phone,
    planName: t.plan_name || t.plan_code,
    employeeLimit: t.employee_limit,
    storageLimitMb: t.storage_limit_mb,
    expiresAt: t.expires_at,
    updatedAt: t.updated_at,
  };
}
function snapshot(t: any) {
  return {
    name: t.name,
    profile: t.company_profile,
    hasLogo: !!t.company_logo,
    version: t.company_version,
    contactName: t.contact_name,
    contactPhone: t.contact_phone,
  };
}
@Injectable()
export class CompanyService {
  async get() {
    const t = (
      await registry.query(
        'SELECT t.*,p.name AS plan_name FROM platform.tenants t LEFT JOIN platform.plans p ON p.code=t.plan_code WHERE t.id=$1',
        [currentTenant().id],
      )
    ).rows[0];
    return view(t);
  }
  private async mutate(
    version: number,
    actor: any,
    action: string,
    change: (old: any) => Promise<any>,
  ) {
    if (!Number.isInteger(version) || version < 1)
      throw new BadRequestException('资料版本无效，请刷新后重试');
    const client = await registry.connect();
    try {
      await client.query('BEGIN');
      const t = (
        await client.query(
          'SELECT * FROM platform.tenants WHERE id=$1 FOR UPDATE',
          [currentTenant().id],
        )
      ).rows[0];
      if (t.company_version !== version)
        throw new ConflictException(
          '企业资料已被其他管理员更新，请先重新加载再修改',
        );
      const next = await change(t);
      const updated = (
        await client.query(
          'UPDATE platform.tenants SET name=$2,company_profile=$3::jsonb,company_logo=$4,contact_name=$5,contact_phone=$6,company_version=company_version+1,updated_at=now() WHERE id=$1 RETURNING *',
          [
            t.id,
            next.name,
            JSON.stringify(next.company_profile),
            next.company_logo,
            next.contact_name,
            next.contact_phone,
          ],
        )
      ).rows[0];
      await client.query(
        'INSERT INTO platform.audit_logs(actor_id,actor_name,id,tenant_id,action,before_data,after_data) VALUES($1,$2,gen_random_uuid(),$3,$4,$5::jsonb,$6::jsonb)',
        [
          actor.sub,
          actor.phone || '企业管理员',
          t.id,
          action,
          JSON.stringify(snapshot(t)),
          JSON.stringify(snapshot(updated)),
        ],
      );
      await client.query('COMMIT');
      return await this.get();
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async update(dto: CompanyDto, actor: any) {
    const email = dto.email?.trim(),
      website = dto.website?.trim(),
      phone = dto.contactPhone?.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new BadRequestException('请输入有效的联系邮箱');
    if (phone && !/^[+\d()\-\s]{6,32}$/.test(phone))
      throw new BadRequestException('请输入有效的联系电话');
    if (website) {
      try {
        const u = new URL(website);
        if (
          !['http:', 'https:'].includes(u.protocol) ||
          u.username ||
          u.password
        )
          throw Error();
      } catch {
        throw new BadRequestException(
          '官网请填写完整的 http:// 或 https:// 地址',
        );
      }
    }
    return this.mutate(
      dto.version,
      actor,
      'COMPANY_PROFILE_UPDATED',
      async (old) => {
        const profile = { ...old.company_profile, sampleData: false };
        for (const key of PROFILE_KEYS)
          if (dto[key] != null) profile[key] = dto[key]!.trim();
        return {
          ...old,
          name: dto.name,
          company_profile: profile,
          contact_name:
            dto.contactName == null
              ? old.contact_name
              : dto.contactName.trim(),
          contact_phone: phone === undefined ? old.contact_phone : phone,
        };
      },
    );
  }
  async logo(file: Express.Multer.File, version: number, actor: any) {
    if (!file?.buffer) throw new BadRequestException('请选择企业 Logo 图片');
    const b = file.buffer;
    const png =
        b.length > 8 &&
        b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      jpeg = b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255,
      webp =
        b.length > 12 &&
        b.toString('ascii', 0, 4) === 'RIFF' &&
        b.toString('ascii', 8, 12) === 'WEBP';
    if (!png && !jpeg && !webp)
      throw new BadRequestException('Logo 仅支持 PNG、JPG、WebP 图片');
    let normalized: Buffer;
    try {
      normalized = await sharp(b, {
        limitInputPixels: 16000000,
        animated: false,
      })
        .rotate()
        .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
      if (normalized.length > 512 * 1024) throw Error();
    } catch {
      throw new BadRequestException(
        '无法读取图片，或图片过大；请选择清晰的方形 Logo',
      );
    }
    return this.mutate(version, actor, 'COMPANY_LOGO_UPDATED', async (old) => ({
      ...old,
      company_logo: 'data:image/png;base64,' + normalized.toString('base64'),
    }));
  }
  async removeLogo(version: number, actor: any) {
    return this.mutate(version, actor, 'COMPANY_LOGO_REMOVED', async (old) => ({
      ...old,
      company_logo: null,
    }));
  }
}
@Controller('admin/company')
@UseGuards(JwtAuthGuard)
@Roles('cs_operator')
export class CompanyController {
  constructor(private service: CompanyService) {}
  @Get() get() {
    return this.service.get();
  }
  @Put() update(@Body() dto: CompanyDto, @Request() req: any) {
    return this.service.update(dto, req.user);
  }
  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    }),
  )
  logo(
    @UploadedFile() file: Express.Multer.File,
    @Body('version') version: string,
    @Request() req: any,
  ) {
    return this.service.logo(file, Number(version), req.user);
  }
  @Delete('logo') removeLogo(
    @Query('version') version: string,
    @Request() req: any,
  ) {
    return this.service.removeLogo(Number(version), req.user);
  }
}
