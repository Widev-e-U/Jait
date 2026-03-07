export interface ScreenShareLayoutState {
  showDesktopScreenShare: boolean
  showMobileScreenShare: boolean
  mobilePanelHeightClass: string
}

export function getScreenShareLayoutState({
  isMobile,
  showScreenShare,
  hasMessages,
}: {
  isMobile: boolean
  showScreenShare: boolean
  hasMessages: boolean
}): ScreenShareLayoutState {
  const showDesktopScreenShare = !isMobile && showScreenShare
  const showMobileScreenShare = isMobile && showScreenShare

  return {
    showDesktopScreenShare,
    showMobileScreenShare,
    mobilePanelHeightClass: hasMessages ? 'h-[42dvh] min-h-[220px]' : 'h-[50dvh] min-h-[260px]',
  }
}
