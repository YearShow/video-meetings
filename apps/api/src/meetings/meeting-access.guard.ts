import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { MeetingAccessService } from './meeting-access.service.js';

// Пускает к маршрутам /meetings/:meetingId/... только владельца и участников.
// Выполняется до чтения тела запроса, чтобы не принимать файл от постороннего.
// Недоступная встреча неотличима от несуществующей (404). Использовать после JwtAuthGuard.
@Injectable()
export class MeetingAccessGuard implements CanActivate {
  constructor(private readonly access: MeetingAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { params: { meetingId: string } }>();
    if (!(await this.access.hasAccess(req.params.meetingId, req.user.id))) {
      throw new NotFoundException('Meeting not found');
    }
    return true;
  }
}
