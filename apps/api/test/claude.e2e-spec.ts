import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ClaudeModule } from './../src/claude/claude.module.js';
import { ClaudeService } from './../src/claude/claude.service.js';

// Живой вызов Claude Agent SDK через ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN из .env.
describe('ClaudeService (e2e)', () => {
  let service: ClaudeService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env', '../../.env'],
        }),
        ClaudeModule,
      ],
    }).compile();

    service = moduleRef.get(ClaudeService);
  });

  it('возвращает ответ модели Haiku', async () => {
    const answer = await service.ask(
      'Ответь одним словом: «pong». Больше ничего не пиши.',
      { model: 'haiku' },
    );

    expect(answer.toLowerCase()).toContain('pong');
  }, 60_000);

  it('падает с понятной ошибкой без ANTHROPIC_AUTH_TOKEN', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ClaudeModule,
      ],
    })
      // ConfigModule записывает .env в process.env, поэтому токен подменяем явно.
      .overrideProvider(ConfigService)
      .useValue({ get: () => undefined })
      .compile();

    await expect(
      moduleRef.get(ClaudeService).ask('ping', { model: 'haiku' }),
    ).rejects.toThrow(/ANTHROPIC_AUTH_TOKEN/);
  });
});
