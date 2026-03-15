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
    "desktop:detect-providers",
    "desktop:provider-op",
    "desktop:tool-op",
    "window:minimize",
    "window:maximize",
    "window:close",
    "window:is-maximized",
    "window:set-title-bar-overlay",
    "desktop:get-setting",
    "desktop:set-setting",
  ],
  on: ["screen-share:start", "screen-share:stop", "gateway:event", "window:maximized-change"],
};

module.exports = allowedIpcChannels;
