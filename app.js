import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ==========================================
// 1. 全局变量定义 (保留所有原有变量)
// ==========================================
let scene, camera, renderer, controls;
let mainModel = null;
let modelParts = []; 
let leavesSystem, leavesActive = false;
let interactMode = 'game'; 
let terrainMesh = null;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let isFirstPersonMode = false; 
let isDragging = false;
let mouseDownPos = new THREE.Vector2(); 
let previousMousePosition = { x: 0, y: 0 };

// 🔥 新增：按键状态增加 shift 和 space
const keyState = { w: false, a: false, s: false, d: false, shift: false, k: false };

// 🔥 新增：跳跃物理变量
let playerVelocityY = 0;   // 垂直速度
const GRAVITY = 0.035;     // 重力加速度
const JUMP_FORCE = 0.1;   // 跳跃力度
let currentAudioObj = null; 

// ==========================================
// 2. 加载管理器 (统一管理资源)
// ==========================================
const manager = new THREE.LoadingManager();

manager.onLoad = function ( ) {
    console.log( '✅ 所有资源加载完毕！' );
    const mask = document.getElementById('loading-mask');
    if(mask) mask.style.display = 'none'; // 关闭遮罩
};

manager.onError = function ( url ) {
    console.log( '❌ 加载失败: ' + url );
    // 容错：不卡死页面，仅提示
    const mask = document.getElementById('loading-mask');
    if(mask) {
        mask.innerHTML = "<span style='color:yellow'>⚠️ 资源加载异常，3秒后自动进入...</span>";
        setTimeout(() => { mask.style.display = 'none'; }, 3000);
    }
};

// ==========================================
// 3. 剧情逻辑管理器 (修复提交逻辑，增加Act3)
// ==========================================
class StoryManager {
    constructor() {
        this.currentAct = 0;
        this.step = 0; 
        this.targetPillar = null;
        this.craftingItems = []; 
        this.paintedPillarsCount = 0; 
        this.hasPaint = false;
        this.volumeDemoItems = []; // 存放第三幕演示物体
    }

    // --- 第一幕：认识圆柱 ---
    startStory() {
        console.log("🎬 第一幕启动");
        this.currentAct = 1;
        this.step = 1;
        window.setCameraView('person');
        this.updateUI("👀 任务：寻找发出蓝光的立柱并点击它！");
        
        // 🔥🔥🔥 优化核心：使用“轮询”机制，直到找到柱子为止 🔥🔥🔥
        // 之前只找一次，如果卡顿了没加载完就会失败。现在每 0.5 秒找一次。
        const checkTimer = setInterval(() => {
            const pillars = modelParts.filter(p => p.userData.isPillar);
            
            if (pillars.length > 0) {
                console.log(`🔦 终于加载好了！锁定 ${pillars.length} 根内柱，开始发光。`);
                clearInterval(checkTimer); // 找到了，停止寻找
                
                pillars.forEach(p => {
                    p.userData.isTarget = true;
                    
                    // ⚡️ 额外保险：克隆材质，确保每根柱子都能独立发光，不受干扰
                    if (!p.userData.hasClonedMaterial) {
                        p.material = p.material.clone();
                        p.userData.hasClonedMaterial = true;
                    }
                    
                    this.highlightObject(p, 0x0000FF);
                });
            } else {
                console.log("⏳ 正在等待柱子模型加载...");
            }
        }, 1500); // 每 500 毫秒检查一次

        window.askTeacher('act1_start');
    }

    // --- 第二幕：表面积 (刷漆) ---
    startAct2() {
        console.log("🎬 第二幕启动");
        this.currentAct = 2;
        this.step = 1; 
        this.paintedPillarsCount = 0;

        // 让所有柱子变旧（灰色）
        modelParts.forEach(p => {
            if(p.userData.isPillar) {
                p.material.color.setHex(0x888888); 
                p.userData.isWorn = true; 
            }
        });

        this.updateUI("⚠️ 警报：立柱油漆磨损！<br>任务：点击任意柱子查看修缮图纸。");
        window.askTeacher('act2_start');
    }

    // --- 第三幕：体积 (化圆为方) ---
    startAct3() {
        console.log("🎬 第三幕启动");
        this.currentAct = 3;
        this.step = 1; 
        
        this.updateUI("🌲 任务：点击立柱，学习计算体积！");
        window.askTeacher('act3_start');
        
        // 重新高亮一根柱子作为教学对象
        if (this.targetPillar) {
            this.targetPillar.userData.isTarget = true;
            this.highlightObject(this.targetPillar, 0x00FFFF); // 青色高亮
        }
    }

    // --- 统一交互处理 ---
    handleInteraction(obj) {
        console.log(`🖱️ 点击物体: ${obj.userData.name || '未知部件'}, 状态: Act=${this.currentAct}, Step=${this.step}`);

        // [Act 1] 找柱子 -> 做钥匙 -> 开机关
        if (this.currentAct === 1) {
            // 👉 第一步：点击发蓝光的柱子
            if (this.step === 1 && obj.userData.isTarget) {
                this.step = 2;
                
                // 1. 记录你选中的这根柱子
                this.targetPillar = obj;

                // 2. 关闭所有柱子的点击判定（防止去工作台途中乱点）
                modelParts.forEach(p => {
                    if (p.userData.isPillar) {
                        this.clearHighlight(p);
                        p.userData.isTarget = false; 
                    }
                });

                // 3. 发布新任务
                this.updateUI("🔨 任务：前往工作台(红桌子)，点击它制作钥匙！");
                window.askTeacher('act1_pillar_found');
                
                // 4. 高亮工作台
                const table = scene.children.find(c => c.userData.isWorktable);
                if(table) this.highlightObject(table, 0xFFD700); 
                
                // 5. 生成原材料
                this.spawnCraftingMaterials(table ? table.position : new THREE.Vector3(10,1,10));
            }
            // 👉 第二步：点击工作台/原材料制作钥匙
            else if (this.step === 2 && (obj.userData.isWorktable || obj.userData.isCraftItem)) {
                this.step = 3;
                
                // 1. 取消工作台高亮
                const table = scene.children.find(c => c.userData.isWorktable);
                if(table) this.clearHighlight(table);
                
                // 2. 播放制作动画
                this.playCraftingAnimation(); 
                
                // 3. 更新UI
                this.updateUI("🔑 任务：拿着圆柱钥匙，去打开刚才那根柱子！");
                window.askTeacher('act1_craft_success');
                
                // 🔥🔥🔥 核心修复点：重新激活柱子的点击判定 🔥🔥🔥
                if(this.targetPillar) {
                    this.highlightObject(this.targetPillar, 0x00FF00); // 亮绿光
                    this.targetPillar.userData.isTarget = true;        // 👈 必须加这一句！否则点它没反应
                    console.log("🔓 柱子已重新激活，等待开启...");
                }
            }
            // 👉 第三步：拿着钥匙点击柱子 -> 进入第二幕
            else if (this.step === 3 && obj.userData.isTarget) {
                this.step = 4;
                this.clearHighlight(this.targetPillar);
                this.updateUI("🎉 机关解锁！即将进入第二关...");
                window.askTeacher('act1_finish');
                
                // 5秒后自动进入下一关
                setTimeout(() => this.startAct2(), 5000);
            }
        }
        // [Act 2] 表面积教学
        else if (this.currentAct === 2) {
            if (this.step === 1 && obj.userData.isPillar) {
                this.step = 2; 
                
                // 🔥🔥🔥 修改点：先打开[表面积.html]，关闭后再显示计算器 🔥🔥🔥
                window.showToast("📜 正在展开修缮图纸...");
                window.askTeacher('act2_guide_calc'); // 老师语音引导
                
                setTimeout(() => {
                    window.openLearning('表面积.html', () => {
                        // 回调函数：用户学完关闭窗口后执行这里
                        this.showCalcPanel('act2'); 
                        window.showToast("🧠 学会了吗？来算算吧！");
                    });
                }, 1000); // 延迟1秒打开，让用户先听到老师说话
            }
            else if (this.step === 3 && obj.userData.isPaintBucket) {
                this.step = 4;
                this.hasPaint = true;
                scene.remove(obj); 
                this.updateUI("🖌️ 任务：点击灰色柱子进行粉刷 (0/4)");
                window.showToast("已装备：红漆桶");
            }
            else if (this.step === 4 && obj.userData.isPillar && obj.userData.isWorn) {
                // 刷漆特效
                obj.material.color.setHex(0xFFFFFF); // 闪白
                setTimeout(() => {
                    obj.material.color.setHex(0xFF0000); // 变红
                    if(obj.userData.originalEmissive) obj.material.emissive.setHex(obj.userData.originalEmissive);
                }, 200);
                obj.userData.isWorn = false; 
                this.paintedPillarsCount++;
                this.updateUI(`🖌️ 正在粉刷... (${this.paintedPillarsCount}/4)`);
                window.askTeacher('act2_painting');

                if (this.paintedPillarsCount >= 4) {
                    setTimeout(() => {
                        this.updateUI("🏆 第二幕通关！准备进入第三关...");
                        window.askTeacher('act2_finish');
                        setTimeout(() => this.startAct3(), 5000);
                    }, 1000);
                }
            }
        }
        // [Act 3] 点柱子演示 -> 算体积 -> 拿木料 -> 完结
        else if (this.currentAct === 3) {
            if (this.step === 1 && obj.userData.isPillar) {
                this.step = 2;
                this.clearHighlight(obj);
                
                // 🔥🔥🔥 修改点：先打开[小学圆柱体.html]，关闭后再播放动画和计算 🔥🔥🔥
                window.showToast("🧪 进入体积实验室...");
                window.askTeacher('act3_demo'); // 老师语音引导
                
                setTimeout(() => {
                    window.openLearning('小学圆柱体.html', () => {
                        // 回调函数：用户关闭窗口后
                        // 1. 播放桌上的演示动画 (作为复习)
                        this.playVolumeDemoOnTable();
                        
                        // 2. 延迟一点弹出计算器
                        setTimeout(() => {
                            this.showCalcPanel('act3'); 
                            window.askTeacher('act3_guide_calc');
                        }, 2000);
                    });
                }, 1000);
            }
        }
    }

