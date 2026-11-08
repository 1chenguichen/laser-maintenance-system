import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformAuthController, PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { PlatformGuard } from './security.js';
@Module({imports:[AuthModule],controllers:[PlatformAuthController,PlatformController],providers:[PlatformService,PlatformGuard],exports:[PlatformService]})
export class PlatformModule {}
