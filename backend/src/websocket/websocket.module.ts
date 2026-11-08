import { Module } from '@nestjs/common';

import { DispatchModule } from '../dispatch/dispatch.module.js';

@Module({
  imports: [DispatchModule],
  providers: [],
  exports: [],
})
export class WebsocketModule {}
