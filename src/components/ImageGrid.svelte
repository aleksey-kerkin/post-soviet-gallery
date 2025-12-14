<script lang="ts">
  import { onMount } from 'svelte';
  import { BalancedMasonryGrid, Frame } from '@masonry-grid/svelte';
  import type { TelegramImage, ImagesResponse } from '../types/image';

  let images: TelegramImage[] = [];
  let loading = false;
  let hasMore = true;
  let page = 1;
  let total = 0;
  let observer: IntersectionObserver | null = null;
  let loadMoreElement: HTMLElement | null = null;

  const LIMIT = 20;

  function formatCaption(caption: string): string {
    return caption.replace(/@([a-zA-Z0-9_]+)/g, '<a href="https://t.me/$1" target="_blank" rel="noopener noreferrer">@$1</a>');
  }

  function getFrameDimensions(w: number, h: number): { width: number; height: number } {
    const max = Math.max(w, h);
    const divisor = max > 1000 ? 100 : (max > 100 ? 10 : 1);
    return { width: Math.round(w / divisor), height: Math.round(h / divisor) };
  }

  function getFrameWidth(img: TelegramImage): number {
    const extended = img as TelegramImage & { _frameWidth?: number };
    return extended._frameWidth || getFrameDimensions(img.width, img.height).width;
  }

  function getFrameHeight(img: TelegramImage): number {
    const extended = img as TelegramImage & { _frameHeight?: number };
    return extended._frameHeight || getFrameDimensions(img.width, img.height).height;
  }

  async function loadImages(pageNum: number) {
    if (loading) {
      return;
    }
    
    loading = true;
    try {
      const url = `/api/images.json?page=${pageNum}&limit=${LIMIT}&_=${Date.now()}`;
      const response = await fetch(url, {
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: ImagesResponse = await response.json();
      
      const processedImages = data.images.map((img) => {
        const processed = { ...img };
        if (!processed.height || processed.height === 0) {
          processed.height = processed.width ? Math.round(processed.width * 1.2) : 400;
        }
        if (!processed.width || processed.width === 0) {
          processed.width = 300;
        }
        const dims = getFrameDimensions(processed.width, processed.height);
        (processed as any)._frameWidth = dims.width;
        (processed as any)._frameHeight = dims.height;
        return processed;
      });
      
      if (pageNum === 1) {
        images = processedImages;
      } else {
        images = [...images, ...processedImages];
      }
      
      hasMore = data.hasMore;
      total = data.total;
      page = pageNum;
      
      if (hasMore && loadMoreElement) {
        setTimeout(() => {
          if (loadMoreElement) {
            const rect = loadMoreElement.getBoundingClientRect();
            const isVisible = rect.top < window.innerHeight + 500;
            
            if (isVisible && !loading) {
              loadImages(page + 1);
            } else if (observer) {
              observer.unobserve(loadMoreElement);
              observer.observe(loadMoreElement);
            }
          }
        }, 200);
      }
    } catch (error) {
      console.error('Failed to load images:', error);
      loading = false;
    } finally {
      loading = false;
    }
  }

  function setupIntersectionObserver() {
    if (typeof window === 'undefined') return;

    if (observer) {
      observer.disconnect();
    }

    observer = new IntersectionObserver(
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

    if (loadMoreElement) {
      observer.observe(loadMoreElement);
    }
  }

  onMount(() => {
    loadImages(1);
    
    const checkObserver = () => {
      if (loadMoreElement && !observer && images.length > 0) {
        setupIntersectionObserver();
      } else if (!loadMoreElement && images.length > 0) {
        setTimeout(checkObserver, 100);
      }
    };
    
    setTimeout(checkObserver, 200);
    
    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  });
</script>

<div class="gallery-container">
  {#if images.length === 0 && !loading}
    <div class="empty-state">
      <p>Изображения не найдены</p>
      <p class="empty-hint">Проверьте консоль браузера для диагностики</p>
    </div>
  {:else if images.length > 0}
    <BalancedMasonryGrid class="image-grid" frameWidth={200} gap={24}>
      {#each images as image (image.id)}
        {#if !image._error && image.url && image.height > 0 && image.width > 0}
          <Frame width={getFrameWidth(image)} height={getFrameHeight(image)} class="frame">
            <div class="image-item">
              <img
                src={image.thumbnailUrl || image.url}
                alt={image.caption || 'Gallery image'}
                loading="lazy"
                decoding="async"
                onerror={(e) => {
                  const target = e.target;
                  if (target instanceof HTMLImageElement) {
                    console.error('Image load error:', {
                      id: image.id,
                      url: image.url?.substring(0, 100),
                      src: target.src?.substring(0, 100)
                    });
                  }
                  image._error = true;
                  images = [...images];
                }}
                onload={(e) => {
                  const target = e.target;
                  if (target instanceof HTMLImageElement) {
                    if (target.naturalHeight > 0 && (image.height === 0 || !image.height)) {
                      image.height = target.naturalHeight;
                      image.width = target.naturalWidth;
                      images = [...images];
                    }
                  }
                }}
              />
              {#if image.caption}
                <div class="image-caption">{@html formatCaption(image.caption)}</div>
              {/if}
            </div>
          </Frame>
        {/if}
      {/each}
    </BalancedMasonryGrid>
  {/if}

  {#if loading}
    <div class="loading">Загрузка...</div>
  {/if}

  {#if hasMore}
    <div bind:this={loadMoreElement} class="load-more-trigger"></div>
  {/if}

  <div class="stats">
    Показано: <strong>{images.length}</strong> из <strong>{total || '...'}</strong> изображений
    {#if loading}
      <span class="loading-indicator">Загрузка...</span>
    {:else if !hasMore && total > 0}
      <span class="complete">Все загружено</span>
    {/if}
  </div>
</div>

<style>
  .gallery-container {
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .image-grid {
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  :global(.image-grid > *) {
    min-width: 150px;
  }

  :global(.frame) {
    position: relative;
  }

  .image-item {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    overflow: hidden;
    border-radius: 0;
    background: var(--bg-surface-0);
    border: 2px solid var(--border-color);
    cursor: pointer;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .image-item:hover {
    border-color: var(--accent-primary);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  }

  .image-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .image-caption {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--bg-crust);
    color: var(--text-primary);
    padding: 1rem;
    font-size: var(--font-size-sm);
    font-family: var(--font-body);
    border-top: 2px solid var(--border-color);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .image-caption :global(a) {
    color: var(--accent-primary);
    text-decoration: none;
    transition: text-decoration 0.2s ease;
  }

  .image-caption :global(a:hover) {
    text-decoration: underline;
  }

  .image-item:hover .image-caption {
    opacity: 1;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    font-size: var(--font-size-lg);
    color: var(--text-secondary);
    font-family: var(--font-body);
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-secondary);
    font-family: var(--font-body);
  }

  .empty-state p {
    margin: 0.5rem 0;
  }

  .empty-hint {
    font-size: var(--font-size-sm);
    color: var(--text-tertiary);
  }

  .load-more-trigger {
    height: 1px;
    width: 100%;
  }

  .stats {
    text-align: center;
    padding: 1.5rem;
    color: var(--text-secondary);
    font-size: var(--font-size-base);
    font-family: var(--font-body);
    background: var(--bg-surface-0);
    border: 2px solid var(--border-color);
    border-radius: 0;
    margin-top: 2rem;
  }

  .stats strong {
    color: var(--text-primary);
    font-weight: 700;
  }

  .loading-indicator {
    margin-left: 0.5rem;
    animation: pulse 1.5s ease-in-out infinite;
    color: var(--accent-primary);
  }

  .complete {
    margin-left: 0.5rem;
    color: var(--accent-success);
    font-weight: 500;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @media (max-width: 768px) {
    .image-grid {
      gap: 1rem;
    }
  }
</style>

