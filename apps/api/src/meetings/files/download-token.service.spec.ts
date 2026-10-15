import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DownloadTokenService } from './download-token.service.js';

describe('DownloadTokenService', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const service = new DownloadTokenService(jwt);

  it('подписанный токен проверяется и несёт пользователя и файл', async () => {
    const token = await service.sign('u1', 'f1');

    await expect(service.verify(token)).resolves.toEqual({
      userId: 'u1',
      fileId: 'f1',
    });
  });

  it('токен живёт 60 секунд и помечен scope=download', async () => {
    const payload = jwt.decode<{ exp: number; iat: number; scope: string }>(
      await service.sign('u1', 'f1'),
    );

    expect(payload.exp - payload.iat).toBe(60);
    expect(payload.scope).toBe('download');
  });

  it('обычный токен доступа не принимается как токен скачивания', async () => {
    const access = await jwt.signAsync({ sub: 'u1' });

    await expect(service.verify(access)).rejects.toThrow(UnauthorizedException);
  });

  it('просроченный и чужой токены отклоняются', async () => {
    const expired = await jwt.signAsync(
      { sub: 'u1', fileId: 'f1', scope: 'download' },
      { expiresIn: -10 },
    );
    const foreign = await new JwtService({ secret: 'other' }).signAsync({
      sub: 'u1',
      fileId: 'f1',
      scope: 'download',
    });

    await expect(service.verify(expired)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.verify(foreign)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.verify('garbage')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
