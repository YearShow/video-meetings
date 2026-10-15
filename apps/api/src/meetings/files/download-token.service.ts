import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export const DOWNLOAD_SCOPE = 'download';
export const DOWNLOAD_TOKEN_TTL_SECONDS = 60;

// Короткоживущий токен скачивания одного файла: браузер открывает ссылку обычной
// навигацией и не умеет передать Authorization. Токен имеет claim `scope`, поэтому
// JwtAuthGuard его не принимает, а эндпоинт скачивания принимает только его.
@Injectable()
export class DownloadTokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(userId: string, fileId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, fileId, scope: DOWNLOAD_SCOPE },
      { expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS },
    );
  }

  async verify(token: string): Promise<{ userId: string; fileId: string }> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        fileId?: string;
        scope?: string;
      }>(token);
      if (payload.scope !== DOWNLOAD_SCOPE || !payload.fileId) {
        throw new Error('Not a download token');
      }
      return { userId: payload.sub, fileId: payload.fileId };
    } catch {
      throw new UnauthorizedException();
    }
  }
}
