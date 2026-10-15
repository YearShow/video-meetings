// Ошибка с сообщением, которое безопасно показать пользователю.
export class TranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

export const GENERIC_TRANSCRIPTION_ERROR = 'Не удалось выполнить транскрибацию';
