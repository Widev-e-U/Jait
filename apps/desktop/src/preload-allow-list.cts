const allowedIpcChannels = {
  invoke: [
    "desktop:get-info",
    "desktop:get-sources",
    "desktop:notify",
    "desktop:confirm-share",
    "desktop:pick-directory",
    "terminal:start",
    "desktop:browse-path",
    "desktop:get-roots",
    "desktop:fs-op",
  ],
  on: ["screen-share:start", "screen-share:stop", "gateway:event"],
};

module.exports = allowedIpcChannels;
