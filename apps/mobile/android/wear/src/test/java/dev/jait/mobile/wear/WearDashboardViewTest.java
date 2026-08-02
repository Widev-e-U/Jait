package dev.jait.mobile.wear;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class WearDashboardViewTest {
    @Test
    public void pageCountUsesTwoLargeCardsPerPage() {
        assertEquals(1, WearPagination.pageCount(0));
        assertEquals(1, WearPagination.pageCount(2));
        assertEquals(2, WearPagination.pageCount(3));
        assertEquals(3, WearPagination.pageCount(6));
    }

    @Test
    public void clampPageKeepsNavigationInsideAvailablePages() {
        assertEquals(0, WearPagination.clampPage(-1, 3));
        assertEquals(1, WearPagination.clampPage(1, 3));
        assertEquals(2, WearPagination.clampPage(8, 3));
    }

    @Test
    public void emptyListsAlwaysExposeOneStablePage() {
        assertEquals(0, WearPagination.clampPage(4, WearPagination.pageCount(0)));
    }
}
