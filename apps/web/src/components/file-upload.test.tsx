import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { getUploadCredentials } from '@/app/meetings/[id]/actions';
import { MAX_UPLOAD_BYTES } from '@/lib/upload';
import { FileUpload } from './file-upload';
import { MeetingFiles } from './meeting-files';

const refresh = vi.fn();
vi.mock('@/app/meetings/[id]/actions', () => ({
  getDownloadLink: vi.fn(),
  getUploadCredentials: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

class FakeXhr {
  static instances: FakeXhr[] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: FormData | null = null;
  status = 0;
  aborted = false;
  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  respond(status: number) {
    this.status = status;
    this.onload?.();
  }
}

const lastXhr = () => FakeXhr.instances[FakeXhr.instances.length - 1];
const small = () => new File(['hello'], 'заметки.txt', { type: 'text/plain' });
const waitForXhr = () => waitFor(() => expect(lastXhr()).toBeDefined());

beforeEach(() => {
  FakeXhr.instances = [];
  refresh.mockClear();
  vi.mocked(getUploadCredentials).mockReset();
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  vi.mocked(getUploadCredentials).mockResolvedValue({
    token: 'jwt-1',
    apiUrl: 'http://api.test',
  });
});
afterEach(() => vi.unstubAllGlobals());

const input = () => screen.getByLabelText('Файл для загрузки');

describe('FileUpload: выбор файла', () => {
  it('выбор через input отправляет файл в api с JWT', async () => {
    render(<FileUpload meetingId="m 1" />);
    await userEvent.upload(input(), small());
    await waitForXhr();
    expect(lastXhr().method).toBe('POST');
    expect(lastXhr().url).toBe('http://api.test/meetings/m%201/files');
    expect(lastXhr().headers.Authorization).toBe('Bearer jwt-1');
    expect((lastXhr().body?.get('file') as File).name).toBe('заметки.txt');
  });

  it('drop одного файла запускает загрузку', async () => {
    render(<FileUpload meetingId="m1" />);
    fireEvent.drop(screen.getByTestId('drop-zone'), {
      dataTransfer: { files: [small()] },
    });
    await waitForXhr();
    expect(FakeXhr.instances).toHaveLength(1);
  });

  it('несколько файлов не принимаются', async () => {
    render(<FileUpload meetingId="m1" />);
    fireEvent.drop(screen.getByTestId('drop-zone'), {
      dataTransfer: { files: [small(), small()] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'только один файл',
    );
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('input не принимает несколько файлов', () => {
    render(<FileUpload meetingId="m1" />);
    expect(input()).not.toHaveAttribute('multiple');
  });
});

describe('FileUpload: лимит размера', () => {
  it('файл > 500 МБ не отправляется, сообщение видно', async () => {
    render(<FileUpload meetingId="m1" />);
    const big = new File(['x'], 'big.mkv');
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    fireEvent.change(input(), { target: { files: [big] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/больше 500/);
    expect(getUploadCredentials).not.toHaveBeenCalled();
    expect(FakeXhr.instances).toHaveLength(0);
  });
});

describe('FileUpload: прогресс и отмена', () => {
  it('прогресс обновляется', async () => {
    render(<FileUpload meetingId="m1" />);
    await userEvent.upload(input(), small());
    await waitForXhr();
    lastXhr().progress(50, 100);
    const bar = await screen.findByRole('progressbar');
    await waitFor(() => expect(bar).toHaveAttribute('aria-valuenow', '50'));
  });

  it('отмена прерывает запрос, список не обновляется', async () => {
    render(<FileUpload meetingId="m1" />);
    await userEvent.upload(input(), small());
    await waitForXhr();
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(lastXhr().aborted).toBe(true);
    expect(await screen.findByRole('status')).toHaveTextContent('отменена');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('отмена до получения токена не отправляет запрос', async () => {
    let release!: (v: { token: string; apiUrl: string }) => void;
    vi.mocked(getUploadCredentials).mockReturnValue(
      new Promise((r) => (release = r)),
    );
    render(<FileUpload meetingId="m1" />);
    await userEvent.upload(input(), small());
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    release({ token: 't', apiUrl: 'http://api.test' });
    expect(await screen.findByRole('status')).toHaveTextContent('отменена');
    expect(FakeXhr.instances).toHaveLength(0);
  });
});

describe('FileUpload: ошибки и повтор', () => {
  it('413 показывает сообщение о лимите', async () => {
    render(<FileUpload meetingId="m1" />);
    await userEvent.upload(input(), small());
    await waitForXhr();
    lastXhr().respond(413);
    expect(await screen.findByRole('alert')).toHaveTextContent(/больше 500/);
  });

  it('ошибка сети: сообщение, повтор отправляет файл заново, список обновляется один раз', async () => {
    render(<FileUpload meetingId="m1" />);
    await userEvent.upload(input(), small());
    await waitForXhr();
    lastXhr().onerror?.();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'проверьте соединение',
    );
    expect(refresh).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    expect((lastXhr().body?.get('file') as File).name).toBe('заметки.txt');
    lastXhr().respond(201);
    expect(await screen.findByRole('status')).toHaveTextContent('загружен');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('5xx и 403 дают разные сообщения', async () => {
    render(<FileUpload meetingId="m1" />);
    await userEvent.upload(input(), small());
    await waitForXhr();
    lastXhr().respond(500);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сервер не смог',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    lastXhr().respond(403);
    expect(await screen.findByRole('alert')).toHaveTextContent('нет доступа');
  });

  it('истёкшая сессия: ссылка на вход вместо повтора', async () => {
    vi.mocked(getUploadCredentials).mockResolvedValue({ error: 'x' });
    render(<FileUpload meetingId="m1" />);
    await userEvent.upload(input(), small());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Сессия истекла',
    );
    expect(screen.getByRole('link', { name: 'Войти заново' })).toHaveAttribute(
      'href',
      '/auth/expired',
    );
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
  });
});

describe('FileUpload: успех и доступность', () => {
  it('после успеха список обновляется через router.refresh', async () => {
    render(<FileUpload meetingId="m1" />);
    await userEvent.upload(input(), small());
    await waitForXhr();
    lastXhr().respond(201);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Файл «заметки.txt» загружен',
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('кнопка выбора файла достижима с клавиатуры и открывает диалог', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    render(<FileUpload meetingId="m1" />);
    await userEvent.tab();
    const button = screen.getByRole('button', { name: 'Выбрать файл' });
    expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('при ошибке доступа к списку зона загрузки не показывается', () => {
    render(
      <MeetingFiles
        meetingId="m1"
        result={{ ok: false, reason: 'forbidden' }}
      />,
    );
    expect(screen.queryByTestId('drop-zone')).not.toBeInTheDocument();
  });
});
