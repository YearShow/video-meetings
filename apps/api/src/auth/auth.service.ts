import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { UsersService } from '../users/users.service.js';

export interface AuthTokens {
  accessToken: string;
}

export interface AuthProfile {
  id: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string): Promise<AuthTokens> {
    if (await this.users.findByEmail(email)) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await argon2.hash(password);
    const user = await this.users.create(email, passwordHash).catch((e) => {
      // Гонка: параллельная регистрация успела создать пользователя (P2002).
      if (e?.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw e;
    });
    return this.issueToken(user.id);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.users.findByEmail(email);
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueToken(user.id);
  }

  async me(userId: string): Promise<AuthProfile> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: user.email };
  }

  private async issueToken(userId: string): Promise<AuthTokens> {
    return { accessToken: await this.jwt.signAsync({ sub: userId }) };
  }
}
