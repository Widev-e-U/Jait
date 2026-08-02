package dev.jait.mobile.wear;

import static org.junit.Assert.assertEquals;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class WearRequestStoreTest {
    @Test
    public void newestRequestMovesToFrontWithoutDuplicating() {
        List<String> ordered = WearInboxOrder.withNewest(
            Arrays.asList("one", "two", "three", "one"),
            "two",
            12
        );

        assertEquals(Arrays.asList("two", "one", "three"), ordered);
    }

    @Test
    public void historyIsCappedAtTwelveRequests() {
        List<String> existing = new ArrayList<>();
        for (int index = 0; index < 15; index++) {
            existing.add("request-" + index);
        }

        List<String> ordered = WearInboxOrder.withNewest(existing, "new", 12);

        assertEquals(12, ordered.size());
        assertEquals("new", ordered.get(0));
        assertEquals("request-10", ordered.get(11));
    }

    @Test
    public void invalidIdsAreIgnored() {
        List<String> ordered = WearInboxOrder.withNewest(
            Arrays.asList("", "one", null, "one"),
            "new",
            12
        );

        assertEquals(Arrays.asList("new", "one"), ordered);
    }
}
