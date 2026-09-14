package dev.jait.mobile;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** The HTTP operation completes only when the gateway has accepted the answer. */
final class QuestionSubmission {
    static void send(String gatewayUrl, String authToken, String requestId, String body, boolean cancelled) throws IOException {
        if (gatewayUrl == null || gatewayUrl.isEmpty() || authToken == null || authToken.isEmpty()) {
            throw new IOException("Open Jait on your phone to sign in");
        }
        String base = gatewayUrl.replaceAll("/+$", "");
        String action = cancelled ? "cancel" : "submit";
        HttpURLConnection connection = (HttpURLConnection) new URL(base + "/api/user-questions/requests/"
            + requestId + "/" + action).openConnection();
        try {
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(15000);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Authorization", "Bearer " + authToken);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                if (status == 401 || status == 403) throw new IOException("Sign in to Jait on your phone, then retry");
                if (status == 404) throw new IOException("This question is no longer pending");
                throw new IOException("Jait rejected the answer (HTTP " + status + ")");
            }
        } finally {
            connection.disconnect();
        }
    }
}
