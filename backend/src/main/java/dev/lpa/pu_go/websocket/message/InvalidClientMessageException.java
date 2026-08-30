package dev.lpa.pu_go.websocket.message;

public final class InvalidClientMessageException extends Exception {
    private final String code;

    public InvalidClientMessageException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() { return code; }
}
