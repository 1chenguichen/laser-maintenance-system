import { Controller, Get } from '@nestjs/common';
import { MonitorService } from './monitor.service.js';

@Controller('monitor')
export class MonitorController {
  constructor(private monitorService: MonitorService) {}

  @Get('health')
  getHealth() {
    return this.monitorService.getHealth();
  }

  @Get('metrics')
  getMetrics() {
    return this.monitorService.getMetrics();
  }

  @Get('api-stats')
  getApiStats() {
    return {
      responseTime: this.monitorService.getApiResponseTime(),
      errorRate: this.monitorService.getErrorRate(),
    };
  }
}
