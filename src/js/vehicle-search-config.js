'use strict';
// Web: JSON pored aplikacije. Android: zaseban HTTPS hosting (bez Firebase i APK baze).
const nativeVehicleApp = globalThis.Capacitor?.isNativePlatform?.() === true || ['localhost','127.0.0.1'].includes(location.hostname) && !!globalThis.Capacitor;
globalThis.VEHICLE_DATABASE_URL = nativeVehicleApp
  ? 'https://app.autodijagnostikalazarevic.rs/data/vehicles-database.json'
  : new URL('./data/vehicles-database.json', document.baseURI).href;
