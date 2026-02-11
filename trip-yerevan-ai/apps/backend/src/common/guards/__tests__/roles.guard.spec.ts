import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../roles.guard';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../decorators/roles.decorator';

function createMockContext(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow access when no roles metadata is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const ctx = createMockContext({ id: 'u1', role: UserRole.TRAVELER });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when user role matches required roles', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.MANAGER, UserRole.ADMIN]);

    const ctx = createMockContext({ id: 'u1', role: UserRole.MANAGER });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow ADMIN when MANAGER and ADMIN are required', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.MANAGER, UserRole.ADMIN]);

    const ctx = createMockContext({ id: 'u1', role: UserRole.ADMIN });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject when user role does not match', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.MANAGER, UserRole.ADMIN]);

    const ctx = createMockContext({ id: 'u1', role: UserRole.TRAVELER });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should reject when no user is on request', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.MANAGER]);

    const ctx = createMockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should reject when user has no role property', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.MANAGER]);

    const ctx = createMockContext({ id: 'u1' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
