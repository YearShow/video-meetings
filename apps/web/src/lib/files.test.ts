import { vi } from 'vitest';
import { getMeetingFiles } from './files';
import { apiFetch } from './meetings';

vi.mock('./meetings', () => ({ apiFetch: vi.fn() }));
const fetchMock = vi.mocked(apiFetch);

const respond = (status: number, body: unknown = []) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => vi.resetAllMocks());

describe('getMeetingFiles', () => {
  it('возвращает файлы при 200', async () => {
    respond(200, [{ id: 'f1' }]);
    await expect(getMeetingFiles('m1')).resolves.toEqual({
      ok: true,
      files: [{ id: 'f1' }],
    });
    expect(fetchMock).toHaveBeenCalledWith('/meetings/m1/files');
  });

  it.each([403, 404])('%i → forbidden', async (status) => {
    respond(status);
    await expect(getMeetingFiles('m1')).resolves.toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('500 → unavailable', async () => {
    respond(500);
    await expect(getMeetingFiles('m1')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('сетевая ошибка → unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getMeetingFiles('m1')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('401 (redirect на /auth/expired) не превращается в сообщение об ошибке', async () => {
    const redirectError = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/auth/expired;307;',
    });
    fetchMock.mockRejectedValue(redirectError);
    await expect(getMeetingFiles('m1')).rejects.toBe(redirectError);
  });
});
