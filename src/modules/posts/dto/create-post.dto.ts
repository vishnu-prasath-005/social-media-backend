import { PostType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, IsUrl, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  content: string;

  @IsOptional()
  @IsEnum(PostType)
  type?: PostType = PostType.ORIGINAL;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  repostOfId?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({ require_tld: false }, { each: true })
  @ArrayMaxSize(4)
  mediaUrls?: string[];

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
