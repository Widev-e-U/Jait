package dev.jait.mobile;

import static org.junit.Assert.*;
import java.net.ServerSocket;
import java.net.Socket;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class QuestionSubmissionTest {
    private static final class Server implements AutoCloseable {
        final ServerSocket socket = new ServerSocket(0, 1, java.net.InetAddress.getLoopbackAddress());
        volatile String request;
        volatile Exception error;
        final Thread worker;
        Server(int status) throws IOException {
            worker = new Thread(() -> {
                try (Socket client = socket.accept()) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
                    String line = reader.readLine();
                    String first = line;
                    int length = 0;
                    while (!(line = reader.readLine()).isEmpty()) {
                        if (line.toLowerCase().startsWith("content-length:")) length = Integer.parseInt(line.substring(15).trim());
                    }
                    char[] body = new char[length];
                    for (int n = 0; n < length;) { int count = reader.read(body, n, length - n); if (count < 0) break; n += count; }
                    request = first + " " + new String(body);
                    client.getOutputStream().write(("HTTP/1.1 " + status + " Response\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                } catch (Exception e) { error = e; }
            });
            worker.start();
        }
        String url() { return "http://127.0.0.1:" + socket.getLocalPort(); }
        public void close() throws Exception { socket.close(); worker.join(2000); if (error != null) throw error; }
    }
    @Test public void rejectedGatewayAnswerMustNotLookSuccessful() throws Exception {
        try (Server server = new Server(401)) {
            assertThrows(IOException.class, () -> QuestionSubmission.send(server.url(), "expired", "request", "{}", false));
        }
    }
    @Test public void acceptedAnswerUsesExactBodyAndNormalizedPath() throws Exception {
        try (Server server = new Server(200)) {
            QuestionSubmission.send(server.url() + "/", "token", "r", "{\"answers\":{}}", false);
            assertEquals("POST /api/user-questions/requests/r/submit HTTP/1.1 {\"answers\":{}}", server.request);
        }
    }
}
