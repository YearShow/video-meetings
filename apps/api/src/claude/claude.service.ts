import { query } from '@anthropic-ai/claude-agent-sdk';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AskOptions {
  // Алиас (`haiku`, `sonnet`) или полный id модели.
  model?: string;
}

// Обёртка над Claude Agent SDK: адрес прокси и токен берутся из ANTHROPIC_BASE_URL
// и ANTHROPIC_AUTH_TOKEN (.env). Прокси принимает токен в заголовке x-api-key, а
// Bearer отклоняет (401), поэтому в SDK значение уходит как ANTHROPIC_API_KEY.
@Injectable()
export class ClaudeService {
  constructor(private readonly config: ConfigService) {}

  // Один запрос без инструментов и без чтения пользовательских настроек.
  async ask(prompt: string, options: AskOptions = {}): Promise<string> {
    const authToken = this.config.get<string>('ANTHROPIC_AUTH_TOKEN');
    if (!authToken) {
      throw new Error('ANTHROPIC_AUTH_TOKEN не задан');
    }
    const baseUrl = this.config.get<string>('ANTHROPIC_BASE_URL');

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ANTHROPIC_API_KEY: authToken,
    };
    // Иначе SDK добавит Authorization: Bearer, который прокси не принимает.
    delete env.ANTHROPIC_AUTH_TOKEN;
    if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;

    for await (const message of query({
      prompt,
      options: {
        model: options.model,
        env,
        tools: [],
        maxTurns: 1,
        settingSources: [],
      },
    })) {
      // SDK сам повторяет запрос до 10 раз; неверный токен ретраями не лечится.
      if (message.type === 'system' && message.subtype === 'api_retry') {
        if (message.error_status === 401 || message.error_status === 403) {
          throw new Error(
            `Claude отклонил ANTHROPIC_AUTH_TOKEN (HTTP ${message.error_status})`,
          );
        }
        continue;
      }
      if (message.type !== 'result') continue;
      if (message.subtype !== 'success') {
        throw new Error(`Claude вернул ошибку: ${message.subtype}`);
      }
      return message.result;
    }
    throw new Error('Claude не вернул результат');
  }
}
