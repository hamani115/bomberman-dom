export function createSocket({ onOpen, onMessage, onClose, onError } = {}) {
  let socket = null;

  function connect() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";

    const url = `${protocol}://${window.location.host}/ws`;

    socket = new WebSocket(url);

    socket.addEventListener("open", () => {
      console.log("WebSocket connected");

      if (onOpen) {
        onOpen();
      }
    });

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);

      console.log("WebSocket message:", data);

      if (onMessage) {
        onMessage(data);
      }
    });

    socket.addEventListener("close", () => {
      console.log("WebSocket disconnected");

      if (onClose) {
        onClose();
      }
    });

    socket.addEventListener("error", (event) => {
      console.error("WebSocket error:", event);

      if (onError) {
        onError(event);
      }
    });
  }

  function send(data) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(data));
  }

  function disconnect() {
    if (!socket) {
      return;
    }

    socket.close();
    socket = null;
  }

  return {
    connect,
    send,
    disconnect,
  };
}
