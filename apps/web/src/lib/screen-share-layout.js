export function getScreenShareLayoutState({ isMobile, showScreenShare, hasMessages, }) {
    const showDesktopScreenShare = !isMobile && showScreenShare;
    const showMobileScreenShare = isMobile && showScreenShare;
    return {
        showDesktopScreenShare,
        showMobileScreenShare,
        mobilePanelHeightClass: hasMessages ? 'h-[42dvh] min-h-[220px]' : 'h-[50dvh] min-h-[260px]',
    };
}
//# sourceMappingURL=screen-share-layout.js.map