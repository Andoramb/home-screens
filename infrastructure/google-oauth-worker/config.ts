// Kept out of worker.ts: the Workers runtime treats every named export of
// the main module as an entrypoint and refuses to start on a plain value.

export const PHOTOS_CLIENT_ID =
  '529435319756-oejms0l610evvbed4mpljueobjtu91d9.apps.googleusercontent.com';

export const CALENDAR_CLIENT_ID =
  '529435319756-hgrtgtbc3va1tccdgio9b57a4fp6kl7c.apps.googleusercontent.com';

/** The page Google returns to after sign-in (website/src/app/connect/google). */
export const REDIRECT_URI = 'https://homescreens.dev/connect/google';

/** The grant a Calendar hub polls with while the family types its short code. */
export const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
