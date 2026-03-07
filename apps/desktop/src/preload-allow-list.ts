export const allowedIpcChannels = {
  invoke: [
    "desktop:get-info",
    "desktop:get-sources",
    "desktop:notify",
    "desktop:confirm-share",
    "desktop:pick-directory",
    "terminal:start",
  ],
  on: ["screen-share:start", "screen-share:stop", "gateway:event"],
} as const;
