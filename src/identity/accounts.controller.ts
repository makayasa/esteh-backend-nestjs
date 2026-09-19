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
import { AccountsService } from './accounts.service.js';

@ApiBearerAuth()
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}
  @Get()
  list(@Headers('authorization') auth: unknown, @Query('page') page?: string) {
    return this.accounts.list(auth, page);
  }
  @Post()
  @HttpCode(200)
  create(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() input: unknown,
  ) {
    return this.accounts.create(auth, key, input);
  }
  @Post(':id/reset-password')
  @HttpCode(200)
  reset(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return this.accounts.reset(auth, key, id, input);
  }
  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(
    @Headers('authorization') auth: unknown,
    @Headers('idempotency-key') key: unknown,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return this.accounts.deactivate(auth, key, id, input);
  }
}
