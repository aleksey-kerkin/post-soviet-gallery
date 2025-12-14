import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl';
import type { TelegramImage } from '../types/image';

export async function createTelegramClient(
  apiId: number,
  apiHash: string,
  sessionString?: string
): Promise<TelegramClient> {
  const client = new TelegramClient(
    sessionString || 'telegram-gallery-session',
    apiId,
    apiHash,
    {
      connectionRetries: 5
    }
  );

  await client.connect();
  return client;
}

export async function getChannelImages(
  client: TelegramClient,
  channelUsername: string,
  limit: number = 100
): Promise<TelegramImage[]> {
  const images: TelegramImage[] = [];

  try {
    const entity = await client.getEntity(channelUsername);
    
    if (!(entity instanceof Api.Channel)) {
      throw new Error(`Entity ${channelUsername} is not a channel`);
    }

    const messages = await client.getMessages(entity, {
      limit
    });

    for (const message of messages) {
      if (!(message instanceof Api.Message)) continue;

      let imageData: TelegramImage | null = null;

      if (message.media) {
        if (message.media instanceof Api.MessageMediaPhoto) {
          const photo = message.media.photo;
          if (photo instanceof Api.Photo) {
            const sizes = photo.sizes.filter(
              (s): s is Api.PhotoSize => s instanceof Api.PhotoSize
            );
            const largestSize = sizes.reduce((prev, curr) => 
              (prev.w * prev.h > curr.w * curr.h) ? prev : curr
            );

            const file = await client.downloadMedia(message, {});
            const buffer = file as Buffer;
            const base64 = buffer.toString('base64');
            const url = `data:image/jpeg;base64,${base64}`;

            const thumbnailSize = sizes.find(s => s.type === 'm') || sizes[0];
            let thumbnailUrl: string | undefined;
            if (thumbnailSize && thumbnailSize !== largestSize) {
              try {
                const thumbFile = await client.downloadMedia(message, {
                  thumb: thumbnailSize
                });
                const thumbBuffer = thumbFile as Buffer;
                thumbnailUrl = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;
              } catch (e) {
                // Ignore thumbnail errors
              }
            }

            const messageDate = message.date as Date | number | undefined;
            const dateValue = typeof messageDate === 'number' 
              ? messageDate 
              : (messageDate && 'getTime' in messageDate ? messageDate.getTime() : Date.now());
            
            imageData = {
              id: `photo_${message.id}`,
              messageId: message.id,
              url,
              thumbnailUrl,
              width: largestSize.w,
              height: largestSize.h,
              date: dateValue,
              caption: message.message || undefined
            };
          }
        } else if (message.media instanceof Api.MessageMediaDocument) {
          const document = message.media.document;
          if (document instanceof Api.Document) {
            const mimeType = document.mimeType || '';
            if (mimeType.startsWith('image/')) {
              const attributes = document.attributes.filter(
                (attr): attr is Api.DocumentAttributeImageSize => 
                  attr instanceof Api.DocumentAttributeImageSize
              );
              const size = attributes[0];

              const file = await client.downloadMedia(message, {});
              const buffer = file as Buffer;
              const base64 = buffer.toString('base64');
              const url = `data:${mimeType};base64,${base64}`;

              let thumbnailUrl: string | undefined;
              const thumb = document.thumbs?.[0];
              if (thumb) {
                try {
                  const thumbFile = await client.downloadMedia(message, {
                    thumb: thumb
                  });
                  const thumbBuffer = thumbFile as Buffer;
                  thumbnailUrl = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;
                } catch (e) {
                  // Ignore thumbnail errors
                }
              }

              const messageDate = message.date as Date | number | undefined;
              const dateValue = typeof messageDate === 'number' 
                ? messageDate 
                : (messageDate && 'getTime' in messageDate ? messageDate.getTime() : Date.now());
              
              imageData = {
                id: `doc_${message.id}`,
                messageId: message.id,
                url,
                thumbnailUrl,
                width: size?.w || 0,
                height: size?.h || 0,
                fileSize: Number(document.size),
                date: dateValue,
                caption: message.message || undefined
              };
            }
          }
        }
      }

      if (imageData) {
        images.push(imageData);
      }
    }
  } catch (error) {
    console.error('Error fetching channel images:', error);
    throw error;
  }

  return images;
}

