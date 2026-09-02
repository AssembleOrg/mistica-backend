import { ForbiddenException } from '@nestjs/common';
import { AllowedViewsGuard } from './allowed-views.guard';

function contextFor(user: unknown) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('AllowedViewsGuard', () => {
  it('allows an admin regardless of its whitelist', () => {
    const guard = new AllowedViewsGuard({
      getAllAndOverride: () => ['alumnos'],
    } as any);
    expect(guard.canActivate(contextFor({ role: 'admin', allowedViews: [] }))).toBe(true);
  });

  it('accepts a parent reservas grant for the piezas sub-view', () => {
    const guard = new AllowedViewsGuard({
      getAllAndOverride: () => ['reservas:piezas'],
    } as any);
    expect(guard.canActivate(contextFor({ role: 'user', allowedViews: ['reservas'] }))).toBe(true);
  });

  it('rejects a whitelist that does not include the endpoint view', () => {
    const guard = new AllowedViewsGuard({
      getAllAndOverride: () => ['equipo'],
    } as any);
    expect(() => guard.canActivate(contextFor({ role: 'user', allowedViews: ['alumnos'] })))
      .toThrow(ForbiddenException);
  });
});
