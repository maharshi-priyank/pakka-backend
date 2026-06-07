import { IsISO8601 } from 'class-validator';

export class CalendarEventsQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;
}
