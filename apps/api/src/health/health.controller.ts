import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../identity/auth.guard.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RedisService } from '../infra/redis.service.js';
import { HealthDto, ReadinessDto } from './health.dto.js';

type CheckState = 'up' | 'down';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  @HttpCode(200)
  @ApiOkResponse({ type: HealthDto })
  live(): HealthDto {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({ type: ReadinessDto })
  @ApiServiceUnavailableResponse({ type: ReadinessDto })
  async ready(): Promise<ReadinessDto> {
    const [database, redis] = await Promise.all([
      this.check(() => this.prisma.db.$queryRaw`SELECT 1`.then(() => true)),
      this.check(() => this.redis.ping()),
    ]);
    const body: ReadinessDto = {
      status: database === 'up' && redis === 'up' ? 'ok' : 'error',
      checks: { database, redis },
    };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }

  private async check(fn: () => Promise<boolean>): Promise<CheckState> {
    try {
      return (await fn()) ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
