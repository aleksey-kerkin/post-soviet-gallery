import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname as pathDirname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IMAGES_FILE = join(__dirname, '..', 'data', 'images.json');

function isLogoOrIcon(img: any): boolean {
  const url = (img.url || '').split('?')[0].toLowerCase();
  const hasNoSize = (img.width === 0 && img.height === 0) || (!img.width && !img.height);
  const isSmallImage = (img.width > 0 && img.width < 200) || (img.height > 0 && img.height < 200);
  const isSquareAndSmall = img.width > 0 && img.height > 0 && 
                          Math.abs(img.width - img.height) < 50 && 
                          (img.width < 300 || img.height < 300);
  const isLogoOrIcon = url.includes('avatar') || 
                       url.includes('icon') || 
                       url.includes('logo') ||
                       url.includes('profile') ||
                       url.includes('channel_') ||
                       url.includes('_64') ||
                       url.includes('_128') ||
                       url.includes('thumb') ||
                       hasNoSize ||
                       isSmallImage ||
                       isSquareAndSmall;
  return isLogoOrIcon;
}

async function cleanupImages() {
  try {
    console.log('Reading images file...');
    let existingDataContent: string;
    try {
      existingDataContent = await readFile(IMAGES_FILE, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('Images file does not exist yet, skipping cleanup');
        return;
      }
      throw error;
    }
    const existingData = JSON.parse(existingDataContent);
    const existingImages: any[] = existingData.images || [];
    
    console.log(`Found ${existingImages.length} images`);

    const filteredImages = existingImages.filter(img => !isLogoOrIcon(img));
    
    const imagesByMessageId = new Map<number, any[]>();
    const imagesWithoutMessageId: any[] = [];

    for (const img of filteredImages) {
      const messageId = img.messageId || 0;
      if (messageId > 0) {
        if (!imagesByMessageId.has(messageId)) {
          imagesByMessageId.set(messageId, []);
        }
        imagesByMessageId.get(messageId)!.push(img);
      } else {
        imagesWithoutMessageId.push(img);
      }
    }

    const finalImages: any[] = [];
    const seenUrls = new Set<string>();

    for (const [messageId, images] of imagesByMessageId.entries()) {
      const urlMap = new Map<string, any>();
      
      for (const img of images) {
        const normalizedUrl = (img.url || '').split('?')[0];
        if (!normalizedUrl) continue;
        
        if (!urlMap.has(normalizedUrl)) {
          urlMap.set(normalizedUrl, img);
        } else {
          const existing = urlMap.get(normalizedUrl);
          if (img.date > existing.date) {
            urlMap.set(normalizedUrl, img);
          }
        }
      }

      const uniqueImages = Array.from(urlMap.values());
      
      if (uniqueImages.length === 1) {
        const img = uniqueImages[0];
        const normalizedUrl = (img.url || '').split('?')[0];
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          finalImages.push(img);
        }
      } else {
        const bestImage = uniqueImages.sort((a, b) => {
          const aSize = (a.width || 0) * (a.height || 0);
          const bSize = (b.width || 0) * (b.height || 0);
          if (bSize !== aSize) return bSize - aSize;
          return b.date - a.date;
        })[0];
        
        const normalizedUrl = (bestImage.url || '').split('?')[0];
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          finalImages.push(bestImage);
        }
      }
    }

    for (const img of imagesWithoutMessageId) {
      const normalizedUrl = (img.url || '').split('?')[0];
      if (normalizedUrl && !seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        finalImages.push(img);
      }
    }

    const sortedImages = finalImages
      .sort((a, b) => b.date - a.date);

    console.log(`Cleaned: ${existingImages.length} -> ${sortedImages.length} images`);
    console.log(`Removed: ${existingImages.length - sortedImages.length} duplicates and logos`);

    await mkdir(pathDirname(IMAGES_FILE), { recursive: true });
    await writeFile(
      IMAGES_FILE,
      JSON.stringify({ images: sortedImages, lastSync: existingData.lastSync || Date.now() }, null, 2),
      'utf-8'
    );

    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Cleanup failed:', error);
    throw error;
  }
}

cleanupImages()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exit(1);
  });

