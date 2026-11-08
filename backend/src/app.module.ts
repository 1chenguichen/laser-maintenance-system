import {IoTModule} from './iot/iot.module.js';
import {MarketModule} from './market/market.module.js';
import {VisualModule} from './market/visual.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { OperationsModule } from './operations/operations.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { EngineerModule } from './engineer/engineer.module.js';
import { DispatchModule } from './dispatch/dispatch.module.js';
import { CommissionModule } from './commission/commission.module.js';
import { PartsModule } from './parts/parts.module.js';
import { WebsocketModule } from './websocket/websocket.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AmapModule } from './amap/amap.module.js';
import { PaymentModule } from './payment/payment.module.js';
import { MonitorModule } from './monitor/monitor.module.js';
import { AiModule } from './ai/ai.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    IoTModule,
    VisualModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    RedisModule,
    AuthModule,
    CustomerModule,
    EngineerModule,
    DispatchModule,
    CommissionModule,
    PartsModule,
    OperationsModule,
    PlatformModule,
    IdentityModule,
    MarketModule,
    WebsocketModule,
    AdminModule,
    AmapModule,
    PaymentModule,
    MonitorModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
