# Dr.Kun | ABSOLUTE ORDER Landing Page

一个以数学与光影为核心的沉浸式落地页，使用 Raymarching 着色器呈现抽象黑金属形态。

## ✨ 特性

- 🧠 **Raymarching Shader** - 基于 GLSL 的体积光影渲染
- 🖤 **极简 UI 系统** - 高对比度排版与差值混合
- 🎯 **实时交互** - 鼠标驱动灯光与形态扰动
- ⚡ **高性能渲染** - 限制像素比以优化 GPU 负载
- 🎥 **入场动画** - GSAP 控制标题与元信息动画

## 🚀 快速开始

1. 克隆项目到本地
2. 在浏览器中打开 `index.html`
3. 保证网络可访问 CDN 资源（Three.js 与 GSAP）

## 📁 项目结构

```
.
├── index.html      # 主页面结构
├── styles.css      # 视觉样式
├── script.js       # Three.js + GLSL 渲染逻辑
└── README.md       # 项目说明
```

## 🛠️ 技术栈

- **HTML5**
- **CSS3**
- **JavaScript**
- **Three.js (CDN)**
- **GSAP (CDN)**

## 🎨 自定义提示

- 修改 `styles.css` 中的排版与字号即可调整 UI 视觉
- 修改 `script.js` 的 SDF 参数可以改变几何形态

## 📄 许可

本项目仅供学习和个人展示使用。
