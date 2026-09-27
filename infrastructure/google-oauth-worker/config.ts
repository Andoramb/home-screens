// Kept out of worker.ts: the Workers runtime treats every named export of
// the main module as an entrypoint and refuses to start on a plain value.

export const PHOTOS_CLIENT_ID =
  '529435319756-oejms0l610evvbed4mpljueobjtu91d9.apps.googleusercontent.com';

/** The page Google returns to after sign-in (website/src/app/connect/google). */
export const REDIRECT_URI = 'https://homescreens.dev/connect/google';