    // 🔥 计算器提交逻辑 (覆盖 HTML 的判断) 🔥
    onCalcSubmit(val) {
        console.log("收到计算结果:", val, "当前关卡:", this.currentAct); // 🔥 调试日志

        // 第二幕答案：62.8 * 300 = 18840
        if (this.currentAct === 2 && Math.abs(val - 18840) < 1) {
            document.getElementById('calc-panel').style.display = 'none';
            this.step = 3;
            this.updateUI("🎨 计算正确！去工作台拿油漆！");
            window.askTeacher('act2_calc_correct');
            
            // 🔥 生成油漆桶
            this.spawnPaintBucket();
        }
        // 第三幕答案：3.14 * 100 * 300 = 94200
        // 在 onCalcSubmit 函数中找到这一块：
        
        else if (this.currentAct === 3 && Math.abs(val - 94200) < 10) {
            document.getElementById('calc-panel').style.display = 'none';
            this.step = 3;
            this.updateUI("🏆 全课通关！开启神秘宝箱..."); // 更新提示文案
            window.askTeacher('act3_calc_correct');
        
            this.playChestOpeningAnim();
        }
        else {
            const fb = document.getElementById('calc-feedback');
            if(fb) fb.innerText = "❌ 算错啦，请检查公式和数据！";
        }
    }
    // --- 剧情动画与道具生成 ---

    // 🔥 修复版：使用你的自定义模型 my_prop.glb 进行体积演示
    playVolumeDemoOnTable() {
        // 1. 找到工作台位置
        const table = scene.children.find(c => c.userData.isWorktable);
        const pos = table ? table.position.clone() : new THREE.Vector3(10, 0, 10);
        
        // 2. 🔥 位置调整：放在桌面上 (之前的 1.5 太高了，改为 0.6 左右)
        // 你的桌子在 y=0.4，加上模型高度一半，大约 0.6~0.8 比较合适
        pos.y += 0.6; 

        // 3. 使用 Loader 加载你的模型，而不是画一个几何体
        const loader = new GLTFLoader(manager);
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('./draco/');
        loader.setDRACOLoader(dracoLoader);

        loader.load('my_prop.glb', (gltf) => {
            const cyl = gltf.scene;
            
            // ⚠️ 保持和 spawnWoodBlock 一样的缩放比例
            cyl.scale.set(0.3, 0.3, 0.3);
            cyl.position.copy(pos);
            
            // 稍微让它亮一点，表示它是演示对象
            cyl.traverse(c => {
                if(c.isMesh) {
                    c.material.emissive = new THREE.Color(0x444444);
                    c.material.transparent = true;
                    c.material.opacity = 0.9;
                }
            });

            scene.add(cyl);

            // 4. 动画逻辑：2秒后模型消失，显示长方体 (表示转化)
            setTimeout(() => {
                scene.remove(cyl);
                
                // 生成一个等体积的长方体 (这里用代码画一个近似的橙色方块)
                // 尺寸设为 0.5 x 1.0 x 0.5，尽量接近你的道具大小
                const geoBox = new THREE.BoxGeometry(0.5, 1.0, 0.5); 
                const matBox = new THREE.MeshStandardMaterial({
                    color: 0xFFA500, 
                    transparent: true, 
                    opacity: 0.8
                });
                const box = new THREE.Mesh(geoBox, matBox);
                
                box.position.copy(pos);
                scene.add(box);
                
                if(window.showToast) window.showToast("✨ 看！圆柱体变成了长方体 (V=Sh)");
                this.volumeDemoItems.push(box);
                
                dracoLoader.dispose();
            }, 2000);

        }, undefined, (err) => {
            console.error("❌ 演示模型加载失败:", err);
        });
    }

    // 🔥 替换版：加载自定义道具 my_prop.glb
    spawnWoodBlock() {
        const table = scene.children.find(c => c.userData.isWorktable);
        const pos = table ? table.position.clone() : new THREE.Vector3(10,0,10);
        
        // 往左偏移
        pos.x -= 0.4; 
        // 高度调整
        pos.y += 0.8; 

        const loader = new GLTFLoader(manager);
        
        // 🔥🔥🔥 新增：Draco 解码器配置 🔥🔥🔥
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('./draco/'); // 使用本地 draco 文件夹
        loader.setDRACOLoader(dracoLoader);
        
        loader.load('my_prop.glb', (gltf) => { 
            const block = gltf.scene;
            block.position.copy(pos);
            
            // ⚠️ 记得调整缩放
            block.scale.set(0.3, 0.7, 0.3); 

            scene.add(block);
            
            // 浮动动画
            let dy = 0;
            const floatAnim = () => {
                dy += 0.05;
                block.position.y = pos.y + Math.sin(dy) * 0.1;
                block.rotation.y += 0.01;
                requestAnimationFrame(floatAnim);
            }
            floatAnim();
            
            console.log("✅ 道具(my_prop.glb) [Draco] 加载成功");
            
            // 释放解码器内存
            dracoLoader.dispose();
        }, undefined, (err) => {
            console.error("❌ 道具加载失败:", err);
        });
    }

