package dev.jait.mobile.wear;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class WearRequestStore {
    static final String STATE_PENDING = "pending";
    static final String STATE_ANSWERED = "answered";
    static final String STATE_DISMISSED = "dismissed";

    private static final String PREFS = "jait-wear-inbox";
    private static final String KEY_ENTRIES = "entries";
    private static final int MAX_ENTRIES = 12;

    static final class Entry {
        final String id;
        final String title;
        final String question;
        final String rawRequest;
        final String state;
        final long receivedAt;

        Entry(
            String id,
            String title,
            String question,
            String rawRequest,
            String state,
            long receivedAt
        ) {
            this.id = id;
            this.title = title;
            this.question = question;
            this.rawRequest = rawRequest;
            this.state = state;
            this.receivedAt = receivedAt;
        }

        boolean isPending() {
            return STATE_PENDING.equals(state);
        }
    }

    private WearRequestStore() {
    }

    static synchronized void save(Context context, JSONObject request) {
        JSONArray entries = upsert(readArray(context), request, System.currentTimeMillis());
        writeArray(context, entries);
    }

    static synchronized void markState(Context context, String requestId, String state) {
        if (requestId == null || requestId.isEmpty()) return;
        writeArray(context, setState(readArray(context), requestId, state));
    }

    static synchronized List<Entry> list(Context context) {
        JSONArray entries = readArray(context);
        List<Entry> result = new ArrayList<>();
        for (int index = 0; index < entries.length(); index++) {
            JSONObject entry = entries.optJSONObject(index);
            if (entry == null) continue;
            String id = entry.optString("id", "");
            String rawRequest = entry.optString("rawRequest", "");
            if (id.isEmpty() || rawRequest.isEmpty()) continue;
            result.add(new Entry(
                id,
                entry.optString("title", "Jait needs input"),
                entry.optString("question", "Open to view this request."),
                rawRequest,
                entry.optString("state", STATE_PENDING),
                entry.optLong("receivedAt", 0L)
            ));
        }
        return result;
    }

    static JSONArray upsert(JSONArray existing, JSONObject request, long receivedAt) {
        JSONArray result = new JSONArray();
        String requestId = request.optString("id", "");
        if (requestId.isEmpty()) return existing;

        JSONObject entry = new JSONObject();
        try {
            String question = "Open to view this request.";
            JSONArray questions = request.optJSONArray("questions");
            if (questions != null && questions.length() > 0) {
                JSONObject firstQuestion = questions.optJSONObject(0);
                if (firstQuestion != null) {
                    question = firstQuestion.optString("question", question);
                }
            }
            entry.put("id", requestId);
            entry.put("title", request.optString("title", "Jait needs input"));
            entry.put("question", question);
            entry.put("rawRequest", request.toString());
            entry.put("state", STATE_PENDING);
            entry.put("receivedAt", receivedAt);

            List<String> existingIds = new ArrayList<>();
            Map<String, JSONObject> entriesById = new LinkedHashMap<>();
            for (int index = 0; index < existing.length(); index++) {
                JSONObject current = existing.optJSONObject(index);
                if (current == null) continue;
                String currentId = current.optString("id", "");
                if (currentId.isEmpty()) continue;
                existingIds.add(currentId);
                entriesById.put(currentId, current);
            }
            entriesById.put(requestId, entry);
            for (String id : WearInboxOrder.withNewest(existingIds, requestId, MAX_ENTRIES)) {
                JSONObject orderedEntry = entriesById.get(id);
                if (orderedEntry != null) result.put(orderedEntry);
            }
        } catch (JSONException ignored) {
            return existing;
        }
        return result;
    }

    static JSONArray setState(JSONArray existing, String requestId, String state) {
        for (int index = 0; index < existing.length(); index++) {
            JSONObject entry = existing.optJSONObject(index);
            if (entry == null || !requestId.equals(entry.optString("id", ""))) continue;
            try {
                entry.put("state", state);
            } catch (JSONException ignored) {
            }
            break;
        }
        return existing;
    }

    private static JSONArray readArray(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String rawEntries = preferences.getString(KEY_ENTRIES, "[]");
        try {
            return new JSONArray(rawEntries == null ? "[]" : rawEntries);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private static void writeArray(Context context, JSONArray entries) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ENTRIES, entries.toString())
            .apply();
    }
}
