// GitHub Pages hosts files only. The local server remains available in dev/build.
export const IS_STATIC_HOSTING = import.meta.env.MODE === 'pages';

export const SOURCE_DOWNLOAD_URL = IS_STATIC_HOSTING
  ? 'https://github.com/prod-xeinty/TKP-project/archive/refs/heads/main.zip'
  : '/api/download-source-zip';
