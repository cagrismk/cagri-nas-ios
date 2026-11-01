
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cagrismk.cagrinas',
  appName: '\u00c7a\u011fr\u0131 NAS',
  webDir: 'dist',
  server: {
    url: 'https://cagri-nas.cagrismk.com',
    allowNavigation: [
      'cagri-nas.cagrismk.com',
      'cagrismk.cloudflareaccess.com'
    ]
  }
};

export default config;


