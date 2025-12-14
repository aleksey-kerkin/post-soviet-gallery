import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import type { TelegramImage } from '../types/image';

export type MobileDevice = 'iPhone' | 'Android';

const MOBILE_DEVICES = {
  iPhone: {
    viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  },
  Android: {
    viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36'
  }
};

export async function getChannelImagesFromMobile(
  channelUsername: string,
  limit: number = 3000,
  device: MobileDevice = 'iPhone',
  stopAfterDate?: number,
  existingMessageIds?: Set<number>,
  existingImageUrls?: Set<string>
): Promise<TelegramImage[]> {
  const images: TelegramImage[] = [];
  let browser;

  try {
    const url = `https://t.me/s/${channelUsername}`;
    const deviceConfig = MOBILE_DEVICES[device];

    console.log(`Launching browser with ${device} emulation...`);
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    await page.setViewport(deviceConfig.viewport);
    await page.setUserAgent(deviceConfig.userAgent);

    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br'
    });

    console.log('Loading page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const isIncrementalSync = (existingMessageIds && existingMessageIds.size > 0) || 
                              (existingImageUrls && existingImageUrls.size > 0);
    
    if (isIncrementalSync) {
      console.log('Incremental sync mode: scrolling down to load new messages...');
      
      let previousMessageCount = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 200;
      let stableCount = 0;
      let lastScrollHeight = 0;
      let noProgressCount = 0;

      while (scrollAttempts < maxScrollAttempts) {
        const result = await page.evaluate(() => {
          const messages = document.querySelectorAll('.tgme_widget_message, .message, .msg');
          const lastMessage = messages[messages.length - 1];

          if (lastMessage) {
            lastMessage.scrollIntoView({ behavior: 'smooth', block: 'end' });
          } else {
            window.scrollBy(0, document.body.scrollHeight);
          }

          return {
            messageCount: messages.length,
            scrollHeight: document.body.scrollHeight,
            scrollTop: window.pageYOffset || document.documentElement.scrollTop,
            clientHeight: window.innerHeight
          };
        });

        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));

        const currentMessageCount = await page.evaluate(() => {
          return document.querySelectorAll('.tgme_widget_message, .message, .msg').length;
        });

        const currentScrollHeight = result.scrollHeight;

        if (currentMessageCount === previousMessageCount && currentScrollHeight === lastScrollHeight) {
          noProgressCount++;
          stableCount++;

          if (stableCount >= 5) {
            console.log(`Stable at ${currentMessageCount} messages after ${stableCount} attempts, stopping scroll`);
            break;
          }
        } else {
          stableCount = 0;
          noProgressCount = 0;
          if (currentMessageCount > previousMessageCount) {
            console.log(`Loaded ${currentMessageCount} messages... (progress: +${currentMessageCount - previousMessageCount})`);
          }
        }

        previousMessageCount = currentMessageCount;
        lastScrollHeight = currentScrollHeight;
        scrollAttempts++;

        if (currentMessageCount >= limit) {
          console.log(`Reached limit of ${limit} messages`);
          break;
        }
      }
      
      console.log(`Finished scrolling, loaded ${previousMessageCount} messages total`);
    } else {
      console.log('Full sync mode: scrolling to load all messages...');
      
      let previousMessageCount = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 1000;
      let stableCount = 0;
      let lastScrollHeight = 0;
      let noProgressCount = 0;

      while (scrollAttempts < maxScrollAttempts) {
        const result = await page.evaluate(() => {
          const messages = document.querySelectorAll('.tgme_widget_message, .message, .msg');
          const lastMessage = messages[messages.length - 1];

          if (lastMessage) {
            lastMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            window.scrollBy(0, window.innerHeight * 0.8);
          }

          return {
            messageCount: messages.length,
            scrollHeight: document.body.scrollHeight,
            scrollTop: window.pageYOffset || document.documentElement.scrollTop,
            clientHeight: window.innerHeight
          };
        });

        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

        const currentMessageCount = await page.evaluate(() => {
          return document.querySelectorAll('.tgme_widget_message, .message, .msg').length;
        });

        const currentScrollHeight = result.scrollHeight;

        if (currentMessageCount === previousMessageCount && currentScrollHeight === lastScrollHeight) {
          noProgressCount++;
          stableCount++;

          const shouldUseAlternativeScroll = currentMessageCount >= 20 || noProgressCount >= 8;

          if (shouldUseAlternativeScroll) {
            console.log(`Loaded ${currentMessageCount} messages, trying alternative scroll...`);

            await page.evaluate(() => {
              window.scrollTo(0, 0);
            });
            await new Promise(resolve => setTimeout(resolve, 1500));

            await page.evaluate(() => {
              window.scrollTo(0, document.body.scrollHeight);
            });
            await new Promise(resolve => setTimeout(resolve, 3000));

            const afterScrollCount = await page.evaluate(() => {
              return document.querySelectorAll('.tgme_widget_message, .message, .msg').length;
            });

            if (afterScrollCount === currentMessageCount) {
              console.log(`Final count: ${afterScrollCount} messages (no more messages to load)`);
              break;
            }

            noProgressCount = 0;
            stableCount = 0;
          }

          if (stableCount >= 20) {
            console.log(`Stable at ${currentMessageCount} messages after ${stableCount} attempts`);
            break;
          }
        } else {
          stableCount = 0;
          noProgressCount = 0;
          if (currentMessageCount > previousMessageCount) {
            console.log(`Loaded ${currentMessageCount} messages... (progress: +${currentMessageCount - previousMessageCount})`);
          }
        }

        previousMessageCount = currentMessageCount;
        lastScrollHeight = currentScrollHeight;
        scrollAttempts++;

        if (currentMessageCount >= limit) {
          console.log(`Reached limit of ${limit} messages`);
          break;
        }

        if (scrollAttempts % 30 === 0) {
          console.log(`Progress: ${scrollAttempts} scroll attempts, ${currentMessageCount} messages loaded`);
        }
      }
    }

    console.log('Extracting images from page...');
    const html = await page.content();
    await browser.close();

    const $ = cheerio.load(html);

    const messages: Array<{ id: string; date: number; images: Array<{ url: string; width?: number; height?: number }>; caption?: string }> = [];

    let foundExistingMessage = false;
    let parsedCount = 0;

    const messageElements = $('.tgme_widget_message, .message, .msg').toArray();
    const elementsToProcess = isIncrementalSync ? messageElements.reverse() : messageElements;

    console.log(`Parsing ${elementsToProcess.length} messages ${isIncrementalSync ? 'from bottom to top (newest first)' : 'from top to bottom'}...`);

    for (const element of elementsToProcess) {
      if (messages.length >= limit || foundExistingMessage) break;

      const $msg = $(element);
      const postData = $msg.attr('data-post') || $msg.attr('data-id') || $msg.find('[data-post]').attr('data-post');

      let messageId: number | null = null;

      if (!postData) {
        const linkMatch = $msg.find('a[href*="/"]').first().attr('href');
        if (linkMatch) {
          const idMatch = linkMatch.match(/\/(\d+)$/);
          if (idMatch) {
            messageId = parseInt(idMatch[1]);
            if (isNaN(messageId)) messageId = null;
          }
        }
      } else {
        const parts = postData.split('/');
        if (parts.length >= 2) {
          messageId = parseInt(parts[1]);
          if (isNaN(messageId)) messageId = null;
        }
      }

      if (!messageId) {
        if (isIncrementalSync) {
          console.log(`[${parsedCount}] Skipping message without ID`);
        }
        continue;
      }

      const dateStr = $msg.find('time').attr('datetime') || $msg.find('[datetime]').attr('datetime');
      const date = dateStr ? new Date(dateStr).getTime() : Date.now();

      if (stopAfterDate && date < stopAfterDate) {
        if (isIncrementalSync) {
          console.log(`[${parsedCount}] Message ${messageId}: date ${new Date(date).toISOString()} is older than stop date, stopping`);
        }
        break;
      }

      if (messageId && existingMessageIds && existingMessageIds.has(messageId)) {
        console.log(`[${parsedCount}] Message ${messageId}: already exists in database, stopping parsing`);
        foundExistingMessage = true;
        break;
      }

      const messageImages: Array<{ url: string; width?: number; height?: number }> = [];
      const seenUrls = new Set<string>();
      let allImagesExist = true;
      let hasImages = false;

      $msg.find('.tgme_widget_message_photo_wrap, .tgme_widget_message_document_wrap, .photo, .media-photo, img').each((_, imgEl) => {
        const $img = $(imgEl);
        let imgUrl: string | undefined;

        const style = $img.attr('style') || '';
        const bgMatch = style.match(/background-image:url\(['"]?([^'")]+)/);
        if (bgMatch) {
          imgUrl = bgMatch[1];
        } else {
          imgUrl = $img.attr('src') || $img.attr('data-src');
        }

        if (imgUrl) {
          hasImages = true;
          if (!imgUrl.startsWith('http')) {
            imgUrl = `https://t.me${imgUrl}`;
          }

          const normalizedUrl = imgUrl.split('?')[0];

          if (existingImageUrls && existingImageUrls.has(normalizedUrl)) {
            if (isIncrementalSync) {
              console.log(`[${parsedCount}] Message ${messageId}: image already exists: ${normalizedUrl.substring(normalizedUrl.lastIndexOf('/') + 1)}`);
            }
            allImagesExist = allImagesExist && true;
            return;
          } else {
            allImagesExist = false;
          }

          if (seenUrls.has(normalizedUrl)) {
            return;
          }

          const widthMatch = style.match(/width:(\d+)/);
          const heightMatch = style.match(/height:(\d+)/);

          const width = widthMatch ? parseInt(widthMatch[1]) : parseInt($img.attr('width') || '0');
          const height = heightMatch ? parseInt(heightMatch[1]) : parseInt($img.attr('height') || '0');

          const isSmallImage = (width > 0 && width < 200) || (height > 0 && height < 200);
          const isLogoOrIcon = imgUrl.includes('avatar') ||
                               imgUrl.includes('icon') ||
                               imgUrl.includes('logo') ||
                               imgUrl.includes('profile') ||
                               imgUrl.includes('channel_') ||
                               imgUrl.includes('_64') ||
                               imgUrl.includes('_128') ||
                               isSmallImage;

          if (!isLogoOrIcon) {
            seenUrls.add(normalizedUrl);
            messageImages.push({
              url: imgUrl,
              width: width || undefined,
              height: height || undefined
            });
          }
        }
      });

      if (isIncrementalSync && hasImages && allImagesExist && messageImages.length === 0) {
        console.log(`[${parsedCount}] Message ${messageId}: all images already exist, stopping parsing`);
        foundExistingMessage = true;
        break;
      }

      if (messageImages.length === 0) {
        if (isIncrementalSync && hasImages) {
          console.log(`[${parsedCount}] Message ${messageId}: has images but all are filtered (logos/icons)`);
        }
        continue;
      }

      parsedCount++;
      console.log(`[${parsedCount}] Message ${messageId}: found ${messageImages.length} new image(s)`);

      const caption = $msg.find('.tgme_widget_message_text, .message-text, .text').text().trim() || undefined;

      messages.push({
        id: `mobile_${messageId}`,
        date,
        images: messageImages,
        caption
      });
    }

    if (isIncrementalSync) {
      console.log(`Finished parsing: processed ${parsedCount} messages, found ${messages.length} messages with new images`);
    }

    for (const message of messages) {
      for (let i = 0; i < message.images.length; i++) {
        const img = message.images[i];

        images.push({
          id: `${message.id}_${i}`,
          messageId: parseInt(message.id.split('_')[1]) || 0,
          url: img.url,
          width: img.width || 0,
          height: img.height || 0,
          date: message.date,
          caption: message.caption
        });
      }
    }

    return images;
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error('Error fetching channel from mobile:', error);
    throw error;
  }
}
