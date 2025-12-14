import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BalancedMasonryGrid, Frame } from '@masonry-grid/react';
import type { TelegramImage, ImagesResponse } from '../types/image';
import './ImageGrid.css';

const LIMIT = 20;

function formatCaption(caption: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /@([a-zA-Z0-9_]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(caption)) !== null) {
    if (match.index > lastIndex) {
      parts.push(caption.substring(lastIndex, match.index));
    }
    parts.push(
      <a
        key={match.index}
        href={`https://t.me/${match[1]}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        @{match[1]}
      </a>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < caption.length) {
    parts.push(caption.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [caption];
}

function preloadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      } else {
        reject(new Error('Invalid image dimensions'));
      }
    };
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function getFrameDimensions(w: number, h: number): { width: number; height: number } {
  // Находим наибольший общий делитель для нормализации соотношения
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  
  // Сохраняем ориентацию (широкое должно остаться широким)
  const isWide = w > h;
  
  // Нормализуем до разумных значений (максимум 50 для width/height)
  let width = w;
  let height = h;
  
  // Если числа слишком большие, делим на НОД
  const divisor = gcd(width, height);
  if (divisor > 1) {
    width = width / divisor;
    height = height / divisor;
  }
  
  // Если все еще слишком большие, делим пропорционально
  while (width > 50 || height > 50) {
    const scale = Math.max(width / 50, height / 50);
    width = width / scale;
    height = height / scale;
  }
  
  // Округляем и убеждаемся, что минимум 1
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  
  // Проверяем, что ориентация сохранилась
  const resultIsWide = width > height;
  if (isWide !== resultIsWide && width === height) {
    // Если получилось квадратное, но должно быть широкое - делаем его широким
    if (isWide) {
      width = Math.max(2, width);
    } else {
      height = Math.max(2, height);
    }
  }
  
  return { width, height };
}

function getFrameWidth(img: TelegramImage & { _frameWidth?: number; _frameHeight?: number }): number {
  return img._frameWidth || getFrameDimensions(img.width, img.height).width;
}

function getFrameHeight(img: TelegramImage & { _frameWidth?: number; _frameHeight?: number }): number {
  return img._frameHeight || getFrameDimensions(img.width, img.height).height;
}

function calculateFrameWidth(windowWidth: number, containerMaxWidth: number = 1400): number {
  const padding = 32; // 2rem * 2 = 32px
  const gap = 24; // gap между колонками
  
  if (windowWidth >= 1024) {
    // 3 колонки на больших экранах (1024px и выше)
    const availableWidth = Math.min(windowWidth - padding, containerMaxWidth - padding);
    const gaps = gap * 2; // 2 промежутка между 3 колонками
    return Math.floor((availableWidth - gaps) / 3);
  } else if (windowWidth >= 478) {
    // 2 колонки на планшетах и средних экранах (478px - 1023px)
    const availableWidth = windowWidth - padding;
    const gaps = gap; // 1 промежуток между 2 колонками
    return Math.floor((availableWidth - gaps) / 2);
  } else {
    // 1 колонка на мобильных (ниже 478px)
    const availableWidth = windowWidth - padding;
    return Math.floor(availableWidth * 0.95); // 95% ширины с небольшим отступом
  }
}

export default function ImageGrid() {
  const [images, setImages] = useState<(TelegramImage & { _frameWidth?: number; _frameHeight?: number })[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1920);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [pendingNextImage, setPendingNextImage] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreElementRef = useRef<HTMLDivElement | null>(null);

  const loadImages = useCallback(async (pageNum: number) => {
    setLoading(prev => {
      if (prev) return prev;
      return true;
    });
    
    try {
      const url = `/api/images.json?page=${pageNum}&limit=${LIMIT}&_=${Date.now()}`;
      const response = await fetch(url, {
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: ImagesResponse = await response.json();
      
      // Обрабатываем все изображения сразу, используя данные из JSON
      // Размеры будут обновлены при загрузке изображения через handleImageLoad
      const processedImages = data.images.map((img) => {
        const processed = { ...img };
        
        // Если размеры отсутствуют, используем приблизительные значения для быстрого отображения
        if (!processed.height || processed.height === 0) {
          if (processed.width > 600) {
            processed.height = Math.round(processed.width * 0.75);
          } else if (processed.width > 0) {
            processed.height = Math.round(processed.width * 1.33);
          } else {
            processed.width = 400;
            processed.height = 300;
          }
        }
        
        if (!processed.width || processed.width === 0) {
          if (processed.height > 0) {
            processed.width = Math.round(processed.height * 0.75);
          } else {
            processed.width = 400;
            processed.height = 300;
          }
        }
        
        const dims = getFrameDimensions(processed.width, processed.height);
        processed._frameWidth = dims.width;
        processed._frameHeight = dims.height;
        return processed;
      });
      
      // Асинхронно предзагружаем размеры для изображений без размеров (в фоне, не блокируя отображение)
      const imagesToPreload = data.images.filter(img => !img.height || img.height === 0);
      if (imagesToPreload.length > 0) {
        Promise.allSettled(
          imagesToPreload.map(async (img) => {
            try {
              const dimensions = await preloadImageDimensions(img.url);
              setImages(prev => prev.map(prevImg => {
                if (prevImg.id === img.id && (prevImg.height === 0 || !prevImg.height)) {
                  const updated = { ...prevImg, width: dimensions.width, height: dimensions.height };
                  const dims = getFrameDimensions(updated.width, updated.height);
                  updated._frameWidth = dims.width;
                  updated._frameHeight = dims.height;
                  return updated;
                }
                return prevImg;
              }));
            } catch (error) {
              // Игнорируем ошибки предзагрузки
            }
          })
        );
      }
      
      setImages(prev => {
        if (pageNum === 1) {
          return processedImages;
        } else {
          return [...prev, ...processedImages];
        }
      });
      
      setHasMore(data.hasMore);
      setTotal(data.total);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to load images:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImages(1);
  }, [loadImages]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Отслеживание размера окна для адаптивного frameWidth
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!loadMoreElementRef.current || images.length === 0) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && hasMore && !loading) {
            loadImages(page + 1);
          }
        });
      },
      {
        rootMargin: '500px',
        threshold: 0.1
      }
    );

    observerRef.current.observe(loadMoreElementRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [images.length, hasMore, loading, page, loadImages]);

  const handleImageError = (image: TelegramImage & { _error?: boolean }) => {
    image._error = true;
    setImages([...images]);
  };

  const handleImageLoad = (image: TelegramImage & { _error?: boolean }, e: React.SyntheticEvent<HTMLImageElement>) => {
    // Резервный механизм: если предзагрузка не сработала, обновляем размеры при загрузке
    const target = e.target as HTMLImageElement;
    if (target.naturalHeight > 0 && target.naturalWidth > 0) {
      const oldHeight = image.height;
      const oldWidth = image.width;
      
      // Обновляем только если размеры значительно отличаются (предзагрузка могла не сработать)
      if (Math.abs(oldHeight - target.naturalHeight) > 50 || Math.abs(oldWidth - target.naturalWidth) > 50) {
        image.height = target.naturalHeight;
        image.width = target.naturalWidth;
        
        const dims = getFrameDimensions(image.width, image.height);
        image._frameWidth = dims.width;
        image._frameHeight = dims.height;
        setImages(prev => [...prev]); // Обновляем состояние
      }
    }
  };

  // Вычисляем frameWidth на основе размера окна
  const frameWidth = useMemo(() => calculateFrameWidth(windowWidth), [windowWidth]);

  const visibleImages = images.filter(img => !img._error && img.url && img.height > 0 && img.width > 0);
  
  const openImage = (imageId: string) => {
    setSelectedImageId(imageId);
    document.body.style.overflow = 'hidden';
  };

  const closeImage = () => {
    setSelectedImageId(null);
    document.body.style.overflow = '';
  };

  const goToPrevious = useCallback(() => {
    if (selectedImageId === null) return;
    
    const currentIndex = visibleImages.findIndex(img => img.id === selectedImageId);
    if (currentIndex > 0) {
      setSelectedImageId(visibleImages[currentIndex - 1].id);
    }
  }, [selectedImageId, visibleImages]);

  const goToNext = useCallback(() => {
    if (selectedImageId === null) return;
    
    const currentIndex = visibleImages.findIndex(img => img.id === selectedImageId);
    
    // Если достигли последнего изображения и есть еще страницы, загружаем следующую
    if (currentIndex >= 0 && currentIndex === visibleImages.length - 1 && hasMore && !loading) {
      setPendingNextImage(true);
      loadImages(page + 1);
    } else if (currentIndex >= 0 && currentIndex < visibleImages.length - 1) {
      setSelectedImageId(visibleImages[currentIndex + 1].id);
    }
  }, [selectedImageId, visibleImages, hasMore, loading, page, loadImages]);

  useEffect(() => {
    if (selectedImageId === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeImage();
      } else if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImageId, goToPrevious, goToNext]);

  // Автоматический переход к следующему изображению после загрузки новой страницы
  useEffect(() => {
    if (pendingNextImage && selectedImageId !== null && !loading) {
      const currentIndex = visibleImages.findIndex(img => img.id === selectedImageId);
      if (currentIndex >= 0 && currentIndex < visibleImages.length - 1) {
        setSelectedImageId(visibleImages[currentIndex + 1].id);
        setPendingNextImage(false);
      } else if (!hasMore || currentIndex === visibleImages.length - 1) {
        // Если нет больше изображений или мы все еще на последнем, сбрасываем флаг
        setPendingNextImage(false);
      }
    }
  }, [pendingNextImage, selectedImageId, visibleImages, loading, hasMore]);

  const selectedImage = selectedImageId !== null 
    ? visibleImages.find(img => img.id === selectedImageId) || null
    : null;
  const selectedImageIndex = selectedImage !== null
    ? visibleImages.findIndex(img => img.id === selectedImageId)
    : -1;

  return (
    <div className="gallery-container">
      {images.length === 0 && !loading ? (
        <div className="empty-state">
          <p>Изображения не найдены</p>
          <p className="empty-hint">Проверьте консоль браузера для диагностики</p>
        </div>
      ) : images.length > 0 ? (
        <BalancedMasonryGrid 
          className="image-grid" 
          frameWidth={frameWidth} 
          gap={24}
        >
          {images.map((image) => {
            if (image._error || !image.url || image.height <= 0 || image.width <= 0) {
              return null;
            }
            const frameWidth = getFrameWidth(image);
            const frameHeight = getFrameHeight(image);
            
            return (
              <Frame
                key={image.id}
                width={frameWidth}
                height={frameHeight}
                className="frame"
                style={{ '--width': frameWidth, '--height': frameHeight } as React.CSSProperties}
              >
                <div 
                  className="image-item"
                  onClick={() => {
                    openImage(image.id);
                  }}
                >
                  <img
                    src={image.thumbnailUrl || image.url}
                    alt={image.caption || 'Gallery image'}
                    loading="lazy"
                    decoding="async"
                    style={{
                      aspectRatio: image.width > 0 && image.height > 0 
                        ? `${image.width} / ${image.height}` 
                        : undefined
                    }}
                    onError={() => handleImageError(image)}
                    onLoad={(e) => handleImageLoad(image, e)}
                  />
                  {image.caption && (
                    <div className="image-caption">{formatCaption(image.caption)}</div>
                  )}
                </div>
              </Frame>
            );
          })}
        </BalancedMasonryGrid>
      ) : null}

      {loading && (
        <div className="loading">Загрузка...</div>
      )}

      {hasMore && (
        <div ref={loadMoreElementRef} className="load-more-trigger" />
      )}

      {!hasMore && images.length > 0 && (
        <div className="stats">
          Загружено <strong>{images.length}</strong> из <strong>{total}</strong> изображений
        </div>
      )}

      {selectedImage && selectedImageId !== null && (
        <div className="lightbox" onClick={closeImage}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div 
              className="lightbox-image-wrapper"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const width = rect.width;
                const isLeftSide = clickX < width / 2;
                
                if (isLeftSide && selectedImageIndex > 0) {
                  goToPrevious();
                } else if (!isLeftSide) {
                  goToNext();
                }
              }}
            >
              <img
                src={selectedImage.url}
                alt={selectedImage.caption || 'Gallery image'}
                className="lightbox-image"
              />
            </div>
            {selectedImage.caption && (
              <div className="lightbox-caption">{formatCaption(selectedImage.caption)}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
