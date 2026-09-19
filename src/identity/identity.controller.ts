import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBody, ApiHeader, ApiBearerAuth } from '@nestjs/swagger';
import { IdentityService } from './identity.service.js';

@Controller('auth')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['username', 'password'],
      properties: {
        username: {
          type: 'string',
          minLength: 3,
          maxLength: 64,
          pattern: '^[a-z0-9._-]+$',
        },
        password: {
          type: 'string',
          minLength: 12,
          maxLength: 128,
          writeOnly: true,
        },
      },
    },
  })
  @Post('login')
  @HttpCode(200)
  login(
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
    @Req() req: Request,
  ) {
    return this.identity.login(body, key, req.ip ?? 'unknown');
  }
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(200)
  logout(
    @Headers('authorization') authorization: unknown,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
  ) {
    return this.identity.logout(authorization, key, body);
  }
  @ApiBearerAuth()
  @Get('me')
  me(@Headers('authorization') authorization: unknown) {
    return this.identity.me(authorization);
  }
}
