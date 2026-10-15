import { Skeleton } from '@heroui/react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { MeetingFiles } from '@/components/meeting-files';
import { getMeetingFiles } from '@/lib/files';
import { getMeeting } from '@/lib/meetings';
import { formatDateTime } from '@/lib/format';

async function MeetingContent({ params }: PageProps<'/meetings/[id]'>) {
  const { id } = await params;
  const [meeting, filesResult] = await Promise.all([
    getMeeting(id),
    getMeetingFiles(id),
  ]);
  if (!meeting) notFound();

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold break-words">{meeting.title}</h1>
        <time dateTime={meeting.date} className="text-muted">
          {formatDateTime(meeting.date)}
        </time>
        <p className="text-sm text-muted">
          Участников: {meeting.participants.length}
        </p>
      </header>
      <MeetingFiles meetingId={id} result={filesResult} />
    </>
  );
}

function MeetingSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64 rounded-lg" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}

export default function MeetingPage(props: PageProps<'/meetings/[id]'>) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <Link href="/" className="text-sm text-muted underline">
        ← Все встречи
      </Link>
      <Suspense fallback={<MeetingSkeleton />}>
        <MeetingContent {...props} />
      </Suspense>
    </main>
  );
}
