import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import type { Request } from 'express';

const ALLOWED_MIME = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|quicktime))$/;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const UPLOADS_DIR = join(process.cwd(), 'uploads');

@Controller('media')
export class MediaController {
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          mkdirSync(UPLOADS_DIR, { recursive: true });
          cb(null, UPLOADS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.bin';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.test(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Only JPEG, PNG, GIF, WebP images and MP4/WebM videos are allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file provided');

    const host = `${req.protocol}://${req.get('host')}`;
    const url = `${host}/uploads/${file.filename}`;
    return { url };
  }
}
