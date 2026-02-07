import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');
  app.enableCors();
  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 3000);
  const env = config.get<string>('NODE_ENV', 'development');

  await app.listen(port);

  logger.log(`Environment: ${env}`);
  logger.log(`API running on http://localhost:${port}/api`);
  logger.log(`Health check: http://localhost:${port}/api/health`);
}

bootstrap();
