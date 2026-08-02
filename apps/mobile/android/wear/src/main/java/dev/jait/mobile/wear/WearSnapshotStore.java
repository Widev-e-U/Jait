package dev.jait.mobile.wear;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class WearSnapshotStore {
    private static final String PREFS = "jait-wear-snapshot";
    private static final String KEY_SNAPSHOT = "snapshot";

    static final class Message {
        final String role;
        final String content;
        final String createdAt;

        Message(String role, String content, String createdAt) {
            this.role = role;
            this.content = content;
            this.createdAt = createdAt;
        }
    }

    static final class Chat {
        final String id;
        final String title;
        final String status;
        final String providerId;
        final String updatedAt;
        final List<Message> messages;

        Chat(
            String id,
            String title,
            String status,
            String providerId,
            String updatedAt,
            List<Message> messages
        ) {
            this.id = id;
            this.title = title;
            this.status = status;
            this.providerId = providerId;
            this.updatedAt = updatedAt;
            this.messages = messages;
        }
    }

    static final class Snapshot {
        final boolean connected;
        final String error;
        final long syncedAt;
        final int totalThreads;
        final int activeThreads;
        final int updatedToday;
        final List<Chat> chats;

        Snapshot(
            boolean connected,
            String error,
            long syncedAt,
            int totalThreads,
            int activeThreads,
            int updatedToday,
            List<Chat> chats
        ) {
            this.connected = connected;
            this.error = error;
            this.syncedAt = syncedAt;
            this.totalThreads = totalThreads;
            this.activeThreads = activeThreads;
            this.updatedToday = updatedToday;
            this.chats = chats;
        }

        static Snapshot empty() {
            return new Snapshot(false, "Sync from your phone", 0L, 0, 0, 0, new ArrayList<>());
        }
    }

    private WearSnapshotStore() {
    }

    static void save(Context context, String rawSnapshot) {
        try {
            new JSONObject(rawSnapshot);
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_SNAPSHOT, rawSnapshot)
                .apply();
        } catch (JSONException ignored) {
        }
    }

    static Snapshot read(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String rawSnapshot = preferences.getString(KEY_SNAPSHOT, "");
        if (rawSnapshot == null || rawSnapshot.isEmpty()) return Snapshot.empty();
        try {
            return parse(new JSONObject(rawSnapshot));
        } catch (JSONException ignored) {
            return Snapshot.empty();
        }
    }

    static Snapshot parse(JSONObject raw) {
        List<Chat> chats = new ArrayList<>();
        JSONArray rawChats = raw.optJSONArray("threads");
        if (rawChats != null) {
            for (int chatIndex = 0; chatIndex < rawChats.length(); chatIndex++) {
                JSONObject rawChat = rawChats.optJSONObject(chatIndex);
                if (rawChat == null) continue;
                List<Message> messages = new ArrayList<>();
                JSONArray rawMessages = rawChat.optJSONArray("messages");
                if (rawMessages != null) {
                    for (int messageIndex = 0; messageIndex < rawMessages.length(); messageIndex++) {
                        JSONObject rawMessage = rawMessages.optJSONObject(messageIndex);
                        if (rawMessage == null) continue;
                        String content = rawMessage.optString("content", "").trim();
                        if (content.isEmpty()) continue;
                        messages.add(new Message(
                            rawMessage.optString("role", ""),
                            content,
                            rawMessage.optString("createdAt", "")
                        ));
                    }
                }
                chats.add(new Chat(
                    rawChat.optString("id", ""),
                    rawChat.optString("title", "Untitled chat"),
                    rawChat.optString("status", "idle"),
                    rawChat.optString("providerId", "jait"),
                    rawChat.optString("updatedAt", ""),
                    messages
                ));
            }
        }
        return new Snapshot(
            raw.optBoolean("connected", false),
            raw.optString("error", ""),
            raw.optLong("syncedAt", 0L),
            raw.optInt("totalThreads", chats.size()),
            raw.optInt("activeThreads", 0),
            raw.optInt("updatedToday", 0),
            chats
        );
    }
}
