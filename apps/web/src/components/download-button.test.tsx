import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { getDownloadLink } from '@/app/meetings/[id]/actions';
import { DownloadButton } from './download-button';

vi.mock('@/app/meetings/[id]/actions', () => ({ getDownloadLink: vi.fn() }));

const getLink = vi.mocked(getDownloadLink);

function setup() {
  const clicked: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this.href);
  });
  render(<DownloadButton meetingId="m1" fileId="f1" fileName="отчёт.pdf" />);
  return clicked;
}

afterEach(() => vi.restoreAllMocks());

describe('DownloadButton', () => {
  it('запрашивает ссылку для нужного файла и открывает её', async () => {
    getLink.mockResolvedValue({
      url: 'http://api.test/meetings/m1/files/f1/content?token=abc',
    });
    const clicked = setup();

    await userEvent.click(
      screen.getByRole('button', { name: /Скачать отчёт/ }),
    );

    expect(getLink).toHaveBeenCalledWith('m1', 'f1');
    await waitFor(() =>
      expect(clicked).toEqual([
        'http://api.test/meetings/m1/files/f1/content?token=abc',
      ]),
    );
  });

  it('показывает ошибку и не открывает ссылку, если api отказал', async () => {
    getLink.mockResolvedValue({ error: 'Файл недоступен' });
    const clicked = setup();

    await userEvent.click(screen.getByRole('button', { name: /Скачать/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Файл недоступен',
    );
    expect(clicked).toEqual([]);
  });

  it('показывает ошибку при сбое вызова', async () => {
    getLink.mockRejectedValue(new Error('network'));
    setup();

    await userEvent.click(screen.getByRole('button', { name: /Скачать/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервер недоступен',
    );
  });
});
