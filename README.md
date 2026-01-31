# aiwan-3d
🏯 爱晚亭几何 (Aiwan Geometry 3D)基于 Three.js 的沉浸式数学教育游戏：在游览古建筑中探索圆柱体的奥秘。✨ 点击这里在线体验 (Live Demo) ✨📖 项目简介 (Introduction)爱晚亭几何 是一个将中国传统建筑文化与小学/初中几何数学相结合的 Web 3D 教学应用。学生不再是枯燥地背诵公式，而是化身为一名游客，置身于数字孪生的爱晚亭场景中。通过寻找线索、制作道具、粉刷立柱等一系列游戏化任务，直观地理解圆柱体的表面积与体积推导过程。本项目完全基于 Web 标准开发，无需安装任何插件，打开浏览器即可运行。🚀 核心功能 (Features)1. 🚶 沉浸式漫步 (Stroll Mode)第一人称/上帝视角切换：支持自由视角的切换，既可以像小鸟一样俯瞰全景，也可以像游客一样身临其境。物理运动系统：支持 WASD 移动。按住 Shift 键加速奔跑。按下 K 键进行跳跃（带有重力模拟）。环境特效：包含 HDR 天空盒、PBR 材质渲染以及动态落叶粒子系统，营造唯美的古风氛围。2. 🧩 剧情化教学 (Story Mode)游戏分为三个核心幕次，引导学生循序渐进：第一幕：认识圆柱 —— 在复杂的建筑结构中寻找并辨认圆柱体结构（内柱），亲手制作圆柱形钥匙。第二幕：表面积探秘 —— 发现立柱油漆磨损，通过交互式网页（iframe）拆解礼盒，推导侧面积公式，并完成粉刷任务。第三幕：体积的奥秘 —— 学习“化圆为方”的割补法思想，利用交互实验推导体积公式，最终开启神秘宝箱。3. 📐 可视化互动课件 (Interactive Courseware)集成嵌入式 HTML5 互动课件，让抽象数学具象化：表面积原理：点击拆解 3D 礼盒，直观看到侧面展开为长方形的过程。体积原理：通过拖动滑块模拟“硬币堆叠”和“切分拼合”，验证 $V = Sh$。MathJax 渲染：支持 LaTeX 数学公式的美观显示。4. 🛠️ 建筑师工坊 (Workshop & Architect)建筑解构：支持对爱晚亭模型进行“爆炸拆解”和“X光透视”，清晰展示榫卯结构与内部构造。自由探索：完成所有课程并领取证书后，解锁自由模式，无限制探索场景。💻 技术栈 (Tech Stack)核心引擎: Three.js (r128+)模型加载: GLTFLoader + DRACOLoader (用于高压缩比模型解码)环境渲染: RGBELoader (加载 HDR 环境贴图)前端基础: HTML5, CSS3 (Flexbox/Grid), Vanilla JavaScript (ES6+)数学渲染: MathJax模型生成: 部分素材（如油漆桶）使用 Tripo3D AI 生成。📂 项目结构 (File Structure)Plaintextaiwan-3d/
├── index.html            # 游戏主入口，UI 界面定义
├── app.js                # 核心逻辑 (Three.js 场景, 剧情管理, 交互逻辑)
├── 表面积.html            # 嵌入式教学页：圆柱表面积
├── 小学圆柱体.html         # 嵌入式教学页：圆柱体积
├── style.css             # (集成在 index.html 或独立) 样式文件
├── aiwan_pavilion.glb    # 爱晚亭主体模型 (Draco 压缩)
├── my_prop.glb           # 交互道具模型 (钥匙/木块)
├── paint_bucket.glb      # 油漆桶模型
├── chest.glb             # 宝箱模型
├── tree.glb              # 植被模型
├── draco/                # Google Draco 解码器库
├── sky.hdr               # 高动态范围天空盒
└── ...                   # 其他纹理图片 (jpg/png)
🛠️ 如何运行 (How to Run)方法 1：在线访问 (推荐)本项目已部署在 GitHub Pages，直接访问即可：👉 点击进入爱晚亭几何世界方法 2：本地运行由于浏览器安全策略（CORS），直接双击打开 index.html 可能无法加载 3D 模型。请使用本地服务器运行。克隆项目：Bashgit clone https://github.com/Shrewdly/aiwan-3d.git
进入目录：Bashcd aiwan-3d
启动本地服务器：VS Code (推荐): 安装 "Live Server" 插件，右键 index.html 选择 "Open with Live Server"。Python: python -m http.server 8000Node.js: npx http-server🎮 操作指南 (Controls)按键 / 操作功能W / A / S / D前后左右移动Shift (按住)加速奔跑K跳跃鼠标左键点击交互 / 旋转视角 (上帝模式下)鼠标滚轮缩放视角🤝 贡献与致谢 (Credits)开发者: Shrewdly3D 模型: 部分模型素材来源于开源社区及 Tripo3D 生成。灵感来源: 长沙岳麓山爱晚亭建筑结构与人教版小学数学教材。💡 提示：如果遇到模型加载缓慢，请耐心等待，建议在 PC 端 Chrome 或 Edge 浏览器下访问以获得最佳体验。