    // 🔥 终极修复版：宝箱开启仪式 (支持直接传入宝箱对象)
    playChestOpeningAnim(clickedObject = null) {
        try {
            console.log("🎁 启动开箱程序...");

            // --- 🧹 1. 暴力清场 ---
            this.volumeDemoItems.forEach(i => scene.remove(i));
            this.volumeDemoItems = [];
            
            if (this.craftingResult) {
                scene.remove(this.craftingResult);
                this.craftingResult = null;
            }
            const paint = scene.children.find(c => c.userData.isPaintBucket);
            if (paint) scene.remove(paint);

            // --- 🔍 2. 寻找宝箱 (双重保险) ---
            let chest = null;
            
            // 方法A：尝试通过标签找
            chest = scene.children.find(c => c.userData.isChestRoot);
            
            // 方法B：如果找不到，就用你刚才点击的那个物体，往上找它的根节点
            if (!chest && clickedObject) {
                let root = clickedObject;
                // 向上遍历直到找到场景的直接子物体
                while(root.parent && root.parent !== scene) {
                    root = root.parent;
                }
                chest = root;
                console.log("⚠️ 使用点击对象作为宝箱根节点:", chest);
            }

            const table = scene.children.find(c => c.userData.isWorktable);
            
            // 🚨 如果还是找不到宝箱或桌子，直接弹证书，别卡着！
            if (!chest || !table) {
                console.warn("❌ 找不到宝箱模型，直接弹证书");
                document.getElementById('victory-modal').style.display = 'flex';
                return;
            }

            // --- 🎬 3. 开始动画 ---
            const targetPos = table.position.clone();
            targetPos.y += 0.6; 
            
            chest.position.copy(targetPos);
            
            const spotLight = new THREE.SpotLight(0xffd700, 100);
            spotLight.position.set(targetPos.x, targetPos.y + 5, targetPos.z);
            spotLight.target = chest;
            scene.add(spotLight);

            let progress = 0;
            const animLoop = () => {
                progress += 0.01; // 稍微加快一点
                
                if (progress < 0.4) {
                    const s = 0.2 + (progress / 0.4) * 0.8; // 变大
                    chest.scale.set(s, s, s);
                    chest.rotation.y += 0.3; 
                    chest.position.y = targetPos.y + Math.sin(progress * 10) * 0.5; 
                } 
                else if (progress < 0.8) {
                    chest.rotation.z = (Math.random() - 0.5) * 0.4; // 剧烈晃动
                    chest.position.y = targetPos.y + 0.7;
                }
                else {
                    chest.rotation.z = 0;
                    chest.rotation.y = 0; 
                    chest.position.y = THREE.MathUtils.lerp(chest.position.y, targetPos.y, 0.2);
                }

                if (progress < 1.0) {
                    requestAnimationFrame(animLoop);
                } else {
                    scene.remove(spotLight);
                    window.showToast("✨ 宝箱已开启！");
                    // 🏆 动画结束，必弹证书
                    document.getElementById('victory-modal').style.display = 'flex';
                    window.askTeacher('act3_finish');
                }
            };
            
            window.showToast("🎁 神秘宝箱正在开启...");
            animLoop();

        } catch (e) {
            console.error("❌ 动画出错，强制弹窗:", e);
            // 万一报错了，也要把证书弹出来，不能让用户白玩
            document.getElementById('victory-modal').style.display = 'flex';
        }
    }

    // 🔥🔥🔥 新增：开启自由探索模式 (修复版：宝箱归位) 🔥🔥🔥
    startFreeRoam() {
        console.log("🚀 进入自由探索模式");
        
        // 1. 标记状态
        this.currentAct = 99; 
        this.step = 0;

        // 2. 切换到“我是游客”视角
        window.setCameraView('person');

        // 3. 宝箱复位逻辑 (新增部分) 👇👇👇
        const chest = scene.children.find(c => c.userData.isChestRoot);
        if (chest) {
            // 恢复到 loadChest 函数里设置的初始值
            chest.position.set(0, 0.52, 0); 
            chest.rotation.set(0, -Math.PI / 2, 0); 
            chest.scale.set(0.2, 0.2, 0.2); 
            console.log("📦 宝箱已归位");
        }
        // 👆👆👆 新增结束

        // 4. 更新 UI
        this.updateUI("🕊️ <b>自由探索模式</b><br>恭喜毕业！尽情漫步，欣赏爱晚亭的四季美景吧。");

        // 5. 播放结束语
        window.askTeacher('free_roam'); 
        
        // 6. 开启落叶
        if (!leavesActive) {
            window.toggleLeaves();
        }

        window.showToast("✨ 已切换至自由视角 (WASD移动 / Shift加速 / K跳跃)");
    }

    // 🔥 升级版：加载自定义油漆桶模型
    spawnPaintBucket() {
        // 1. 找到工作台
        const table = scene.children.find(c => c.userData.isWorktable);
        const pos = table ? table.position.clone() : new THREE.Vector3(10, 0, 10);
        
        // 2. 位置调整
        pos.x += 0.3;  // 往右放一点，别挡住中间
        pos.y += 0.45; // 抬高一点，放在桌面上 (根据之前的调试，桌面高度大概在这里)

        // 3. 加载模型
        const loader = new GLTFLoader(manager);
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('./draco/');
        loader.setDRACOLoader(dracoLoader);

        // ⚠️ 请确保你的文件名是 'paint_bucket.glb'，如果是别的名字请在这里修改
        loader.load('paint_bucket.glb', (gltf) => {
            const bucket = gltf.scene;
            
            bucket.position.copy(pos);
            
            // 🔍 缩放调整：如果模型太大或太小，请改这里的数字
            bucket.scale.set(0.3, 0.3, 0.3); 
            
            // 随机旋转一下，看起来更自然
            bucket.rotation.y = Math.random() * Math.PI;

            // 4. 关键：设置交互标签 (没有这些就点不动了！)
            bucket.userData.isPaintBucket = true;
            bucket.userData.isPart = true;

            bucket.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // 让子物体也继承标签，确保怎么点都能选中
                    child.userData.isPaintBucket = true;
                    child.userData.isPart = true;
                    
                    // 可选：给它加一点微弱的发光，让它显眼一点
                    child.material.emissive = new THREE.Color(0x220000); 
                }
            });

            scene.add(bucket);
            console.log("🎨 自定义油漆桶加载成功！");
            if(window.showToast) window.showToast("🎨 全新的油漆桶已送达！");
            
