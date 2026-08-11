import { PostType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, IsUrl, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePostDto {
  @ApiPropertyOptional({ example: 'Hello Duckgoose! #welcome', maxLength: 280, description: 'Post text. Required unless mediaUrls contains an attachment.' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  content?: string;

  @ApiPropertyOptional({ enum: PostType, default: PostType.ORIGINAL })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType = PostType.ORIGINAL;

  @ApiPropertyOptional({ format: 'uuid', description: 'Parent post ID for a reply' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Original post ID for reposts and quotes' })
  @IsOptional()
  @IsUUID()
  repostOfId?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 4, example: ['https://example.com/image.jpg'] })
  @IsOptional()
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  @ArrayMaxSize(4)
  mediaUrls?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 10, example: ['welcome', 'social'] })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return [];
    const arr = Array.isArray(value) ? value : [value];
    // Strip leading # and lowercase each tag
    return arr.map((t: string) => t.replace(/^#/, '').toLowerCase().trim()).filter(Boolean);
  })
  @IsArray()
  @IsString({ each: true })
  @Matches(/^\w{1,100}$/, { each: true, message: 'Each tag must be 1–100 word characters' })
  @ArrayMaxSize(10)
  tags?: string[];
}
