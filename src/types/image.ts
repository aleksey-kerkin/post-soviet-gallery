export interface TelegramImage {
  id: string;
  messageId: number;
  url: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  fileSize?: number;
  date: number;
  caption?: string;
  _error?: boolean;
}

export interface ImagesResponse {
  images: TelegramImage[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

