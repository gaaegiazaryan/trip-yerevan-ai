import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Language, Prisma, User } from '@prisma/client';

export interface TelegramUserData {
  telegramId: bigint;
  firstName: string;
  lastName?: string;
  languageCode?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByTelegramId(telegramId: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { telegramId } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async findOrCreateByTelegram(data: TelegramUserData): Promise<User> {
    const existing = await this.findByTelegramId(data.telegramId);
    if (existing) {
      return existing;
    }

    return this.create({
      telegramId: data.telegramId,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      preferredLanguage: this.mapLanguageCode(data.languageCode),
    });
  }

  private mapLanguageCode(code?: string): Language {
    if (!code) return Language.RU;
    switch (code.toLowerCase()) {
      case 'hy':
      case 'am':
        return Language.AM;
      case 'en':
        return Language.EN;
      default:
        return Language.RU;
    }
  }
}
