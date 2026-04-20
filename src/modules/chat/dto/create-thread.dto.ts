import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateThreadDto {
  @IsArray()
  @IsUUID('all', { each: true })
  participantIds: string[];

  @IsOptional()
  @IsBoolean()
  isGroup?: boolean = false;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
