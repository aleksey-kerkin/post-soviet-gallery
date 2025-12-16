import { getChannelImagesFromMobile } from '../src/lib/telegram-mobile.js';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname as pathDirname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CHANNEL_USERNAME = 'PostSovietPhotography';
const IMAGES_FILE = join(__dirname, '..', 'data', 'images.json');
const SYNC_LIMIT = 10000;

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
    console.log(`Fetching all images from @${CHANNEL_USERNAME} via mobile parsing (full sync)...`);
    
    // Ensure data directory exists
    await mkdir(pathDirname(IMAGES_FILE), { recursive: true });

    const images = await getChannelImagesFromMobile(
      CHANNEL_USERNAME, 
      SYNC_LIMIT, 
      'iPhone',
      undefined,
      undefined,
      undefined
    );

    console.log(`Found ${images.length} images`);

    if (images.length === 0) {
      console.log('No images found');
    } else {
      const allImages = images
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

      const dataDir = pathDirname(IMAGES_FILE);
      console.log(`Creating directory: ${dataDir}`);
      await mkdir(dataDir, { recursive: true });
      console.log(`Directory created, writing file: ${IMAGES_FILE}`);
      await writeFile(
        IMAGES_FILE,
        JSON.stringify({ images: allImages, lastSync: Date.now() }, null, 2),
        'utf-8'
      );
      console.log(`File written successfully: ${IMAGES_FILE}`);

      console.log(`Synced ${allImages.length} total images`);
      console.log('Full sync completed successfully');
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

