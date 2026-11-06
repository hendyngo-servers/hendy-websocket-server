const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const port = process.env.PORT || 3000;

// Route HTTP cơ bản để Render nhận diện dịch vụ web đang hoạt động
app.get('/', (req, res) => {
  res.send('WebSocket Server đang hoạt động và chống ngủ đông!');
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ==========================================
// PHẦN 1: WEBSOCKET SERVER VỚI CƠ CHẾ HEARTBEAT
// ==========================================
wss.on('connection', (ws) => {
  ws.isAlive = true;
  
  // Nhận pong từ client để xác nhận kết nối còn sống
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (msg) => {
    console.log('Server nhận dữ liệu:', msg.toString());
  });
});

// Ping tất cả các client mỗi 30 giây để tránh bị Load Balancer ngắt kết nối do rảnh rỗi (idle timeout)
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

// ==========================================
// PHẦN 2: SELF-CLIENT ĐỂ CHỐNG NGỦ ĐÔNG RENDER
// ==========================================
function startKeepAliveClient() {
  // Render tự động cấp biến môi trường RENDER_EXTERNAL_URL (vd: https://app-cua-ban.onrender.com)
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL 
    ? process.env.RENDER_EXTERNAL_URL.replace('https://', 'wss://').replace('http://', 'ws://')
    : `ws://localhost:${port}`;

  let wsClient;

  function connect() {
    console.log(`Self-Client đang kết nối tới: ${RENDER_URL}`);
    wsClient = new WebSocket(RENDER_URL);

    wsClient.on('open', () => {
      console.log('Self-Client đã kết nối thành công!');
      
      // Gửi tín hiệu mỗi 10 phút (600,000 ms) để tạo luồng dữ liệu (traffic)
      // Điều này ngăn bộ đếm 15 phút idle của Render kích hoạt ngủ đông
      setInterval(() => {
        if (wsClient.readyState === WebSocket.OPEN) {
          wsClient.send('keep-awake-signal');
          console.log('Self-Client: Đã gửi tín hiệu duy trì kết nối');
        }
      }, 600000); 
    });

    // Tự động phản hồi lại gói ping từ Server để giữ kết nối
    wsClient.on('ping', () => {
      wsClient.pong();
    });

    // Nếu bị ngắt (do mạng, khởi động lại), tự động kết nối lại sau 5 giây
    wsClient.on('close', () => {
      console.log('Self-Client mất kết nối. Đang thử lại trong 5s...');
      setTimeout(connect, 5000);
    });
    
    wsClient.on('error', (err) => {
      console.error('Lỗi Self-Client:', err.message);
      wsClient.close();
    });
  }

  connect();
}

// ==========================================
// KHỞI CHẠY HỆ THỐNG
// ==========================================
server.listen(port, () => {
  console.log(`Server khởi chạy thành công tại port ${port}`);
  // Đợi server khởi động xong (1 giây) mới bật Self-Client
  setTimeout(startKeepAliveClient, 1000);
});
