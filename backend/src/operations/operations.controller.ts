import { Controller, Get, Post, Body, Param, Request, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { OperationsService } from './operations.service.js';
import { MaterialRequestDto, ConsumeMaterialDto, ContractDto, ReceiptDto, InvoiceRequestDto, InvoiceIssueDto } from './operations.dto.js';
@Controller('operations')
@UseGuards(JwtAuthGuard)
@Roles('cs_operator')
export class OperationsController {
  constructor(private service: OperationsService) {}
  @Get('warehouses') @Roles('cs_operator','engineer') warehouses(@Request() req: any) { return this.service.warehouseList(req.user); }
  @Get('mobile') @Roles('engineer') mobile(@Request() req: any) { return this.service.mobileOverview(req.user); }
  @Get('requests') @Roles('cs_operator','engineer') requests(@Request() req: any) { return this.service.requestList(req.user); }
  @Post('requests') @Roles('engineer') createRequest(@Request() req: any, @Body() dto: MaterialRequestDto) { return this.service.createRequest(req.user, dto); }
  @Post('requests/:id/:action') @Roles('cs_operator','engineer') requestAction(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Param('action') action: string, @Body() body: {note?: string}) { return this.service.requestAction(req.user, id, action, body.note); }
  @Post('consume') @Roles('engineer') consume(@Request() req: any, @Body() dto: ConsumeMaterialDto) { return this.service.consume(req.user, dto); }
  @Get('journal') @Roles('cs_operator','engineer') journal(@Request() req: any) { return this.service.journal(req.user); }
  @Get('contracts') @Roles('cs_operator','customer') contracts(@Request() req: any) { return this.service.contractList(req.user); }
  @Post('contracts') createContract(@Body() dto: ContractDto) { return this.service.createContract(dto); }
  @Post('contracts/:id/status') contractStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: {status: string}) { return this.service.contractStatus(id, body.status); }
  @Get('finance') @Roles('cs_operator','customer') finance(@Request() req: any) { return this.service.finance(req.user); }
  @Post('receipts') receipt(@Request() req: any, @Body() dto: ReceiptDto) { return this.service.receipt(req.user, dto); }
  @Post('invoices') @Roles('customer') invoice(@Request() req: any, @Body() dto: InvoiceRequestDto) { return this.service.requestInvoice(req.user, dto); }
  @Post('invoices/:id/issue') issue(@Request() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InvoiceIssueDto) { return this.service.issueInvoice(req.user, id, dto); }
}
