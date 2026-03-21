"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
        "desktop:open-preview-window",
    ],
    on: ["screen-share:start", "screen-share:stop", "gateway:event"],
};
module.exports = allowedIpcChannels;
//# sourceMappingURL=preload-allow-list.cjs.map
