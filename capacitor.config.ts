import type { CapacitorConfig } from '@capacitor/cli';

// Native iOS-App (Capacitor): derselbe Web-Code, verpackt als App.
// appId = Bundle Identifier im Apple-Developer-Konto – vor dem ersten TestFlight-Upload ggf. anpassen.
const config: CapacitorConfig = {
  appId: 'app.platzrunde.flugbuch',
  appName: 'Platzrunde',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#f6efe4',
  },
};

export default config;
