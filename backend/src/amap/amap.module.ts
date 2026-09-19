import { Module } from '@nestjs/common';
import { AmapController } from './amap.controller.js';
import { AmapService } from './amap.service.js';

@Module({
  controllers: [AmapController],
  providers: [AmapService],
  exports: [AmapService],
})
export class AmapModule {}
