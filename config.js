// Optional: bake your put.io OAuth app's Client ID in here so the
// connect screen doesn't ask for it. Leave empty to enter it in the app.
export const CLIENT_ID = '9867';

// The app's version, shown at the bottom of Settings. Bump it with each release and tag the commit to match (git tag v1.0.0).
// ?demo opens a sample library of public-domain books, with no put.io account. See demo.js.
export const DEMO = new URLSearchParams(globalThis.location?.search).has('demo');

export const VERSION = '1.2.0';
