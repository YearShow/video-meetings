import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    // Тесты делят одну БД: без этого приложение одного файла на старте подхватило бы
    // задачи транскрибации, созданные в другом. Восстановление проверяется явным вызовом.
    env: { TRANSCRIPTION_RECOVERY: 'off' },
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
