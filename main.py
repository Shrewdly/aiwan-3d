import http.server
import socketserver
import webbrowser
import os
import sys
import threading
import time
import socket
import mimetypes

# --- 1. 基础配置 ---
PORT = 8000

# 设定目录结构
# 获取 main.py 所在的文件夹路径（项目根目录）
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
# 设定 web 文件夹路径（前端页面所在位置）
WEB_DIR = os.path.join(ROOT_DIR, 'web')

# 确保 Python 能正确识别文件类型 (避免浏览器无法加载 3D 模型或 JS)
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('model/gltf-binary', '.glb')
mimetypes.add_type('text/css', '.css')

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    """
    自定义请求处理器：
    1. 默认服务 web/ 目录下的网页文件
    2. 特殊处理 .glb 模型请求，将其映射到根目录
    3. 禁用缓存，确保修改立即生效
    """
    def __init__(self, *args, **kwargs):
        # 初始化时，指定默认目录为 web 文件夹
        # (这样访问 http://localhost:8000/ 就会直接找 web/index.html)
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_GET(self):
        # --- 核心逻辑：模型文件映射 ---
        # 如果浏览器请求的是 .glb 3D模型文件
        if self.path.endswith('.glb'):
            # 临时将服务目录切换到 项目根目录 (因为模型放在外面)
            self.directory = ROOT_DIR
            super().do_GET()
            return
        
        # 对于其他文件 (html, css, js)，正常从 web/ 目录服务
        super().do_GET()

    def end_headers(self):
        # --- 开发优化：禁用浏览器缓存 ---
        # 这样你修改代码后，刷新浏览器就能立刻看到效果，不用清除缓存
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        # 允许跨域 (解决一些本地加载素材的安全限制)
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def get_local_ip():
    """获取本机在局域网中的 IP 地址"""
    try:
        # 建立一个 UDP 连接来探测真实的内网 IP (不会发送实际数据)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def open_browser():
    """启动后延迟打开浏览器，并打印共享信息"""
    time.sleep(1.5) # 等待服务器完全启动
    
    local_ip = get_local_ip()
    localhost_url = f"http://localhost:{PORT}/index.html"
    share_url = f"http://{local_ip}:{PORT}/index.html"
    
    print(f"\n{'='*60}")
    print(f"🚀 智绘几何 - 爱晚亭 3D 教学系统已启动！")
    print(f"{'='*60}")
    print(f"✅ 本机演示地址: {localhost_url}")
    print(f"📲 局域网共享地址: {share_url}")
    print(f"   (评委或同学连接同一 Wi-Fi 后，可用手机/平板直接访问此地址)")
    print(f"{'='*60}\n")
    print(f"⌨️  按 Ctrl+C 可以关闭服务器")

    webbrowser.open(localhost_url)

if __name__ == "__main__":
    # --- 启动前检查 ---
    model_path = os.path.join(ROOT_DIR, "aiwan_pavilion.glb")
    if not os.path.exists(model_path):
        print(f"\n⚠️  [严重警告] 未在根目录找到模型文件：aiwan_pavilion.glb")
        print(f"   请确保模型文件就在 {ROOT_DIR} 目录下，否则 3D 画面无法显示！\n")

    if not os.path.exists(WEB_DIR):
        print(f"\n⚠️  [错误] 未找到 web 文件夹！请确保 index.html 等文件放在 web 文件夹内。\n")
        sys.exit(1)

    # --- 启动服务器 ---
    # 允许端口重用，防止关闭后立即重启报错
    socketserver.TCPServer.allow_reuse_address = True
    
    try:
        with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
            # 在独立线程中打开浏览器，不阻塞服务器主循环
            threading.Thread(target=open_browser, daemon=True).start()
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 服务器已停止。")
    except OSError as e:
        print(f"\n❌ 启动失败：端口 {PORT} 被占用。请关闭其他占用该端口的程序 (如另一个 Python 窗口) 后重试。")