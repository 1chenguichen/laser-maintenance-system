import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CustomerImportService } from './customer-import.service.js';
import { importTemplate } from './customer-import-workbook.js';
@Controller(['admin/customer-import', 'admin/device-import'])
@UseGuards(JwtAuthGuard)
@Roles('cs_operator')
export class CustomerImportController {
  constructor(private service: CustomerImportService) {}
  @Get('template') async template(@Res() res: Response, @Request() req: any) {
    const mode = req.path.includes('/device-import') ? 'devices' : 'customers';
    const file = await importTemplate(mode);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      "attachment; filename*=UTF-8''" +
        encodeURIComponent(
          mode === 'devices' ? '设备导入模板.xlsx' : '客户与设备导入模板.xlsx',
        ),
    );
    res.send(file);
  }
  private check(file: Express.Multer.File) {
    if (!file || !file.originalname.toLowerCase().endsWith('.xlsx'))
      throw new BadRequestException(
        '请选择 .xlsx 格式文件，旧 .xls 请另存为 .xlsx',
      );
    return file.buffer;
  }
  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  preview(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    return this.service.preview(
      this.check(file),
      req.user.sub,
      req.path.includes('/device-import') ? 'devices' : 'customers',
    );
  }
  @Post('commit')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  commit(
    @UploadedFile() file: Express.Multer.File,
    @Body('token') token: string,
    @Request() req: any,
  ) {
    return this.service.commit(
      this.check(file),
      req.user.sub,
      token,
      req.path.includes('/device-import') ? 'devices' : 'customers',
    );
  }
}
