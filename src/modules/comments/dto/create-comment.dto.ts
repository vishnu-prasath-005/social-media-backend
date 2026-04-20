import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  content: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
