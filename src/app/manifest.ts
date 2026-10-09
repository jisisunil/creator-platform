import type { MetadataRoute } from 'next';

/** Web app manifest so the site is installable on phones (NFR-5). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Creator Platform',
    short_name: 'Creators',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3b3fa8',
    icons: [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
