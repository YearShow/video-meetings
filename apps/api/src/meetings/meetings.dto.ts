import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsDateString()
  date: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsEmail({}, { each: true })
  participants: string[];
}
