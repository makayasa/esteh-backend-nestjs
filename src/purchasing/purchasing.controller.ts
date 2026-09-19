import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PurchasingService } from './purchasing.service.js';

@ApiBearerAuth()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasing: PurchasingService) {}
  @Get()
  list(@Headers('authorization') auth: unknown, @Query('page') page?: string) {
    return this.purchasing.purchases(auth, page);
  }
  @Post()
  @HttpCode(200)
  create(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() input: unknown,
  ) {
    return this.purchasing.purchase(auth, key, input);
  }
  @Post(':id/correct')
  @HttpCode(200)
  correct(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() input: unknown,
    @Param('id') id: string,
  ) {
    return this.purchasing.correctPurchase(auth, key, id, input);
  }
}

@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly purchasing: PurchasingService) {}
  @Get()
  list(@Headers('authorization') auth: unknown, @Query('page') page?: string) {
    return this.purchasing.expenses(auth, page);
  }
  @Post()
  @HttpCode(200)
  create(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() input: unknown,
  ) {
    return this.purchasing.expense(auth, key, input);
  }
  @Post(':id/correct')
  @HttpCode(200)
  correct(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() input: unknown,
    @Param('id') id: string,
  ) {
    return this.purchasing.correctExpense(auth, key, id, input);
  }
}

@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private readonly purchasing: PurchasingService) {}
  @Get()
  ledger(
    @Headers('authorization') auth: unknown,
    @Query('materialId') materialId = '',
    @Query('page') page?: string,
  ) {
    return this.purchasing.ledger(auth, materialId, page);
  }
  @Get('balances')
  balances(@Headers('authorization') auth: unknown) {
    return this.purchasing.balances(auth);
  }
  @Post('usage')
  @HttpCode(200)
  usage(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() input: unknown,
  ) {
    return this.purchasing.usage(auth, key, input);
  }
  @Post('waste')
  @HttpCode(200)
  waste(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() input: unknown,
  ) {
    return this.purchasing.waste(auth, key, input);
  }
  @Post('adjustment')
  @HttpCode(200)
  adjust(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() input: unknown,
  ) {
    return this.purchasing.adjust(auth, key, input);
  }
  @Post('ledger/:id/correct')
  @HttpCode(200)
  correct(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() input: unknown,
    @Param('id') id: string,
  ) {
    return this.purchasing.correctMutation(auth, key, id, input);
  }
}
