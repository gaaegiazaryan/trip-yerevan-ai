import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class DevAuthMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const userId = req.headers['x-user-id'] as string | undefined;

    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          firstName: true,
          lastName: true,
          telegramId: true,
          status: true,
        },
      });

      if (user) {
        (req as any).user = user;
      }
    }

    next();
  }
}
