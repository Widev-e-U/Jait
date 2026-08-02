package dev.jait.mobile.wear;

import java.util.ArrayList;
import java.util.List;

final class WearInboxOrder {
    private WearInboxOrder() {
    }

    static List<String> withNewest(List<String> existingIds, String newestId, int maximumSize) {
        List<String> ordered = new ArrayList<>();
        if (newestId != null && !newestId.isEmpty() && maximumSize > 0) {
            ordered.add(newestId);
        }
        for (String existingId : existingIds) {
            if (
                existingId == null
                    || existingId.isEmpty()
                    || existingId.equals(newestId)
                    || ordered.contains(existingId)
            ) {
                continue;
            }
            if (ordered.size() >= maximumSize) break;
            ordered.add(existingId);
        }
        return ordered;
    }
}
