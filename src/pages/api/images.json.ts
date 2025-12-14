import type { APIRoute } from 'astro';
import { loadImagesData, getImages } from '../../lib/images';

export const GET: APIRoute = async ({ url }) => {
  try {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    const allImages = await loadImagesData();
    const response = getImages(allImages, page, limit);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': process.env.NODE_ENV === 'production' 
          ? 'public, max-age=3600' 
          : 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error) {
    console.error('Error in images API:', error);
    return new Response(JSON.stringify({ error: 'Failed to load images' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

