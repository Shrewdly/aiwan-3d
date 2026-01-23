import http.server
import socketserver
import webbrowser
import os
import threading
import time
import socket
import mimetypes
import json
import requests
import urllib3

# 禁用安全警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# --- ⚙️ 配置区域 ---
PORT = 8000
DIFY_API_KEY = "app-slk51YyxH6TzO1ThCfyDc7Yr" 
DIFY_API_URL = "https://api.dify.ai/v1/workflows/run" 

# ❗ 梯子端口 (Clash=7890, v2ray=10809)
PROXY_PORT = 7897
USE_PROXY = True 

# --- 基础配置 ---
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT_DIR, 'web')

mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('model/gltf-binary', '.glb')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/jpeg', '.jpg')
mimetypes.add_type('application/octet-stream', '.hdr')

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_GET(self):
        if self.path.endswith(('.glb', '.hdr', '.jpg', '.mp4')):
            if not os.path.exists(os.path.join(WEB_DIR, self.path.lstrip('/'))):
                self.directory = ROOT_DIR
                super().do_GET()
                return
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/chat':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                user_action = data.get('action', '')
                print(f"📡 前端请求: {user_action}")

                payload = {
                    "inputs": { "query": user_action },
                    "response_mode": "blocking",
                    "user": "student-01"
                }
                
                headers = { "Authorization": f"Bearer {DIFY_API_KEY}", "Content-Type": "application/json" }
                proxies = { "http": f"http://127.0.0.1:{PROXY_PORT}", "https": f"http://127.0.0.1:{PROXY_PORT}" } if USE_PROXY else {}

                print("⏳ 正在请求 Dify...")
                response = requests.post(DIFY_API_URL, json=payload, headers=headers, proxies=proxies, verify=False, timeout=30)
                
                if response.status_code == 200:
                    dify_data = response.json()
                    ai_reply = "（老师好像在发呆...）"
                    
                    # 🔥🔥🔥 核心修改：暴力提取回复内容 🔥🔥🔥
                    if dify_data.get('data', {}).get('status') == 'succeeded':
                        outputs = dify_data.get('data', {}).get('outputs', {})
                        
                        if outputs:
                            # 1. 尝试找 text 字段
                            if 'text' in outputs:
                                ai_reply = outputs['text']
                            # 2. 尝试找 answer 字段
                            elif 'answer' in outputs:
                                ai_reply = outputs['answer']
                            # 3. 如果都没有，直接取第一个值（不管叫什么名字）
                            else:
                                first_value = next(iter(outputs.values()))
                                ai_reply = str(first_value)
                        else:
                            ai_reply = "Dify 运行成功但没有输出内容，请检查工作流的‘结束’节点。"
                    else:
                        print(f"Workflow 状态异常: {dify_data}")
                    
                    print(f"✅ 后端获取成功: {ai_reply}") # 这一步你在控制台看到了
                    
                    # 🔥🔥🔥 关键：把内容打包发回给前端 🔥🔥🔥
                    self.send_json_response({"success": True, "message": ai_reply})
                
                else:
                    print(f"❌ Dify 报错: {response.status_code} - {response.text}")
                    self.send_json_response({"success": True, "message": f"连接错误: {response.status_code}"})

            except Exception as e:
                print(f"❌ 服务器错误: {e}")
                self.send_json_response({"success": True, "message": "Python 后端处理出错"})
        else:
            self.send_error(404)

    def send_json_response(self, data):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except:
        return "127.0.0.1"

def open_browser():
    time.sleep(1.5)
    print(f"\n🚀 启动成功！访问地址: http://localhost:{PORT}/index.html")
    webbrowser.open(f"http://localhost:{PORT}/index.html")

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
            threading.Thread(target=open_browser, daemon=True).start()
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 已停止")
