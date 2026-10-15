import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { getDownloadLink } from '@/app/meetings/[id]/actions';
import type { MeetingFile } from '@/lib/files';
import { MeetingFiles } from './meeting-files';

vi.mock('@/app/meetings/[id]/actions', () => ({ getDownloadLink: vi.fn() }));

const files: MeetingFile[] = ['a.txt', 'b.txt'].map((name, i) => ({
  id: `f${i}`,
  name,
  size: 10,
  createdAt: '2026-03-05T09:30:00.000Z',
  uploadedBy: { id: 'u1', email: 'anna@example.com' },
}));

function setup() {
  vi.mocked(getDownloadLink).mockResolvedValue({ url: 'http://api.test/x' });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<MeetingFiles meetingId="m1" result={{ ok: true, files }} />);
}

afterEach(() => vi.restoreAllMocks());

describe('MeetingFiles: доступность', () => {
  it('раздел — именованная область со списком', () => {
    setup();
    const region = screen.getByRole('region', { name: 'Файлы' });
    expect(region).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('у каждой кнопки скачивания уникальное доступное имя', () => {
    setup();
    expect(
      screen.getByRole('button', { name: 'Скачать a.txt' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Скачать b.txt' }),
    ).toBeInTheDocument();
  });

  it('Tab проходит по кнопкам по порядку, Enter и пробел скачивают', async () => {
    setup();
    const user = userEvent.setup();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Скачать a.txt' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(getDownloadLink).toHaveBeenLastCalledWith('m1', 'f0');

    await user.tab();
    expect(screen.getByRole('button', { name: 'Скачать b.txt' })).toHaveFocus();
    await user.keyboard(' ');
    expect(getDownloadLink).toHaveBeenLastCalledWith('m1', 'f1');
  });
});
