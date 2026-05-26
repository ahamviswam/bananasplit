import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pickletab.app',
  appName: 'PickleTab',
  webDir: 'dist/public',

  // When running in the native Android WebView, all API calls
  // must go to the Railway backend (not a relative /api/... path).
  server: {
    // Allow the WebView to make requests to Railway
    androidScheme: 'https',
    // In production the app loads the bundled web assets.
    // During development you can uncomment the line below to
    // point the WebView at a live dev server:
    // url: 'http://10.0.2.2:5000',
    cleartext: false,
  },

  android: {
    // Target API 35 (Android 15) — required by Google Play from Aug 2025
    minSdkVersion: 24,      // Android 7.0+ — covers 99% of active devices
    targetSdkVersion: 35,
    buildToolsVersion: '35.0.0',
    // Allow the app to make HTTPS calls to Railway
    allowMixedContent: false,
    // Splash / status bar
    backgroundColor: '#7c3aed',
  },

  plugins: {
    // Use Capacitor's native HTTP plugin to bypass CORS issues in WebView
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
