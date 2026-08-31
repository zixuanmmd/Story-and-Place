import "server-only";

import sharp from "sharp";
import {
  detectImageMime,
  sourceImageMimeSchema,
  STORY_MEDIA_MAX_SOURCE_BYTES,
  type SourceImageMime,
} from "@/lib/media/contracts";

const MAX_INPUT_PIXELS = 40_000_000;

export class StoryMediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryMediaValidationError";
  }
}

export type ProcessedStoryImage = {
  sourceMimeType: SourceImageMime;
  full: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
};

export async function processStoryImage(file: File): Promise<ProcessedStoryImage> {
  if (file.size < 1 || file.size > STORY_MEDIA_MAX_SOURCE_BYTES) {
    throw new StoryMediaValidationError("图片大小需在 4 MB 以内。");
  }
  const declaredMime = sourceImageMimeSchema.safeParse(file.type);
  if (!declaredMime.success) {
    throw new StoryMediaValidationError("只支持 JPEG、PNG 或 WebP 图片。");
  }

  const input = Buffer.from(await file.arrayBuffer());
  const detectedMime = detectImageMime(input);
  if (!detectedMime || detectedMime !== declaredMime.data) {
    throw new StoryMediaValidationError("图片内容与文件类型不一致，请重新选择图片。");
  }

  try {
    const metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) {
      throw new StoryMediaValidationError("暂不支持动图或无法识别的图片。");
    }

    const fullPipeline = sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 84, effort: 4 });
    const { data: full, info } = await fullPipeline.toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: 640,
        height: 640,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 76, effort: 4 })
      .toBuffer();

    return {
      sourceMimeType: detectedMime,
      full,
      thumbnail,
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof StoryMediaValidationError) throw error;
    throw new StoryMediaValidationError("图片无法安全处理，请换一张图片后重试。");
  }
}