            dracoLoader.dispose();
        }, undefined, (err) => {
            console.error("❌ 油漆桶加载失败，请检查文件名是否正确", err);
            // 💡 兜底：如果模型加载失败，还是生成一个红圆柱，防止卡关
            this.spawnFallbackBucket(pos);
        });
    }

    // (可选) 兜底函数：万一模型没加载出来，用这个顶替
    //spawnFallbackBucket(pos) {
    //    const geo = new THREE.CylinderGeometry(0.2, 0.15, 0.4, 16);
    //    const mat = new THREE.MeshStandardMaterial({color: 0xFF0000});
    //    const b = new THREE.Mesh(geo, mat);
    //    b.position.copy(pos);
    //    b.position.y += 0.2; // 圆柱中心点要再高一点
    //    b.userData.isPaintBucket = true;
    //    b.userData.isPart = true;
    //    scene.add(b);
    //}

    showCalcPanel(act) {
        const panel = document.getElementById('calc-panel');
        const content = document.getElementById('calc-content');
        const title = document.getElementById('calc-title');
        const feedback = document.getElementById('calc-feedback');
        
        panel.style.display = 'block';
        feedback.innerText = "";
        document.getElementById('calc-input').value = "";

        if (act === 'act2') {
            title.innerText = "📐 立柱修缮图纸 (侧面积)";
            content.innerHTML = `
                <p><strong>测量对象：</strong>立柱 (单根)</p>
                <p><strong>底面周长 (C)：</strong>62.8 cm</p>
                <p><strong>立柱高度 (h)：</strong>300 cm</p>
                <p>----------------</p>
                <p><strong>求：侧面积 (S) = C × h</strong></p>
            `;
        } else if (act === 'act3') {
            title.innerText = "🌲 立柱制作图纸 (体积)";
            content.innerHTML = `
                <p><strong>测量对象：</strong>实心木料</p>
                <p><strong>底面半径 (r)：</strong>10 cm</p>
                <p><strong>立柱高度 (h)：</strong>300 cm</p>
                <p><strong>圆周率 (π)：</strong>3.14</p>
                <p>----------------</p>
                <p><strong>求：体积 (V) = πr²h</strong></p>
            `;
        }
    }

    // ... (以下辅助函数保持不变) ...
    highlightObject(obj, colorHex) {
        if (!obj.material) return;
        obj.userData.savedEmissive = obj.material.emissive.getHex();
        obj.material.emissive.setHex(colorHex);
        obj.material.emissiveIntensity = 1.5;
    }

    clearHighlight(obj) {
        if (!obj || !obj.material) return;
        obj.material.emissive.setHex(obj.userData.savedEmissive || 0x000000);
        obj.material.emissiveIntensity = 1.0;
    }

    // 🔥 修复版：缩小的木棍和纸张 (适合放在桌子上)
    spawnCraftingMaterials() { 
        const table = scene.children.find(c => c.userData.isWorktable);
        const pos = table ? table.position.clone() : new THREE.Vector3(10,0,10);
        
        // 往左偏一点，放在桌子左侧
        c.position.z -= 0.1; 
        c.position.y += 0.57; 

        const group = new THREE.Group(); 
        group.position.copy(pos); 

        // ✏️ 修改：缩小木棍 (半径 0.015, 长 0.3 -> 30厘米)
        const sGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.3, 16); 
        const sMat = new THREE.MeshStandardMaterial({color: 0x8B4513});
        const stick = new THREE.Mesh(sGeo, sMat); 
        stick.rotation.z = Math.PI / 2; 
        stick.userData.isCraftItem = true; 
        group.add(stick);

        // 📄 修改：缩小纸张 (0.3 x 0.3 -> 30厘米见方)
        const pGeo = new THREE.PlaneGeometry(0.3, 0.3); 
        const pMat = new THREE.MeshStandardMaterial({color: 0xFFFFFF, side: THREE.DoubleSide});
        const paper = new THREE.Mesh(pGeo, pMat); 
        paper.position.y = -0.02; // 稍微比木棍低一点点
        paper.rotation.x = -Math.PI / 2; 
        paper.userData.isCraftItem = true; 
        group.add(paper);

        scene.add(group); 
        this.craftingItems.push(group);
    }

    // 🔥 修复版：第一幕制作出的“钥匙”也变成你的模型
    playCraftingAnimation() { 
        // 1. 清除原材料
        this.craftingItems.forEach(i => scene.remove(i)); 
        this.craftingItems = [];
        
        // 2. 加载你的模型 my_prop.glb
        const loader = new GLTFLoader(manager);
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('./draco/');
        loader.setDRACOLoader(dracoLoader);

        loader.load('my_prop.glb', (gltf) => {
            const c = gltf.scene;
            
            // 3. 找到位置
            const t = scene.children.find(x => x.userData.isWorktable);
            if (t) {
                c.position.copy(t.position);
                c.position.z -= 0.1; 
                c.position.y += 0.67; 
            } else {
                c.position.set(5, 1.6, 5);
            }

            // 4. 调整大小
            c.scale.set(0.3, 0.7, 0.3);
            
            c.traverse(child => {
                if(child.isMesh) {
                    child.material.emissive = new THREE.Color(0xFFA500);
                    child.material.emissiveIntensity = 0.5;
                }
            });

            scene.add(c);
            
            // 5. 旋转展示动画
            const anim = () => {
                if (scene.children.includes(c)) {
                    c.rotation.y += 0.02;
                    requestAnimationFrame(anim);
                }
            }; 
            anim();
            
            // 记录下来，方便后面清场
            this.craftingResult = c; 

            if(window.showToast) window.showToast("🔨 制作成功！获得圆柱钥匙");
            
            dracoLoader.dispose();
        }, undefined, (err) => {
            console.error("加载钥匙模型失败", err);
        });
    }
    updateUI(text) {
        const ui = document.getElementById('story-ui'); 
        if (ui) ui.style.display = 'block';
        const t = document.getElementById('current-task'); 
        if (t) t.innerHTML = text;
    }
}

const storyMgr = new StoryManager();

window.addEventListener('calc-submit', (e) => {
    storyMgr.onCalcSubmit(e.detail);
});
// --- 辅助函数 ---

function getSmartChineseName(obj) {
    if (obj.userData.isPillar) return "红色圆柱 (内)";
    if (obj.userData.isSquarePillar) return "长方体方柱 (外)";
    if (obj.userData.isTable) return "石桌";
    if (obj.userData.isChest) return "宝箱";
    if (obj.userData.isWorktable) return "工作台";
    if (obj.userData.isPaintBucket) return "红漆桶";
    
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    if (center.y > 4.0) return "飞檐翘角 (屋顶)";
    if (center.y > 2.5) return "彩绘横梁";
    if (center.y > 0.5) return "木质围栏";
    return "石砌台基";
}

function stopSpeaking() {
    if (currentAudioObj) {
        currentAudioObj.pause();
        currentAudioObj.currentTime = 0;
        currentAudioObj = null;
    }
    const video = document.getElementById('digital-human-video');
    if(video) {
        video.pause();
        video.src = "idle.mp4";
    }
    const oldLoading = document.getElementById('thinking-msg');
    if(oldLoading) oldLoading.remove();
}

function updateButtonState(btnId) {
    ['btn-person', 'btn-top', 'btn-front'].forEach(id => {
        const btn = document.getElementById(id);
        if(btn) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(btnId);
    if(activeBtn) activeBtn.classList.add('active');
}

window.toggleAudio = () => {
    const audio = document.getElementById('bgm');
    const btnMusic = document.getElementById('btn-music');
    if (!audio) return;
    audio.volume = 0.3;
    if (audio.paused) { 
        audio.play().then(() => {
            showToast("🎵 背景音乐开");
            if(btnMusic) btnMusic.classList.add('music-active'); 
        }).catch(()=>{}); 
    } else { 
        audio.pause(); 
        showToast("🔇 背景音乐关"); 
        if(btnMusic) btnMusic.classList.remove('music-active'); 
    }
};

function showToast(msg) { 
    const t = document.getElementById('toast'); 
    if(t){ 
        t.innerText = msg; 
        t.classList.add('show'); 
        setTimeout(() => t.classList.remove('show'), 2000); 
    }
}

window.showToast = showToast; // 🔥 关键修复：把它变成全局函数

function addMessageToChat(text, sender) { 
    const chat = document.getElementById('chat-history'); 
    if(!chat) return; 
    const div = document.createElement('div'); 
    div.classList.add('message', sender); 
    div.innerText = text; 
    chat.appendChild(div); 
    chat.scrollTop = chat.scrollHeight; 
}

// 🔥 修复：确保 window.closeIntro 注册后再调用
window.closeIntro = () => {
    console.log("🖱️ 点击了开始上课");
    const overlay = document.getElementById('intro-overlay');
    if(overlay) overlay.style.display = 'none';
    window.toggleAudio(); 
    
    // 延迟启动剧情
    setTimeout(() => { 
        storyMgr.startStory();
    }, 500);
};

window.submitCalculation = function() {
    const input = document.getElementById('calc-input');
    if(input) {
        const val = parseFloat(input.value);
        storyMgr.onCalcSubmit(val);
    }
};

window.toggleFullscreen = () => {
    const doc = document;
    if (!doc.fullscreenElement) {
        doc.documentElement.requestFullscreen().then(() => {
            document.body.classList.add('fullscreen-mode');
            showToast("📺 进入全屏");
        }).catch(err => console.error(err));
    } else {
        if (doc.exitFullscreen) {
            doc.exitFullscreen();
            document.body.classList.remove('fullscreen-mode');
        }
    }
    setTimeout(onWindowResize, 100);
};

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        document.body.classList.remove('fullscreen-mode');
        setTimeout(onWindowResize, 100);
    } else {
        setTimeout(onWindowResize, 100);
    }
});

