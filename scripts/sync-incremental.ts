import { getChannelImagesFromMobile } from '../src/lib/telegram-mobile.js';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname as pathDirname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CHANNEL_USERNAME = 'PostSovietPhotography';
const IMAGES_FILE = join(__dirname, '..', 'data', 'images.json');
const INCREMENTAL_LIMIT = 100;

async function runCleanup(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('\n--- Running cleanup script ---');
    const cleanup = spawn('npm', ['run', 'cleanup'], {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
      shell: true
    });

    cleanup.on('close', (code) => {
      if (code === 0) {
        console.log('Cleanup completed successfully');
        resolve();
      } else {
        console.error(`Cleanup exited with code ${code}`);
        reject(new Error(`Cleanup failed with code ${code}`));
      }
    });

    cleanup.on('error', (error) => {
      console.error('Failed to start cleanup:', error);
      reject(error);
    });
  });
}

async function syncIncremental() {
  try {
    console.log(`Fetching new images from @${CHANNEL_USERNAME} via mobile parsing...`);
    
    // Ensure data directory exists
    await mkdir(pathDirname(IMAGES_FILE), { recursive: true });
    
    let lastSyncDate: number | undefined;
    let existingImages: any[] = [];
    
    try {
      const existingDataContent = await readFile(IMAGES_FILE, 'utf-8');
      const existingData = JSON.parse(existingDataContent);
      existingImages = existingData.images || [];
      lastSyncDate = existingData.lastSync;
      
      if (lastSyncDate) {
        const lastSyncDateObj = new Date(lastSyncDate);
        console.log(`Last sync: ${lastSyncDateObj.toLocaleString()}`);
        console.log(`Will fetch messages newer than: ${lastSyncDateObj.toLocaleString()}`);
      } else {
        console.log('No previous sync found, fetching recent messages only');
      }
    } catch (error) {
      console.log('No existing images file, will fetch recent messages');
    }

    const existingMessageIds = new Set<number>();
    const existingImageUrls = new Set<string>();
    
    existingImages.forEach(img => {
      if (img.messageId) {
        existingMessageIds.add(img.messageId);
      }
      if (img.url) {
        const normalizedUrl = img.url.split('?')[0];
        existingImageUrls.add(normalizedUrl);
      }
    });
    
    console.log(`Found ${existingMessageIds.size} existing message IDs and ${existingImageUrls.size} existing image URLs`);

    const images = await getChannelImagesFromMobile(
      CHANNEL_USERNAME, 
      INCREMENTAL_LIMIT, 
      'iPhone',
      lastSyncDate,
      existingMessageIds,
      existingImageUrls
    );

    console.log(`Found ${images.length} new images`);

    if (images.length === 0) {
      console.log('No new images found');
    } else {
      const imageMapById = new Map<string, any>();
      const imageMapByUrl = new Map<string, any>();
      
      existingImages.forEach(img => {
        imageMapById.set(img.id, img);
        const normalizedUrl = (img.url || '').split('?')[0];
        if (normalizedUrl && !imageMapByUrl.has(normalizedUrl)) {
          imageMapByUrl.set(normalizedUrl, img);
        }
      });
      
      let newCount = 0;
      images.forEach(img => {
        const normalizedUrl = (img.url || '').split('?')[0];
        
        if (normalizedUrl && imageMapByUrl.has(normalizedUrl)) {
          const existing = imageMapByUrl.get(normalizedUrl);
          if (existing.id !== img.id) {
            imageMapById.delete(existing.id);
          }
          imageMapById.set(img.id, img);
        } else if (!imageMapById.has(img.id)) {
          imageMapById.set(img.id, img);
          if (normalizedUrl) {
            imageMapByUrl.set(normalizedUrl, img);
          }
          newCount++;
        } else {
          const existing = imageMapById.get(img.id);
          if (existing.url !== img.url) {
            const oldNormalizedUrl = (existing.url || '').split('?')[0];
            if (oldNormalizedUrl) {
              imageMapByUrl.delete(oldNormalizedUrl);
            }
            imageMapById.set(img.id, img);
            if (normalizedUrl) {
              imageMapByUrl.set(normalizedUrl, img);
            }
          }
        }
      });

      const allImages = Array.from(imageMapById.values())
        .filter(img => {
          const url = (img.url || '').split('?')[0];
          const isSmallImage = (img.width > 0 && img.width < 200) || (img.height > 0 && img.height < 200);
          const isLogoOrIcon = url.includes('avatar') || 
                               url.includes('icon') || 
                               url.includes('logo') ||
                               url.includes('profile') ||
                               url.includes('channel_') ||
                               url.includes('_64') ||
                               url.includes('_128') ||
                               isSmallImage;
          return !isLogoOrIcon;
        })
        .sort((a, b) => b.date - a.date);

      await mkdir(pathDirname(IMAGES_FILE), { recursive: true });
      await writeFile(
        IMAGES_FILE,
        JSON.stringify({ images: allImages, lastSync: Date.now() }, null, 2),
        'utf-8'
      );

      console.log(`Synced ${allImages.length} total images (${newCount} new, ${images.length - newCount} updated)`);
      console.log('Incremental sync completed successfully');
    }
  } catch (error) {
    console.error('Incremental sync failed:', error);
    throw error;
  } finally {
    try {
      await runCleanup();
    } catch (error) {
      console.error('Cleanup failed, but continuing:', error);
    }
  }
}

syncIncremental()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Incremental sync failed:', error);
    process.exit(1);
  });

