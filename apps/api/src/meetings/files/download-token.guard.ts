import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/jwt-auth.guard.js';
import { DownloadTokenService } from './download-token.service.js';

// Аутентификация по токену скачивания из `?token=` вместо Authorization.
// Токен выдан на конкретный файл: fileId из токена должен совпасть с путём.
@Injectable()
export class DownloadTokenGuard implements CanActivate {
  constructor(private readonly tokens: DownloadTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { params: { fileId: string } }>();
    const token: unknown = req.query.token;
    if (typeof token !== 'string' || token === '') {
      throw new UnauthorizedException();
    }
    const { userId, fileId } = await this.tokens.verify(token);
    if (fileId !== req.params.fileId) throw new UnauthorizedException();
    req.user = { id: userId };
    return true;
  }
}
