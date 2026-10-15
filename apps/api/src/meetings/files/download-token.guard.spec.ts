import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { DownloadTokenGuard } from './download-token.guard.js';
import type { DownloadTokenService } from './download-token.service.js';

describe('DownloadTokenGuard', () => {
  const verify = vi.fn();
  const guard = new DownloadTokenGuard({
    verify,
  } as unknown as DownloadTokenService);

  const context = (req: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
    }) as unknown as ExecutionContext;

  beforeEach(() => vi.resetAllMocks());

  it('пускает и подставляет пользователя из токена', async () => {
    verify.mockResolvedValue({ userId: 'u1', fileId: 'f1' });
    const req: Record<string, unknown> = {
      query: { token: 't' },
      params: { fileId: 'f1' },
    };

    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'u1' });
  });

  it('без токена → 401', async () => {
    const req = { query: {}, params: { fileId: 'f1' } };

    await expect(guard.canActivate(context(req))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('токен не строка (token[]=a) → 401', async () => {
    const req = { query: { token: ['a'] }, params: { fileId: 'f1' } };

    await expect(guard.canActivate(context(req))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('токен выдан на другой файл → 401', async () => {
    verify.mockResolvedValue({ userId: 'u1', fileId: 'other' });
    const req = { query: { token: 't' }, params: { fileId: 'f1' } };

    await expect(guard.canActivate(context(req))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