window.updateExplosion = (value) => {
    const strength = parseFloat(value) * 6.0; 
    modelParts.forEach(part => {
        if (part.userData.explodeDir) {
            part.position.copy(part.userData.originPos)
                .add(part.userData.explodeDir.clone().multiplyScalar(strength));
        }
    });
};

window.updateClipping = (value) => { 
    const val = parseFloat(value);
    const threshold = 8.0;
    modelParts.forEach(part => {
        if (part.userData.centerY > 2.5) {
            if (val < threshold) {
                let opacity = Math.max(0.1, val / threshold); 
                part.material.transparent = true;
                part.material.opacity = opacity;
                part.visible = opacity > 0.15; 
            } else {
                part.material.transparent = false;
                part.material.opacity = 1.0;
                part.visible = true;
            }
        }
    });
};

window.setCameraView = (type) => {
    if(!camera || !controls) return;
    controls.reset(); 

    if (type === 'person') { 
        isFirstPersonMode = true; 
        controls.enabled = false; 
        setupFirstPersonCamera(); 
        updateButtonState('btn-person'); 
        showToast("🚶 游客视角"); 
    } 
    else if (type === 'top') { 
        isFirstPersonMode = false; 
        controls.enabled = true; 
        controls.enablePan = true;
        controls.enableZoom = true;
        camera.position.set(0, 40, 0); 
        camera.lookAt(0, 0, 0); 
        controls.target.set(0,0,0); 
        controls.update();
        updateButtonState('btn-top'); 
        showToast("🕊️ 小鸟视角"); 
    } 
    else if (type === 'front') { 
        isFirstPersonMode = false; 
        controls.enabled = true; 
        controls.enablePan = true;
        controls.enableZoom = true;
        camera.position.set(0, 3, 25); 
        camera.lookAt(0, 3, 0); 
        controls.target.set(0,3,0); 
        controls.update();
        updateButtonState('btn-front'); 
        showToast("🏠 正面视角"); 
    }
};

window.toggleLeaves = () => {
    leavesActive = !leavesActive;
    if(leavesSystem) leavesSystem.visible = leavesActive;
    
    const btn = document.getElementById('btn-leaves');
    if(btn) {
        if(leavesActive) {
            btn.classList.add('active'); 
            btn.innerHTML = '<i class="fas fa-wind"></i> 关闭落叶';
        } else {
            btn.classList.remove('active'); 
            btn.innerHTML = '<i class="fas fa-leaf"></i> 开启落叶';
        }
    }
};

window.askTeacher = (actionType) => {
    stopSpeaking();
    const chatHistory = document.getElementById('chat-history');
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'thinking-msg';
    loadingDiv.className = 'message teacher';
    loadingDiv.innerText = "正在思考..."; 
    if(chatHistory) {
        chatHistory.appendChild(loadingDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
    const video = document.getElementById('digital-human-video');
    if(video) video.src = "idle.mp4";

    console.log("📡 发送请求:", actionType);

    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType })
    })
    .then(response => response.json())
    .then(data => {
        stopSpeaking(); 
        if(data.success) {
            addMessageToChat(data.message, 'teacher');
            if (data.audio) {
                const audioUrl = data.audio.startsWith('http') ? data.audio : './' + data.audio;
                currentAudioObj = new Audio(audioUrl);
                currentAudioObj.play().catch(e => console.error("播放被拦截:", e));
                if(video) { 
                    video.src = "talking.mp4"; 
                    video.play().catch(()=>{}); 
                    currentAudioObj.onended = () => { 
                        video.src = "idle.mp4"; 
                        video.play().catch(()=>{});
                    };
                }
            }
        } else {
            addMessageToChat("网络有点卡...", 'teacher');
        }
    })
    .catch(err => {
        stopSpeaking();
        console.error("❌ Fetch 错误:", err);
        addMessageToChat("🔴 连接失败", 'teacher');
    });
};

// 🔥🔥🔥 优化版：根据不同模式，给摄像机更酷的运镜 🔥🔥🔥
window.switchStage = (n) => {
    // 重置一些通用状态
    window.updateExplosion(0);
    window.updateClipping(12);
    const slider = document.getElementById('explode-slider');
    if(slider) slider.value = 0;
    
    // 确保控制器启用
    if(controls) {
        controls.enabled = true;
        controls.autoRotate = false; // 默认关闭旋转
    }

    if(n === 1) { 
        // --- 漫步模式 ---
        // 恢复第一人称或之前的视角
        window.setCameraView('person'); 
        window.askTeacher('welcome'); 
    }
    else if(n === 2) { 
        // --- 结构模式 (优化) ---
        // 变成上帝视角 + 自动旋转展示
        isFirstPersonMode = false;
        camera.position.set(20, 15, 20); // 侧上方俯视
        camera.lookAt(0, 5, 0);
        if(controls) {
            controls.target.set(0, 5, 0);
            controls.autoRotate = true; // ✨ 开启自动旋转，像展厅一样
            controls.autoRotateSpeed = 1.0;
        }
        window.askTeacher('stage_2'); 
    }
    else { 
        // --- 工坊模式 (优化) ---
        // 变成工作台特写视角，不再是看亭子
        isFirstPersonMode = false;
        
        // 找到工作台的位置 (根据之前代码是 0, 0.4, -4)
        // 让摄像机飞到工作台面前
        camera.position.set(0, 3, 2); // 人站在桌子前上方
        camera.lookAt(0, 0, -4);      // 盯着桌子中心
        
        if(controls) {
            controls.target.set(0, 0.5, -4); // 旋转中心设在桌子上
            controls.enablePan = false; // 禁止平移，防止用户迷路
            controls.minDistance = 2;   // 限制缩放，不让太近
            controls.maxDistance = 10;  // 限制缩放，不让太远
        }
        
        interactMode = 'game'; 
        window.askTeacher('stage_3'); 
    }
    
    setTimeout(onWindowResize, 100);
};

window.showHint = () => showToast("👀 找找里面的红色圆柱子！");
window.takeSnapshot = () => { 
    renderer.render(scene, camera); 
    const l = document.createElement('a'); l.download = 'snapshot.png'; l.href = renderer.domElement.toDataURL('image/png'); l.click(); 
    showToast("📸 截图已保存"); 
};

// --- 初始化与加载 ---

function init() {
    const container = document.getElementById('canvas-wrapper-stroll');
    const width = container ? container.clientWidth : window.innerWidth;
    const height = container ? container.clientHeight : window.innerHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); 
    scene.fog = new THREE.Fog(0xccaa88, 10, 80); 

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 300);
    setupFirstPersonCamera();

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); 
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; 
    
    if(container) {
        container.appendChild(renderer.domElement);
    }

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5); 
    sunLight.position.set(30, 50, 20); 
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048; sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x404040, 0.8));

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enabled = false; 

    window.addEventListener('mousedown', (e) => {
        mouseDownPos.x = e.clientX;
        mouseDownPos.y = e.clientY;
        if(isFirstPersonMode) {
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });

    window.addEventListener('mouseup', (e) => {
        isDragging = false;
        onMouseClick(e);
    });

    document.addEventListener('mousemove', onMouseMove);

    loadHDRBackground(); 
    createLowPolyTerrain(); 
    createStonePath();      
    createFallingLeaves();
    
    // 加载资源
    loadPavilion(); 
    loadTrees(); 
    loadTable(); 
    loadChest();
    createWorktable();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('wheel', onMouseWheel, { passive: false });
// 🔥 替换后的按键监听：支持 Shift(加速) 和 空格(跳跃)
    document.addEventListener('keydown', (e) => { 
        const key = e.key.toLowerCase();
        // 处理 WASD
        if(keyState.hasOwnProperty(key)) keyState[key] = true; 
        // 处理 Shift 加速
        if(e.key === 'Shift') keyState.shift = true;
        // 处理 空格 跳跃
        if(e.key === 'k') keyState.k = true;
    });

    document.addEventListener('keyup', (e) => { 
        const key = e.key.toLowerCase();
        if(keyState.hasOwnProperty(key)) keyState[key] = false; 
        if(e.key === 'Shift') keyState.shift = false;
        if(e.key === 'k') keyState.k = false;
    });
    window.addEventListener('blur', () => { keyState.w=false; keyState.a=false; keyState.s=false; keyState.d=false; isDragging=false; });
    
    window.setCameraView('top');

    // ... 在 init() 函数的最后 ...

    window.addEventListener('resize', onWindowResize);
    window.setCameraView('top');

}

