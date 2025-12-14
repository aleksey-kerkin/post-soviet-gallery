import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IMAGES_FILE = join(__dirname, '..', 'data', 'images.json');
const BATCH_SIZE = 10;
const TIMEOUT = 5000;

async function checkImageUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function checkBrokenImages() {
  try {
    console.log('Reading images file...');
    const existingDataContent = await readFile(IMAGES_FILE, 'utf-8');
    const existingData = JSON.parse(existingDataContent);
    const existingImages: any[] = existingData.images || [];
    
    console.log(`Found ${existingImages.length} images`);
    console.log('Checking image URLs (this may take a while)...');

    const validImages: any[] = [];
    let checked = 0;
    let broken = 0;

    for (let i = 0; i < existingImages.length; i += BATCH_SIZE) {
      const batch = existingImages.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.all(
        batch.map(async (img) => {
          const url = img.thumbnailUrl || img.url;
          if (!url) {
            return { img, valid: false };
          }
          
          const isValid = await checkImageUrl(url);
          checked++;
          
          if (checked % 50 === 0) {
            console.log(`Checked ${checked}/${existingImages.length} images, found ${broken} broken`);
          }
          
          return { img, valid: isValid };
        })
      );

      for (const { img, valid } of results) {
        if (valid) {
          validImages.push(img);
        } else {
          broken++;
          console.log(`Broken image: ${img.id} - ${img.url?.substring(0, 80)}...`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\nChecked: ${checked} images`);
    console.log(`Valid: ${validImages.length} images`);
    console.log(`Broken: ${broken} images`);

    await writeFile(
      IMAGES_FILE,
      JSON.stringify({ images: validImages, lastSync: existingData.lastSync || Date.now() }, null, 2),
      'utf-8'
    );

    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Check failed:', error);
    throw error;
  }
}

checkBrokenImages()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Check failed:', error);
    process.exit(1);
  });

