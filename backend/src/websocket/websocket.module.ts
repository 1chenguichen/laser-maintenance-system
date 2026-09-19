import { Module } from '@nestjs/common';
import { AppGateway } from './websocket.gateway.js';
import { DispatchModule } from '../dispatch/dispatch.module.js';

@Module({
  imports: [DispatchModule],
  providers: [AppGateway],
  exports: [AppGateway],
})
export class WebsocketModule {}