function onWindowResize() {
    const canvas = renderer.domElement;
    const parent = canvas.parentElement;
    
    if (document.body.classList.contains('fullscreen-mode')) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    } 
    else if (parent) {
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
}

function createWorktable() {
    const loader = new GLTFLoader(manager);
    
    // 🔥🔥🔥 新增：Draco 解码器配置 🔥🔥🔥
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./draco/'); // 使用本地 draco 文件夹
    loader.setDRACOLoader(dracoLoader);

    loader.load('my_table.glb', (gltf) => { 
        const table = gltf.scene;
        
        // 设置到腾出的空地位置 (0, 1.5, 10)
        table.position.set(0, 0.4, -4); 

        // ⚠️ 记得根据模型实际大小调整缩放
        table.scale.set(1.0, 1.0, 1.0); 
        
        table.rotation.y = -Math.PI / 2;; 

        // 设置交互数据
        table.userData.isWorktable = true; 
        table.userData.isPart = true;

        table.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isWorktable = true;
                child.userData.isPart = true;
            }
        });

        scene.add(table);
        console.log("✅ 工作台(my_table.glb) [Draco] 加载成功");
        
        // 释放解码器内存
        dracoLoader.dispose();
    }, undefined, (err) => {
        console.error("❌ 工作台加载失败:", err);
    });
}

function loadPavilion() {
    const loader = new GLTFLoader(manager);
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./draco/'); 
    loader.setDRACOLoader(dracoLoader);

    loader.load('aiwan_pavilion.glb', (gltf) => {
        mainModel = gltf.scene;
        const box = new THREE.Box3().setFromObject(mainModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 5.5 / maxDim; 
        
        mainModel.scale.set(scale, scale, scale);
        mainModel.position.sub(center.multiplyScalar(scale)); 
        mainModel.position.y = -box.min.y * scale; 
        mainModel.rotation.y = -Math.PI / 2; 

        scene.add(mainModel); 
        mainModel.updateMatrixWorld(true); 

        mainModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true; 
                child.receiveShadow = true;
                child.material.transparent = true; 
                child.material.side = THREE.DoubleSide; 

                child.userData.isPart = true;
                modelParts.push(child); 

                child.userData.originPos = child.position.clone();
                const partBox = new THREE.Box3().setFromObject(child);
                const partCenter = partBox.getCenter(new THREE.Vector3());
                child.userData.centerY = partCenter.y; 

                const dir = new THREE.Vector3(0, 0, 0);
                if (partCenter.y > 4.0) dir.set(0, 1, 0); 
                else if (partCenter.y < 0.5) dir.set(0, 0, 0); 
                else dir.set(partCenter.x, 0, partCenter.z).normalize();
                child.userData.explodeDir = dir;

                // --- 🔥 核心修改：放宽内柱识别标准 🔥 ---
                const pSize = partBox.getSize(new THREE.Vector3());
                
                // 1. 形状宽松：只要高度 > 宽度的 1.0 倍就算柱子（之前是2.0太严了）
                const isTall = pSize.y > pSize.x * 1.0 && pSize.y > pSize.z * 1.0;
                
                if (isTall) {
                    const distFromCenter = Math.sqrt(partCenter.x * partCenter.x + partCenter.z * partCenter.z);
                    
                    // 2. 距离锁定：内柱一般离中心很近 (0.2米 ~ 3.0米范围内)
                    if (distFromCenter < 3.0 && distFromCenter > 0.2) { 
                        child.userData.isPillar = true; 
                        // 预设一个暗红色
                        child.material.emissive = new THREE.Color(0x220000); 
                        console.log(`✅ 锁定内柱: ${child.name} (距离:${distFromCenter.toFixed(1)})`);
                    } else { 
                        child.userData.isSquarePillar = true; 
                    }
                }
            }
        });
        dracoLoader.dispose();
    }, undefined, (err) => console.error("模型加载错误:", err));
}

function loadTable() {
    const loader = new GLTFLoader(manager);

    // 🔥🔥🔥 新增：Draco 解码器配置 🔥🔥🔥
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./draco/'); // 使用本地 draco 文件夹
    loader.setDRACOLoader(dracoLoader);

    loader.load('table.glb', (gltf) => {
        const table = gltf.scene;
        table.rotation.z = Math.PI / 2; 
        table.position.set(0, 0.2, 0); 
        table.scale.set(0.8, 0.8, 0.8); 
        table.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isTable = true;
                child.userData.isPart = true; 
            }
        });
        scene.add(table);
    }, undefined, (err) => console.log("桌子加载失败"));
}

function loadChest() {
    const loader = new GLTFLoader(manager);
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./draco/');
    loader.setDRACOLoader(dracoLoader);
    
    loader.load('chest.glb', (gltf) => {
        const chest = gltf.scene;
        
        // 初始位置 (放在角落或原来的位置)
        chest.position.set(0, 0.52, 0); 
        chest.scale.set(0.2, 0.2, 0.2); 
        chest.rotation.y = -Math.PI / 2; 

        // 🔥 关键：给宝箱根节点打标签，方便后面通过 scene.children.find 找到它
        chest.userData.isChestRoot = true; 

        chest.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.isChest = true; 
                child.userData.isPart = true; 
            }
        });
        scene.add(chest);
    }, undefined, (err) => console.log("宝箱加载失败"));
}

function onMouseClick(e) {
    const dist = Math.abs(e.clientX - mouseDownPos.x) + Math.abs(e.clientY - mouseDownPos.y);
    if (dist > 5) return; 

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    
    if (interactMode === 'game') {
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
            let hitObj = intersects[0].object;
            while(hitObj && !hitObj.userData.isPart && hitObj.parent) { hitObj = hitObj.parent; }

            if (hitObj && hitObj.userData.isPart) {
                // 点击高亮特效
                const oldHex = hitObj.material.emissive ? hitObj.material.emissive.getHex() : 0x000000;
                if(hitObj.material.emissive) hitObj.material.emissive.setHex(0xFF0000);
                setTimeout(() => { if(hitObj.material.emissive) hitObj.material.emissive.setHex(oldHex); }, 300);

                // 通知剧情管理器
                storyMgr.handleInteraction(hitObj);

                // --- 交互逻辑 ---
                if (hitObj.userData.isTable) {
                    const distToPlayer = camera.position.distanceTo(hitObj.position); 
                    if (distToPlayer < 8.0) {
                        showToast("🪑 这是一张古朴的石桌。");
                    } else {
                        showToast("🚶 请走近一点再查看！");
                    }
                }
                // 🔥🔥🔥 核心修改区 🔥🔥🔥
                else if (hitObj.userData.isChest) {
                    // 只要在第三幕，或者你觉得已经做完了（step >= 3），就允许开箱
                    // 为了方便你测试，我甚至去掉了 step 的限制，只要在 Act 3 就可以点
                    if (storyMgr.currentAct === 3) { 
                         console.log("🎁 正在尝试打开宝箱...");
                         // 将点击到的物体直接传过去，作为“找不到根节点”时的替补
                         storyMgr.playChestOpeningAnim(hitObj);
                    } else {
                         showToast("🔒 宝箱紧锁着... 完成课程才能打开它！");
                    }
                }
                // 🔥🔥🔥 修改结束 🔥🔥🔥
                else if (hitObj.userData.isPillar) {
                    if (storyMgr.step !== 1) showToast("🎉 这是爱晚亭的内柱！");
                } 
                else if (hitObj.userData.isSquarePillar) {
                    showToast("📏 这是长方体方柱 (外)！"); 
                }
                else {
                    showToast("🧱 " + getSmartChineseName(hitObj));
                }
            }
        }
    } 
}

