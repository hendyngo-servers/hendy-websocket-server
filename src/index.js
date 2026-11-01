// ================= 1. DURABLE OBJECT CLASS =================
// Đảm nhiệm việc lưu trữ các kết nối WebSocket và Broadcast dữ liệu
export class MatchmakingRoom {
  constructor(state, env) {
    this.state = state;
    this.sessions = []; // Lưu trữ danh sách người dùng đang kết nối
  }

  async fetch(request) {
    // Kiểm tra header Upgrade của WebSocket
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Dự kiến kết nối WebSocket", { status: 426 });
    }

    // Tạo cặp WebSocket: client (trả về cho user) và server (giữ lại ở DO)
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Chấp nhận kết nối phía server
    server.accept();
    
    // Lưu trữ session mới
    const session = { webSocket: server };
    this.sessions.push(session);

    // Lắng nghe tin nhắn từ Client
    server.addEventListener("message", async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        
        // Broadcast tin nhắn tới TẤT CẢ các client khác đang kết nối
        this.broadcast(`🔄 Đồng bộ từ Server: ${JSON.stringify(data)}`);
        
      } catch (err) {
        server.send(JSON.stringify({ error: "Dữ liệu không hợp lệ" }));
      }
    });

    // Xử lý khi Client ngắt kết nối
    server.addEventListener("close", () => {
      this.sessions = this.sessions.filter((s) => s !== session);
    });

    // Xử lý lỗi
    server.addEventListener("error", () => {
      this.sessions = this.sessions.filter((s) => s !== session);
    });

    // Trả về phía client connection với mã trạng thái 101 Switching Protocols
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // Hàm tiện ích để gửi tin nhắn cho mọi người trong phòng
  broadcast(message) {
    let disconnected = [];
    this.sessions.forEach((session) => {
      try {
        session.webSocket.send(message);
      } catch (e) {
        disconnected.push(session);
      }
    });
    // Dọn dẹp các kết nối đã chết
    this.sessions = this.sessions.filter(s => !disconnected.includes(s));
  }
}

// ================= 2. WORKER FETCH HANDLER =================
// Đóng vai trò là Router, chuyển hướng request ws:// tới Durable Object
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Bắt route WebSocket (VD: wss://worker.dev/ws/matchmaking)
    if (url.pathname.startsWith("/ws/")) {
      // Sử dụng một ID cố định cho "Phòng chung" hoặc tạo ID động dựa trên URL
      const roomId = env.MATCHMAKING_ROOM.idFromName("global-room");
      const roomObject = env.MATCHMAKING_ROOM.get(roomId);
      
      // Chuyển tiếp Request vào Durable Object
      return roomObject.fetch(request);
    }

    // Trả về Frontend tĩnh (Phục vụ file HTML nếu tích hợp Cloudflare Pages)
    return new Response("Hendy Cybertech WebSocket Server đang hoạt động!", { status: 200 });
  }
};
