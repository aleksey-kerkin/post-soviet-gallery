import type { APIRoute } from 'astro';
import { getChannelImagesFromMobile } from '../../lib/telegram-mobile';
import type { TelegramImage } from '../../types/image';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const vercelCronSecret = request.headers.get('x-vercel-cron-secret');

  if (cronSecret) {
    const isValid = authHeader === `Bearer ${cronSecret}` || 
                    vercelCronSecret === cronSecret;
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  try {
    const DATA_DIR = join(process.cwd(), 'data');
    const IMAGES_FILE = join(DATA_DIR, 'images.json');

    let lastSyncDate: number | undefined;
    let existingImages: TelegramImage[] = [];
    try {
      await mkdir(DATA_DIR, { recursive: true });
      const existingDataContent = await readFile(IMAGES_FILE, 'utf-8');
      const existingData = JSON.parse(existingDataContent);
      existingImages = existingData.images || [];
      lastSyncDate = existingData.lastSync;
    } catch (error) {
      // File doesn't exist yet, will create new one
    }

    const images = await getChannelImagesFromMobile('PostSovietPhotography', 500, 'iPhone', lastSyncDate);

    const imageMap = new Map<string, TelegramImage>();
    existingImages.forEach((img) => imageMap.set(img.id, img));
    images.forEach((img) => {
      if (!imageMap.has(img.id)) {
        imageMap.set(img.id, img);
      } else {
        const existing = imageMap.get(img.id);
        if (existing && existing.url !== img.url) {
          imageMap.set(img.id, img);
        }
      }
    });

    const allImages = Array.from(imageMap.values()).sort((a, b) => b.date - a.date);

    await writeFile(
      IMAGES_FILE,
      JSON.stringify({ images: allImages, lastSync: Date.now() }, null, 2),
      'utf-8'
    );

    return new Response(
      JSON.stringify({ 
        success: true, 
        total: allImages.length,
        new: images.length 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