function loadHDRBackground() { 
    const loader = new RGBELoader(manager);
    loader.load('sky.hdr', (texture) => { 
        texture.mapping = THREE.EquirectangularReflectionMapping; 
        scene.background = texture; 
        scene.environment = texture; 
        scene.fog = null; 
    }, undefined, () => scene.background = new THREE.Color(0x87CEEB)); 
}

function createStonePath() {
    const group = new THREE.Group();
    const loader = new THREE.TextureLoader(manager);
    const tDiff = loader.load('path_diff.jpg'); tDiff.colorSpace = THREE.SRGBColorSpace;
    const tNor = loader.load('path_nor.jpg'); 
    const tRough = loader.load('path_rough.jpg');
    const stoneColors = [0xdddddd, 0xcccccc, 0xbbbbbb];
    
    let currentZ = 45;
    while(currentZ > -25) {
        if (currentZ < 3 && currentZ > -2) { currentZ -= 1.3; continue; }
        const stonesInRow = Math.floor(Math.random() * 2) + 2; const rowWidth = 5; const segmentWidth = rowWidth / stonesInRow;
        for(let i=0; i<stonesInRow; i++) {
            const w = segmentWidth * (0.8 + Math.random()*0.2); const l = 1.2 * (0.8 + Math.random()*0.4); const h = 0.2 + Math.random() * 0.1;
            const mat = new THREE.MeshStandardMaterial({ map: tDiff, normalMap: tNor, roughnessMap: tRough, color: stoneColors[Math.floor(Math.random()*stoneColors.length)], roughness: 0.8 });
            const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
            s.position.set(-rowWidth/2 + segmentWidth*i + segmentWidth/2 + (Math.random()-0.5)*0.2, 0.1, currentZ + (Math.random()-0.5)*0.2);
            s.rotation.set((Math.random()-0.5)*0.05, (Math.random()-0.5)*0.1, 0); s.castShadow = true; s.receiveShadow = true; group.add(s);
        }
        currentZ -= 1.3;
    }
    scene.add(group);
}

function createLowPolyTerrain() { 
    const loader = new THREE.TextureLoader(manager);
    const tColor = loader.load('ground_diff.jpg'); tColor.wrapS=tColor.wrapT=THREE.RepeatWrapping; tColor.repeat.set(8,8); tColor.colorSpace=THREE.SRGBColorSpace; 
    const tNor = loader.load('ground_nor.jpg'); tNor.wrapS=tNor.wrapT=THREE.RepeatWrapping; tNor.repeat.set(8,8); 
    const tRough = loader.load('ground_rough.jpg'); tRough.wrapS=tRough.wrapT=THREE.RepeatWrapping; tRough.repeat.set(8,8); 
    
    const geometry = new THREE.PlaneGeometry(200, 200, 64, 64); 
    const pos = geometry.attributes.position; 

    const tableX = 10;
    const tableZ = 10;

    for (let i = 0; i < pos.count; i++) { 
        const x = pos.getX(i); 
        const y = pos.getY(i);

        let height = Math.random() * 1.5; 
        if (Math.abs(x) < 4.5) height = -0.1; 

        // 2. 🔥🔥🔥 新增：给工作台腾出一块半径为 4 的平地 🔥🔥🔥
        // 计算当前顶点到工作台的距离
        const dist = Math.sqrt((x - tableX) ** 2 + (y - tableZ) ** 2);
        if (dist < 4.0) {
            height = 0; // 强制设为平地高度
        }

        pos.setZ(i, height); 
    } 
    geometry.computeVertexNormals(); 
    const material = new THREE.MeshStandardMaterial({ map: tColor, normalMap: tNor, roughnessMap: tRough, roughness: 0.8, color: 0xdddddd }); 
    terrainMesh = new THREE.Mesh(geometry, material); 
    terrainMesh.rotation.x = -Math.PI / 2; 
    terrainMesh.receiveShadow = true; 
    scene.add(terrainMesh); 
}

function loadTrees() { 
    const loader = new GLTFLoader(manager);
    loader.load('tree.glb', (gltf) => { 
        let treeGeometry = null; let treeMaterial = null; 
        gltf.scene.traverse((child) => { if (child.isMesh && !treeGeometry) { treeGeometry = child.geometry; treeMaterial = child.material; if (treeMaterial) { treeMaterial.roughness = 0.9; treeMaterial.metalness = 0.0; treeMaterial.side = THREE.DoubleSide; } child.castShadow = true; child.receiveShadow = true; } }); 
        
        if (!treeGeometry) return; 
        
        const count = 60; 
        const instancedMesh = new THREE.InstancedMesh(treeGeometry, treeMaterial, count); 
        instancedMesh.castShadow = true; 
        instancedMesh.receiveShadow = true; 
        
        const dummy = new THREE.Object3D(); 
        const raycaster = new THREE.Raycaster(); 
        const downDirection = new THREE.Vector3(0, -1, 0); 
        
        const rawBox = new THREE.Box3().setFromObject(gltf.scene);
        const rawBottomY = rawBox.min.y;

        for (let i = 0; i < count; i++) { 
            let x, z; 
            z = -40 + Math.random() * 90; 
            if (z < -20) { x = (Math.random() - 0.5) * 50; } 
            else { 
                const distFromCenter = 6 + Math.random() * 16; 
                const isLeft = Math.random() > 0.5; 
                x = isLeft ? -distFromCenter : distFromCenter; 
            } 
            
            const randomScale = 6.0 + Math.random() * 5.0; 
            dummy.scale.set(randomScale, randomScale, randomScale); 
            
            raycaster.set(new THREE.Vector3(x, 500, z), downDirection); 
            let groundHeight = 0; 
            if (terrainMesh) { 
                const intersects = raycaster.intersectObject(terrainMesh); 
                if (intersects.length > 0) groundHeight = intersects[0].point.y; 
            } 
            const finalY = groundHeight - (rawBottomY * randomScale) - 0.02; 
            dummy.position.set(x, finalY, z); 
            
            dummy.rotation.y = Math.random() * Math.PI * 2; 
            dummy.rotation.x = (Math.random() - 0.5) * 0.15; 
            dummy.rotation.z = (Math.random() - 0.5) * 0.15; 
            dummy.updateMatrix(); 
            instancedMesh.setMatrixAt(i, dummy.matrix); 
        } 
        
        instancedMesh.instanceMatrix.needsUpdate = true; 
        scene.add(instancedMesh); 
    }, undefined, (error) => console.error(error)); 
}

function createFallingLeaves() { 
    const leafCount = 400; 
    const geo = new THREE.BufferGeometry(); 
    const pos=[], spd=[]; 

    for(let i=0; i<400; i++) { 
        pos.push((Math.random()-0.5)*60, Math.random()*20+2, (Math.random()-0.5)*80+10); 
        spd.push(0.02+Math.random()*0.03); 
    } 
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); 
    geo.setAttribute('speed', new THREE.Float32BufferAttribute(spd,1)); 
    leavesSystem = new THREE.Points(geo, new THREE.PointsMaterial({color:0xFFA500, size:0.25, transparent:true})); 
    leavesSystem.visible = false; 
    scene.add(leavesSystem); 
}

