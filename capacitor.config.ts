
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cagrismk.cagrinas.test',
  appName: 'Cagri NAS Test',
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


