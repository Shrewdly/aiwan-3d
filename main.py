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

# --- ⚙️ Coze 工作流配置区域 (请修改这里) ---
PORT = 8000

# 1. 填入你的 Coze 令牌
COZE_API_TOKEN = "pat_lpiUm6EZk8d3DZQ5ju7cNi0OtBYXZwywi58fZ8Wmesc3zNvgVYGYXXeh6yehrElY" 

# 2. 填入你的 Workflow ID (注意：这里现在叫 WORKFLOW_ID 了)
# 你的 ID: 7598567274862198836
COZE_WORKFLOW_ID = "7598567274862198836" 

# 3. 梯子设置 (Coze 国内版直连，无需梯子)
USE_PROXY = False 
PROXY_PORT = 7890 

# 🔥🔥🔥 核心修改：地址改为 Workflow 专用接口 🔥🔥🔥
COZE_API_URL = "https://api.coze.cn/v1/workflow/run"

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
                print(f"📡 发送给 Coze 工作流: {user_action}")

                # --- 1. 构造 Coze Workflow 请求格式 ---
                headers = {
                    "Authorization": f"Bearer {COZE_API_TOKEN}",
                    "Content-Type": "application/json"
                }
                
                # 🔥🔥🔥 关键修改：工作流的参数结构 🔥🔥🔥
                # 这里的 key 必须和你 Coze 编排页面里【开始节点】的变量名一致！
                # 你说你的变量名是 "input"，所以这里写 "input": user_action
                payload = {
                    "workflow_id": COZE_WORKFLOW_ID,
                    "parameters": {
                        "input": user_action 
                    }
                }

                # --- 2. 代理逻辑 ---
                proxies = {}
                if USE_PROXY:
                    proxy_url = f"http://127.0.0.1:{PROXY_PORT}"
                    proxies = { "http": proxy_url, "https": proxy_url }
                    print(f"🔄 使用代理: {proxy_url}")
                else:
                    print("🚀 直连 Coze 国内版 (无代理)")

                # --- 3. 发送请求 ---
                response = requests.post(
                    COZE_API_URL, 
                    json=payload, 
                    headers=headers, 
                    proxies=proxies,
                    verify=False,
                    timeout=60
                )
                
                # --- 4. 解析 Coze Workflow 的返回结果 ---
                if response.status_code == 200:
                    res_json = response.json()
                    ai_reply = "老师正在思考..."
                    
                    # Coze Workflow 成功返回 code: 0
                    if res_json.get('code') == 0:
                        # Workflow 的返回值通常在 data 字段里，它可能是一个 JSON 字符串
                        raw_data = res_json.get('data', "")
                        
                        # 尝试解析 data 里的内容
                        try:
                            # 如果 data 是字符串（JSON String），需要二次解析
                            if isinstance(raw_data, str):
                                parsed_data = json.loads(raw_data)
                            else:
                                parsed_data = raw_data
                            
                            # 尝试获取 output (如果你工作流结束节点输出叫 output)
                            # 或者直接把整个结果转成字符串
                            if isinstance(parsed_data, dict):
                                ai_reply = parsed_data.get('output', str(parsed_data))
                            else:
                                ai_reply = str(parsed_data)
                                
                        except:
                            # 如果解析失败，直接显示原始 data
                            ai_reply = str(raw_data)
                            
                    else:
                        print(f"Coze 业务报错: {res_json}")
                        ai_reply = f"工作流报错: {res_json.get('msg')}"

                    print(f"✅ Coze 回复: {ai_reply}")
                    self.send_json_response({"success": True, "message": ai_reply})
                
                else:
                    print(f"❌ HTTP 报错: {response.status_code} - {response.text}")
                    self.send_json_response({"success": True, "message": f"连接错误: {response.status_code}"})

            except Exception as e:
                print(f"❌ 服务器内部错误: {e}")
                self.send_json_response({"success": True, "message": f"Python 后端报错: {str(e)}"})
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
