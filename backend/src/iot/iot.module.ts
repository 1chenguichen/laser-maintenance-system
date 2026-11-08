import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  Headers,
  UseGuards,
  Module,
} from '@nestjs/common';
import { MarketModule, MarketGuard } from '../market/market.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { MobileAuth } from './mobile-auth.js';
import { IoTMaintenance } from './maintenance.js';
import { IoTAccess } from './access.js';
import { IoTService } from './service.js';
import { TelemetryIngest } from './ingest.js';
import { IoTTicketBridge } from './ticket-bridge.js';
class MobileLoginDto {
  @IsOptional() @IsIn(['code', 'password']) mode?: string;
  @ValidateIf((o) => o.mode !== 'password')
  @Matches(/^1[3-9]\d{9}$/)
  phone?: string;
  @ValidateIf((o) => o.mode !== 'password') @Matches(/^\d{6}$/) code?: string;
  @ValidateIf((o) => o.mode === 'password')
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  username?: string;
  @ValidateIf((o) => o.mode === 'password')
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password?: string;
}
@Controller('iot')
@UseGuards(MarketGuard)
export class IoTController {
  constructor(
    private service: IoTService,
    private tickets: IoTTicketBridge,
    private mobile: MobileAuth,
  ) {}
  private scope(r: any) {
    return this.service.access.scope(r.marketActor, r.query.workspace);
  }
  @Get('mobile-context') mobileContext(@Request() r: any) {
    return this.mobile.context(r.marketActor);
  }
  @Get('context') context(@Request() r: any) {
    return this.service.context(r.marketActor);
  }
  @Get('companies') async companies(@Request() r: any) {
    return this.service.companies(await this.scope(r), r.query);
  }
  @Get('tenants') async tenants(@Request() r: any) {
    return this.service.tenants(await this.scope(r));
  }
  @Post('subscriptions') async subscription(@Request() r: any, @Body() b: any) {
    return this.service.subscribe(await this.scope(r), b);
  }
  @Get('assets') async assets(@Request() r: any) {
    return this.service.assets(await this.scope(r), r.query);
  }
  @Get('analytics') async analytics(@Request() r: any) {
    return this.service.analytics(await this.scope(r), r.query);
  }
  @Get('overview') async overview(@Request() r: any) {
    return this.service.overview(await this.scope(r), r.query);
  }
  @Get('devices') async devices(@Request() r: any) {
    return this.service.list(await this.scope(r), r.query);
  }
  @Post('devices') async register(@Request() r: any, @Body() b: any) {
    return this.service.register(await this.scope(r), b);
  }
  @Get('devices/:id') async detail(@Request() r: any, @Param('id') id: string) {
    return this.service.detail(await this.scope(r), id);
  }
  @Get('devices/:id/history') async history(
    @Request() r: any,
    @Param('id') id: string,
    @Query() q: any,
  ) {
    return this.service.history(await this.scope(r), id, q);
  }
  @Post('devices/:id/config') async config(
    @Request() r: any,
    @Param('id') id: string,
    @Body() b: any,
  ) {
    return this.service.configure(await this.scope(r), id, b);
  }
  @Post('devices/:id/credential') async credential(
    @Request() r: any,
    @Param('id') id: string,
  ) {
    return this.service.rotate(await this.scope(r), id);
  }
  @Get('alarms') async alarms(@Request() r: any) {
    return r.query.page
      ? this.service.alarmPage(await this.scope(r), r.query)
      : this.service.alarms(await this.scope(r), r.query);
  }
  @Post('alarms/:id/acknowledge') async acknowledge(
    @Request() r: any,
    @Param('id') id: string,
    @Body() b: any,
  ) {
    return this.service.acknowledge(await this.scope(r), id, b);
  }
  @Post('alarms/:id/ticket') async ticket(
    @Request() r: any,
    @Param('id') id: string,
    @Body() b: any,
  ) {
    return this.tickets.create(await this.scope(r), id, b);
  }
  @Get('members') async members(@Request() r: any) {
    return this.service.members(await this.scope(r));
  }
  @Post('members') async member(@Request() r: any, @Body() b: any) {
    return this.service.saveMember(await this.scope(r), b);
  }
}
@Controller('iot')
export class IoTIngestController {
  constructor(
    private ingest: TelemetryIngest,
    private mobile: MobileAuth,
  ) {}
  @Post('mobile-login') login(@Body() dto: MobileLoginDto) {
    return this.mobile.login(dto);
  }
  @Post('ingest') receive(
    @Headers('x-device-key') key: string,
    @Body() b: any,
  ) {
    return this.ingest.receive(key, b);
  }
}
@Module({
  imports: [AuthModule, MarketModule, IdentityModule],
  controllers: [IoTController, IoTIngestController],
  providers: [
    IoTAccess,
    IoTService,
    TelemetryIngest,
    IoTTicketBridge,
    IoTMaintenance,
    MobileAuth,
  ],
  exports: [IoTService],
})
export class IoTModule {}
