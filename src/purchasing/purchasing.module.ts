import { Module } from '@nestjs/common';
import { Clock } from '../clock.js';
import { IdentityModule } from '../identity/identity.module.js';
import {
  ExpensesController,
  PurchasesController,
  StockController,
} from './purchasing.controller.js';
import { PurchasingService } from './purchasing.service.js';

// P7: pembelian, mutasi stok, dan pengeluaran — khusus admin (Q15/Q36).
@Module({
  imports: [IdentityModule],
  controllers: [PurchasesController, ExpensesController, StockController],
  providers: [Clock, PurchasingService],
})
export class PurchasingModule {}
