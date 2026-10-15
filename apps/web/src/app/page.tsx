import { Button, Card, Skeleton } from '@heroui/react';
import Link from 'next/link';
import { Suspense } from 'react';
import { getMeetings, getProfile, type Meeting } from '@/lib/meetings';
import { CreateMeetingDialog } from '@/components/create-meeting-dialog';
import { logout } from './actions';

const RECENT_COUNT = 3;

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'long',
  timeStyle: 'short',
});

// Слова «встреча / встречи / встреч» по числу.
function pluralMeetings(n: number) {
  const rule = new Intl.PluralRules('ru-RU').select(n);
  if (rule === 'one') return 'встреча';
  if (rule === 'few') return 'встречи';
  return 'встреч';
}

// «Последние» — по дате встречи, самые поздние первыми.
function recent(meetings: Meeting[]) {
  return [...meetings]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, RECENT_COUNT);
}

async function HomeContent() {
  const [profile, meetings] = await Promise.all([getProfile(), getMeetings()]);
  const latest = recent(meetings);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Здравствуйте!</h1>
          <p className="truncate text-muted">{profile.email}</p>
        </div>
        <form action={logout}>
          <Button type="submit" variant="secondary" className="min-h-11">
            Выйти
          </Button>
        </form>
      </header>

      <Card>
        <Card.Header className="flex-row items-center justify-between gap-3">
          <div>
            <Card.Title>Ваши встречи</Card.Title>
            <Card.Description>
              Всего: {meetings.length} {pluralMeetings(meetings.length)}
            </Card.Description>
          </div>
          <CreateMeetingDialog />
        </Card.Header>
        <Card.Content>
          {latest.length === 0 ? (
            <p className="py-6 text-center text-muted">
              Встреч пока нет. Создайте первую.
            </p>
          ) : (
            <>
              <h2 className="mb-2 text-sm font-medium text-muted">
                Последние встречи
              </h2>
              <ul className="flex flex-col divide-y divide-separator">
                {latest.map((m) => (
                  <li key={m.id} className="flex flex-col gap-0.5 py-3">
                    <Link
                      href={`/meetings/${m.id}`}
                      className="font-medium break-words underline-offset-2 hover:underline"
                    >
                      {m.title}
                    </Link>
                    <time dateTime={m.date} className="text-sm text-muted">
                      {dateFormat.format(new Date(m.date))}
                    </time>
                    <span className="text-sm text-muted">
                      Участников: {m.participants.length}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card.Content>
      </Card>
    </>
  );
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-5 w-64 rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </main>
  );
}
