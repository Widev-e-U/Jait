package dev.jait.mobile.wear;

final class WearPagination {
    static final int PAGE_SIZE = 2;

    private WearPagination() {
    }

    static int pageCount(int itemCount) {
        return Math.max(1, (itemCount + PAGE_SIZE - 1) / PAGE_SIZE);
    }

    static int clampPage(int page, int pageCount) {
        return Math.max(0, Math.min(page, Math.max(1, pageCount) - 1));
    }
}
