import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async connectWithRetry(attempt = 1): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      if (attempt >= MAX_RETRIES) {
        this.logger.error(
          `Failed to connect to database after ${MAX_RETRIES} attempts`,
        );
        throw error;
      }

      this.logger.warn(
        `Database connection attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${RETRY_DELAY_MS}ms...`,
      );

      await this.delay(RETRY_DELAY_MS);
      return this.connectWithRetry(attempt + 1);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
