import { Query } from '@nestjs/cqrs';

export class CreateDownloadLinkQuery extends Query<{ url: string }> {
  constructor(
    public readonly userId: string,
    public readonly meetingId: string,
    public readonly fileId: string,
  ) {
    super();
  }
}