function setupFirstPersonCamera() { 
    // 🔥 修改：把 Z 轴从 40 改为 20，离亭子更近
    camera.position.set(0, 1.2, 20); 
    
    camera.rotation.order='YXZ'; 
    camera.rotation.set(0,0,0); 
    
    // 重置物理状态
    playerVelocityY = 0;
}

function onMouseWheel(e) { 
    if(!isFirstPersonMode) return; 
    e.preventDefault(); const s=0.8; 
    camera.position.z += (e.deltaY<0 ? -s : s); 
    camera.position.z = THREE.MathUtils.clamp(camera.position.z,-20,45); 
}

function onMouseMove(e) { 
    if(!isFirstPersonMode) return; 
    if(isDragging) { 
        const s = 0.002; 
        camera.rotation.y -= (e.clientX - previousMousePosition.x) * s; 
        camera.rotation.x -= (e.clientY - previousMousePosition.y) * s; 
        camera.rotation.x = Math.max(-1.0, Math.min(1.0, camera.rotation.x)); 
    } 
    previousMousePosition = {x: e.clientX, y: e.clientY}; 
}

// 🔥🔥🔥 完美修复版：K键跳跃 + 修复左右反向 + 降低高度 🔥🔥🔥
function updateFirstPersonMovement() { 
    if (!isFirstPersonMode) return; 

    // 1. 计算移动速度 (Shift 加速)
    const baseSpeed = 0.15;
    const runMultiplier = 2.5; 
    const currentSpeed = keyState.shift ? (baseSpeed * runMultiplier) : baseSpeed;

    // 2. 水平移动 (WASD)
    const dir = new THREE.Vector3(); 
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    camera.getWorldDirection(forward); 
    forward.y = 0; forward.normalize(); 
    
    // 🛠️ 核心修复：交换叉乘顺序 (forward x up = right)
    // 之前是 (up x forward) 算出的是左边，导致 A/D 反向
    right.crossVectors(forward, camera.up).normalize(); 

    if (keyState.w) dir.add(forward);
    if (keyState.s) dir.sub(forward);
    if (keyState.d) dir.add(right); // 现在 D 是往右
    if (keyState.a) dir.sub(right); // 现在 A 是往左

    if (dir.lengthSq() > 0) {
        dir.normalize();
        camera.position.addScaledVector(dir, currentSpeed);
    }

    // 3. 垂直物理 (跳跃 & 重力)
    let groundHeight = 0; 
    if (terrainMesh) { 
        const downRay = new THREE.Raycaster(); 
        downRay.set(new THREE.Vector3(camera.position.x, 100, camera.position.z), new THREE.Vector3(0, -1, 0)); 
        const intersects = downRay.intersectObject(terrainMesh); 
        if (intersects.length > 0) {
            groundHeight = intersects[0].point.y;
        }
    }

    const playerHeight = 1.2;
    const groundLevel = groundHeight + playerHeight;
    const onGround = camera.position.y <= (groundLevel + 0.05);

    if (onGround) {
        camera.position.y = groundLevel; 
        playerVelocityY = 0; 

        // 👉 改为检测 K 键
        if (keyState.k) {
            playerVelocityY = JUMP_FORCE; 
            camera.position.y += 0.1; 
        }
    } else {
        playerVelocityY -= GRAVITY; 
    }

    camera.position.y += playerVelocityY;

    // 4. 边界限制
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -30, 50); 
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -30, 30); 
    
    if (camera.position.y < -5) {
        camera.position.set(0, 1.2, 20); 
        playerVelocityY = 0;
    }
}

function animate() { 
    requestAnimationFrame(animate); 
    updateFirstPersonMovement(); 
    if(leavesActive && leavesSystem) { 
        const p = leavesSystem.geometry.attributes.position.array; 
        for(let i=0; i<p.length/3; i++) { p[i*3+1] -= 0.05; if(p[i*3+1]<0) p[i*3+1]=15; } 
        leavesSystem.geometry.attributes.position.needsUpdate=true; 
    } 
    if(!isFirstPersonMode && controls) controls.update(); 
    renderer.render(scene, camera); 
}

window.handleKeyPress = (e) => { if (e.key === 'Enter') window.sendUserMessage(); };
window.sendUserMessage = () => { 
    const input = document.getElementById('user-input'); 
    const text = input.value.trim(); 
    if (!text) return; 
    document.getElementById('chat-window').classList.remove('hidden'); 
    addMessageToChat(text, 'user'); 
    input.value = ''; 
    window.askTeacher(text); 
};

// 🔥🔥🔥 修复版：切换模块时，自动搬运画布，解决蓝屏问题 🔥🔥🔥
window.switchModule = (moduleName) => {
    // 1. UI 切换逻辑 (保持不变)
    document.querySelectorAll('.module-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

    const target = document.getElementById(moduleName);
    if(target) target.classList.add('active');
    
    const navItem = document.querySelector(`.nav-item[data-target="${moduleName}"]`);
    if(navItem) navItem.classList.add('active');
    
    // 2. 🔥 核心修复：把 3D 画布搬运到当前模块的容器里 🔥
    const canvasContainerId = `canvas-wrapper-${moduleName}`;
    const newContainer = document.getElementById(canvasContainerId);
    
    if (newContainer && renderer && renderer.domElement) {
        // 如果画布不在当前容器里，就把它搬过来
        if (!newContainer.contains(renderer.domElement)) {
            newContainer.appendChild(renderer.domElement);
            console.log(`🎨 画布已搬运至: ${moduleName}`);
        }
    }

    // 3. 触发场景逻辑切换
    if(moduleName === 'stroll') window.switchStage(1);
    else if(moduleName === 'architect') window.switchStage(2);
    else if(moduleName === 'workshop') window.switchStage(3);
    
    // 4. 强制刷新尺寸，防止画面变形
    setTimeout(() => {
        onWindowResize();
    }, 50);
};

window.toggleChat = () => {
    const chat = document.getElementById('chat-window');
    if(chat) chat.classList.toggle('hidden');
};

window.closeGame = () => {
    document.getElementById('game-modal').style.display = 'none';
};

window.checkAnswer = (element, isCorrect) => {
    const result = document.getElementById('game-result');
    if (isCorrect) {
        element.style.backgroundColor = "#d1e7dd";
        result.innerHTML = "✅ 回答正确！圆柱体是爱晚亭的核心结构。";
        result.style.color = "green";
    } else {
        element.style.backgroundColor = "#f8d7da";
        result.innerHTML = "❌ 再想想？看看它的上下底面。";
        result.style.color = "red";
    }
};

// ... existing code ...

// 🔥🔥🔥 新增：控制教学窗口的函数 🔥🔥🔥
window.currentLearningCallback = null; // 用于存储关闭后的回调

window.openLearning = (url, callback) => {
    const modal = document.getElementById('learning-modal');
    const frame = document.getElementById('learning-frame');
    if(modal && frame) {
        frame.src = url; // 加载指定的 HTML 文件
        modal.style.display = 'flex';
        window.currentLearningCallback = callback; // 记住关闭后要干什么
    }
};

window.closeLearning = () => {
    const modal = document.getElementById('learning-modal');
    const frame = document.getElementById('learning-frame');
    if(modal) {
        modal.style.display = 'none';
        if(frame) frame.src = ""; // 清空，停止音频播放
        
        // 执行后续逻辑 (比如弹出计算器)
        if (window.currentLearningCallback) {
            window.currentLearningCallback();
            window.currentLearningCallback = null;
        }
    }
};

// 🔥🔥🔥 新增：点击证书按钮后调用的函数 🔥🔥🔥
window.enterFreeExploration = () => {
    // 1. 关闭证书弹窗
    const modal = document.getElementById('victory-modal');
    if (modal) {
        modal.style.display = 'none';
    }

    // 2. 启动自由模式
    if (storyMgr) {
        storyMgr.startFreeRoam();
    }
};

// 启动
init();
animate();
