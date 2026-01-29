import os
import sys
import http.server
import socketserver
import json
import threading
import time
import webbrowser
import uuid
import glob
import requests
import urllib3
import asyncio
import edge_tts
import nest_asyncio
import mimetypes
import re 

# 1. 基础环境设置
nest_asyncio.apply()
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning) 
try:
    sys.stdout.reconfigure(encoding='utf-8') 
except:
    pass

# --- ⚙️ 配置区域 ---
PORT = 8000
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT_DIR, 'web')

# Coze 设置 
COZE_API_TOKEN = "pat_vkxYRA2AgZPZbUMQENVaCzcr9OumQYqtvCAOeGzzgb44k5l2UBj6zTEzjlPaC9hi"
COZE_WORKFLOW_ID = "7598567274862198836" 
COZE_API_URL = "https://api.coze.cn/v1/workflow/run"

USE_PROXY = False
PROXY_PORT = 7890

# --- 2. 注册 MIME 类型 ---
mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('model/gltf-binary', '.glb')
mimetypes.add_type('application/octet-stream', '.hdr')
mimetypes.add_type('audio/mpeg', '.mp3')
mimetypes.add_type('application/wasm', '.wasm')

class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_GET(self):
        if self.path == '/': 
            self.path = '/index.html'
        
        if self.path.endswith('favicon.ico'):
            self.send_response(204)
            super().end_headers() 
            return
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/chat':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                user_action = data.get('action', '')
                
                print(f"\n📡 收到前端指令: {user_action}")

                prompt_map = {
                    "welcome": "【系统事件】用户进入[漫步模式]。请热情欢迎，简单介绍爱晚亭（位于长沙岳麓山），并邀请用户四处逛逛。",
                    
                    # --- 第一幕：认识圆柱 ---
                    "act1_start": "【系统事件】用户开始了第一幕。请告诉用户：“爱晚亭的柱子里藏着数学的秘密！请寻找一根正在发蓝光的柱子，点击它！”",
                    "act1_pillar_found": "【系统事件】用户找到了机关柱子。请引导：“这根柱子有个圆形凹槽。我们需要做一个形状匹配的钥匙。快去旁边的工作台（红木桌子）看看有什么材料！”",
                    "act1_craft_success": "【系统事件】用户制作出了圆柱体。请讲解：“太棒了！把长方形卷在木棒上旋转一周，就变出了圆柱体！这就是‘面动成体’。快去用钥匙打开机关！”",
                    "act1_finish": "【系统事件】用户打开了机关。请总结：“机关打开了！恭喜完成第一课。准备好进入下一关了吗？”",

                    # --- 第二幕：表面积 ---
                    "act2_start": "【系统事件】进入第二幕。请语气焦急地说：“糟糕！柱子油漆磨损了。我们要重新粉刷！必须先根据图纸计算出立柱的侧面积，才能领取油漆。快点击柱子查看图纸！”",
                    "act2_guide_calc": "【系统事件】用户正在看图纸。请讲解：“侧面积 = 底面周长 × 高。图纸数据：底面周长 62.8 cm，高 300 cm。快算出结果输入计算器！”",
                    "act2_calc_correct": "【系统事件】计算正确（18840）。请夸奖：“算得真准！系统已发放红漆桶，快去工作台拿起来，把所有灰色的柱子刷回红色吧！”",
                    "act2_painting": "【系统事件】用户正在刷漆。请鼓励：“刷刷刷！爱晚亭要变新啦！”",
                    "act2_finish": "【系统事件】第二幕完成。请总结：“太棒了！柱子焕然一新。我们学会了侧面积计算。接下来我们要制作新的备用立柱，这需要计算体积哦！”",

                    # --- 🔥🔥🔥 新增：第三幕（体积） 🔥🔥🔥 ---
                    "act3_start": "【系统事件】进入第三幕。请发布任务：“如果要制作一根实心的木头柱子，需要多少木料呢？这涉及到‘体积’的计算。请点击任意一根柱子，我来演示一下如何把圆柱体转化为我们熟悉的长方体！”",
                    "act3_demo": "【系统事件】用户正在观看‘化圆为方’的演示。请讲解：“你看！如果我们把圆柱底面切成无数个小扇形，再拼起来，它就变成了一个近似的长方体！长方体的体积是底面积×高，所以圆柱的体积也是底面积×高（V=Sh）！”",
                    "act3_guide_calc": "【系统事件】演示完毕，弹出计算器。请出题：“现在来算算！已知立柱底面半径 r=10cm，高 h=300cm。圆周率取3.14。公式是 V = π × r² × h。快算出体积吧！”",
                    "act3_calc_correct": "【系统事件】计算正确（94200）。请激动的说：“完全正确！94200 立方厘米！你已经掌握了圆柱的一切奥秘。看，工作台上出现了一块标准木料，这是你的奖品！”",
                    "act3_finish": "【系统事件】全课程通关。请升华主题：“恭喜你！从认识形状，到计算表面积，再到计算体积，你已经是一位合格的‘爱晚亭小小建筑师’了！数学让古建筑更加稳固，也让我们的思维更加严密。下课啦！”",

                    # --- 常规 ---
                    "found_pillar": "【系统事件】用户点击了红色的柱子。",
                    "found_chest": "【系统事件】用户发现了宝箱。",
                    "stage_2": "【系统事件】用户切换到[建筑师模式]。请简要介绍爱晚亭结构。",
                    "stage_3": "【系统事件】用户切换到[几何工坊]。请发布找图形任务。",
                }
                final_input = prompt_map.get(user_action, user_action)
                
                print(f"💌 发送给 Coze: {final_input[:20]}...")

                headers = {
                    "Authorization": f"Bearer {COZE_API_TOKEN}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "workflow_id": COZE_WORKFLOW_ID,
                    "parameters": { "input": final_input }
                }

                proxies = {}
                if USE_PROXY:
                    proxy_url = f"http://127.0.0.1:{PROXY_PORT}"
                    proxies = {"http": proxy_url, "https": proxy_url}

                response = requests.post(
                    COZE_API_URL, 
                    json=payload, 
                    headers=headers, 
                    proxies=proxies, 
                    verify=False, 
                    timeout=60
                )

                display_text = "思考中..."
                audio_filename = None

                if response.status_code == 200:
                    res_json = response.json()
                    if res_json.get('code') == 0:
                        raw_data = res_json.get('data', "")
                        try:
                            parsed = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
                            raw_reply = parsed.get('output', str(parsed)) if isinstance(parsed, dict) else str(parsed)

                            if "|||" in raw_reply:
                                parts = raw_reply.split("|||")
                                display_text = parts[0].strip()
                                spoken_text = parts[1].strip()
                            else:
                                display_text = raw_reply
                                spoken_text = self.force_clean_text(raw_reply)

                            if spoken_text:
                                print(f"🔊 生成语音: {spoken_text[:10]}...")
                                self.cleanup_old_files()
                                audio_filename = self.generate_tts(spoken_text)

                        except Exception as e:
                            print(f"⚠️ 解析错误: {e}")
                            display_text = str(raw_data)
                    else:
                        print(f"❌ Coze 报错: {res_json.get('msg')}")
                        display_text = "AI 暂时掉线了。"
                else:
                    print(f"❌ 网络错误: {response.status_code}")
                    display_text = "网络连接失败。"

                self.send_json_response({
                    "success": True, 
                    "message": display_text, 
                    "audio": audio_filename
                })

            except Exception as e:
                print(f"❌ 后台报错: {e}")
                self.send_json_response({"success": False, "message": "系统错误"})
        else:
            self.send_error(404)

    def send_json_response(self, data):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        http.server.SimpleHTTPRequestHandler.end_headers(self)
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def generate_tts(self, text):
        try:
            unique_name = str(uuid.uuid4())[:8]
            filename = f"tts_{unique_name}.mp3"
            filepath = os.path.join(WEB_DIR, filename)
            async def _run():
                await edge_tts.Communicate(text, "zh-CN-XiaoxiaoNeural").save(filepath)
            asyncio.run(_run())
            return filename
        except Exception as e:
            print(f"❌ TTS 失败: {e}")
            return None
    
    def force_clean_text(self, text):
        text = re.sub(r'[\(\[\{\<（【].*?[\)\]\}\>）】]', '', text)
        text = re.sub(r'[\*\#\>\-\=]', '', text)
        return text.strip()

    def cleanup_old_files(self):
        try:
            files = glob.glob(os.path.join(WEB_DIR, "tts_*.mp3"))
            now = time.time()
            for f in files:
                if os.path.getmtime(f) < now - 60: 
                    try: os.remove(f)
                    except: pass
        except: pass

def open_browser():
    time.sleep(1.5)
    url = f"http://localhost:{PORT}"
    print(f"🌐 本地预览: {url}")
    try: webbrowser.open(url)
    except: pass

if __name__ == "__main__":
    try: os.chdir(os.path.dirname(os.path.abspath(__file__)))
    except: pass

    if not os.path.exists(WEB_DIR):
        print(f"❌ 错误: 找不到 '{WEB_DIR}' 文件夹！")
        input("按回车键退出...")
    else:
        threading.Thread(target=open_browser, daemon=True).start()
        print("-" * 40)
        print(f"🚀 服务器已启动，端口: {PORT}")
        print("✅ 可以在 Ngrok 中访问了！")
        print("-" * 40)

        try:
            with ThreadingTCPServer(("", PORT), CustomHandler) as httpd:
                httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 服务器已停止")
        except OSError:
            print(f"❌ 端口 {PORT} 被占用，请关闭旧的终端窗口！")
