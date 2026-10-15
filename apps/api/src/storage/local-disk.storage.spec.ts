import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  FileTooLargeError,
  InvalidStorageKeyError,
  StorageObjectNotFoundError,
} from './file-storage.js';
import { LocalDiskStorage } from './local-disk.storage.js';

const collect = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};

const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  );

describe('LocalDiskStorage', () => {
  let root: string;
  let storage: LocalDiskStorage;
  const limit = { maxBytes: 1024 };

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'storage-'));
    storage = new LocalDiskStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('записывает поток и возвращает размер', async () => {
    const result = await storage.save(
      'meetings/m1/f1',
      Readable.from([Buffer.from('hello '), Buffer.from('world')]),
      limit,
    );

    expect(result).toEqual({ size: 11 });
    expect(await readFile(path.join(root, 'meetings/m1/f1'), 'utf8')).toBe(
      'hello world',
    );
  });

  it('читает записанный файл', async () => {
    await storage.save('a/b', Readable.from([Buffer.from('data')]), limit);

    const content = await collect(await storage.read('a/b'));

    expect(content.toString()).toBe('data');
  });

  it('read несуществующего ключа бросает StorageObjectNotFoundError', async () => {
    await expect(storage.read('nope')).rejects.toThrow(
      StorageObjectNotFoundError,
    );
  });

  it('удаляет файл, повторное удаление не падает', async () => {
    await storage.save('a/b', Readable.from([Buffer.from('x')]), limit);

    await storage.delete('a/b');
    await storage.delete('a/b');

    expect(await exists(path.join(root, 'a/b'))).toBe(false);
  });

  it('deletePrefix удаляет все файлы префикса и не трогает соседей', async () => {
    await storage.save('m1/f1', Readable.from([Buffer.from('1')]), limit);
    await storage.save('m1/f2', Readable.from([Buffer.from('2')]), limit);
    await storage.save('m2/f1', Readable.from([Buffer.from('3')]), limit);

    await storage.deletePrefix('m1');

    expect(await exists(path.join(root, 'm1'))).toBe(false);
    expect(await exists(path.join(root, 'm2/f1'))).toBe(true);
  });

  describe('лимит размера', () => {
    it('бросает FileTooLargeError и не оставляет ни файла, ни временных данных', async () => {
      const big = Readable.from([Buffer.alloc(600), Buffer.alloc(600)]);

      await expect(storage.save('a/b', big, limit)).rejects.toThrow(
        FileTooLargeError,
      );

      expect(await exists(path.join(root, 'a/b'))).toBe(false);
      expect(await readdir(path.join(root, '.tmp'))).toEqual([]);
    });

    it('принимает файл ровно в размер лимита', async () => {
      const result = await storage.save(
        'a/b',
        Readable.from([Buffer.alloc(1024)]),
        limit,
      );

      expect(result.size).toBe(1024);
    });
  });

  it('при обрыве источника не оставляет частичных данных', async () => {
    const broken = new Readable({
      read() {
        this.push(Buffer.from('partial'));
        this.destroy(new Error('connection reset'));
      },
    });

    await expect(storage.save('a/b', broken, limit)).rejects.toThrow();

    expect(await exists(path.join(root, 'a/b'))).toBe(false);
    expect(await readdir(path.join(root, '.tmp'))).toEqual([]);
  });

  describe('защита пути', () => {
    it.each([
      ['../outside'],
      ['a/../../outside'],
      ['/etc/passwd'],
      [''],
      ['.'],
      ['a\0b'],
      ['.tmp/x'],
    ])('ключ %j отклоняется', async (key) => {
      await expect(
        storage.save(key, Readable.from([Buffer.from('x')]), limit),
      ).rejects.toThrow(InvalidStorageKeyError);
      await expect(storage.read(key)).rejects.toThrow(InvalidStorageKeyError);
      await expect(storage.delete(key)).rejects.toThrow(InvalidStorageKeyError);
      await expect(storage.deletePrefix(key)).rejects.toThrow(
        InvalidStorageKeyError,
      );
    });

    it('не выходит за каталог хранилища', async () => {
      const outside = path.join(root, '..', 'outside');
      await storage
        .save('../outside', Readable.from([Buffer.from('x')]), limit)
        .catch(() => undefined);

      expect(await exists(outside)).toBe(false);
    });
  });

  describe('cleanupTemp', () => {
    it('удаляет только устаревшие временные файлы', async () => {
      await storage.save('a/b', Readable.from([Buffer.from('x')]), limit);
      const tmp = path.join(root, '.tmp');
      const old = path.join(tmp, 'old');
      const fresh = path.join(tmp, 'fresh');
      await Promise.all([old, fresh].map((f) => writeFile(f, 'x')));
      const past = new Date(Date.now() - 3 * 3600_000);
      await utimes(old, past, past);

      const removed = await storage.cleanupTemp(3600_000);

      expect(removed).toBe(1);
      expect(await exists(old)).toBe(false);
      expect(await exists(fresh)).toBe(true);
    });

    it('при старте убирает остатки прошлого запуска', async () => {
      const tmp = path.join(root, '.tmp');
      const stale = path.join(tmp, 'stale');
      await mkdir(tmp, { recursive: true });
      await writeFile(stale, 'x');
      const past = new Date(Date.now() - 3 * 3600_000);
      await utimes(stale, past, past);

      await storage.onModuleInit();

      expect(await exists(stale)).toBe(false);
    });

    it('без временного каталога возвращает 0', async () => {
      await expect(storage.cleanupTemp(1000)).resolves.toBe(0);
    });
  });
});
