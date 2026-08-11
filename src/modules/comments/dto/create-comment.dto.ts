import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ example: 'Great post!', minLength: 1, maxLength: 280 })
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  content: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Parent comment ID for a reply' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
