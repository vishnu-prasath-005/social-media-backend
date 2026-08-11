import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateThreadDto {
  @ApiProperty({ type: [String], format: 'uuid', example: ['9ee6bb9a-1f78-4e82-9013-1e32b5b32eb7'] })
  @IsArray()
  @IsUUID('all', { each: true })
  participantIds: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isGroup?: boolean = false;

  @ApiPropertyOptional({ example: 'Project chat', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
