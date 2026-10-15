import { vi } from 'vitest';
import { apiFetch } from '@/lib/meetings';
import { getDownloadLink } from './actions';

vi.mock('@/lib/meetings', () => ({ apiFetch: vi.fn() }));
const fetchMock = vi.mocked(apiFetch);

afterEach(() => vi.resetAllMocks());

describe('getDownloadLink', () => {
  it('просит ссылку POST-ом и дополняет её адресом api', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ url: '/meetings/m1/files/f1/content?token=t' }),
    );
    await expect(getDownloadLink('m1', 'f1')).resolves.toEqual({
      url: 'http://localhost:4000/meetings/m1/files/f1/content?token=t',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/meetings/m1/files/f1/download-link',
      { method: 'POST' },
    );
  });

  it.each([403, 404])('%i → сообщение о недоступности', async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(getDownloadLink('m1', 'f1')).resolves.toEqual({
      error: expect.stringContaining('недоступен'),
    });
  });

  it('500 → общая ошибка', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(getDownloadLink('m1', 'f1')).resolves.toEqual({
      error: expect.stringContaining('Не удалось'),
    });
  });

  it('сетевая ошибка → «сервер недоступен»', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getDownloadLink('m1', 'f1')).resolves.toEqual({
      error: expect.stringContaining('Сервер недоступен'),
    });
  });

  it('redirect при 401 пробрасывается', async () => {
    const err = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/auth/expired;307;',
    });
    fetchMock.mockRejectedValue(err);
    await expect(getDownloadLink('m1', 'f1')).rejects.toBe(err);
  });
});
