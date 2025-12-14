import type { TelegramImage, ImagesResponse } from '../types/image';
import { readFile } from 'fs/promises';
import { join } from 'path';

const IMAGES_PER_PAGE = 20;

export function getImages(
  allImages: TelegramImage[],
  page: number = 1,
  limit: number = IMAGES_PER_PAGE
): ImagesResponse {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const images = allImages.slice(startIndex, endIndex);
  const total = allImages.length;
  const hasMore = endIndex < total;

  return {
    images,
    total,
    page,
    limit,
    hasMore
  };
}

export async function loadImagesData(): Promise<TelegramImage[]> {
  try {
    const imagesFile = join(process.cwd(), 'data', 'images.json');
    const content = await readFile(imagesFile, 'utf-8');
    const data = JSON.parse(content);
    const images = data.images || [];
    return images;
  } catch (error) {
    try {
      const imagesData = await import('../../data/images.json');
      const images = imagesData.default?.images || imagesData.images || [];
      return images;
    } catch (importError) {
      console.error('Failed to load images data via import:', importError);
      return [];
    }
  }
}

