
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cagrismk.cagrinas',
  appName: '\u00c7a\u011fr\u0131 NAS',
  webDir: 'dist',
  server: {
    url: 'https://test-nas.cagrismk.com',
    allowNavigation: [
      'test-nas.cagrismk.com',
      'cagrismk.cloudflareaccess.com'
    ]
  }
};

export default config;

