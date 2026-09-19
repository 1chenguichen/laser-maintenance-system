import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { DispatchService } from './dispatch.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/types.js';

@Controller('dispatch')
@UseGuards(JwtAuthGuard)
export class DispatchController {
  constructor(private dispatchService: DispatchService) {}

  @Post('to-pool/:workOrderId')
  async dispatchToGrabPool(@Param('workOrderId') id: string) {
    return this.dispatchService.dispatchToGrabPool(id);
  }

  @Post('to-engineer/:workOrderId')
  async dispatchToEngineer(
    @Param('workOrderId') id: string,
    @Body('engineerId') engineerId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.dispatchService.dispatchToEngineer(id, engineerId, req.user.sub);
  }

  @Get('records/:workOrderId')
  async getDispatchRecords(@Param('workOrderId') id: string) {
    return this.dispatchService.getDispatchRecords(id);
  }

  @Post('remind/:workOrderId')
  async remindEngineer(@Param('workOrderId') id: string) {
    return this.dispatchService.remindEngineer(id);
  }

  @Post('reassign/:workOrderId')
  async reassignEngineer(
    @Param('workOrderId') id: string,
    @Body('newEngineerId') newEngineerId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.dispatchService.reassignEngineer(id, newEngineerId, req.user.sub);
  }
}
