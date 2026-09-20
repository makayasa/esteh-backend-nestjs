import { Controller, Get, Headers, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiOperation } from '@nestjs/swagger';
import { IdentityModule } from '../identity/identity.module.js';
import { ReportingService } from './reporting.service.js';

@ApiBearerAuth()
@Controller('reports')
class ReportingController {
  constructor(private readonly reporting: ReportingService) {}
  @Get('costs')
  @ApiQuery({ name: 'from', required: true, example: '2026-01-05' })
  @ApiQuery({ name: 'to', required: true, example: '2026-01-06' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiOperation({
    summary:
      'Admin: pembelian/pengeluaran revisi efektif menurut tanggal kejadian WIB. Refund bukan biaya. Bukan laba.',
  })
  costs(@Headers('authorization') auth: unknown, @Query() query: unknown) {
    return this.reporting.costs(auth, query);
  }
  @Get('payments')
  @ApiQuery({ name: 'from', required: true, example: '2026-01-05' })
  @ApiQuery({ name: 'to', required: true, example: '2026-01-06' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiOperation({
    summary:
      'Admin: penerimaan menurut receivedAt, refund menurut occurredAt, pending terpisah menurut tanggal penjualan WIB; bukan laba.',
  })
  payments(@Headers('authorization') auth: unknown, @Query() query: unknown) {
    return this.reporting.payments(auth, query);
  }
  @Get('sales')
  @ApiQuery({ name: 'from', example: '2026-01-05', required: true })
  @ApiQuery({ name: 'to', example: '2026-01-06', required: true })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiOperation({
    summary:
      'Admin: bruto/produk revisi efektif menurut tanggal penjualan WIB; refund tidak mengurangi bruto, pending/batal dikecualikan.',
  })
  sales(@Headers('authorization') auth: unknown, @Query() query: unknown) {
    return this.reporting.sales(auth, query);
  }
}

@Module({
  imports: [IdentityModule],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
