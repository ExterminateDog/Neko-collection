# Neko Collection

<p align="center">
  <img src="frontend/assets/logo.png" alt="Neko Collection Logo" width="120">
</p>

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com/your-username/neko-collection)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Neko Collection** 是一个专为收藏爱好者设计的私人收藏管理系统。它提供了一个现代化的 Web 界面，帮助你轻松记录、分类和统计你的收藏品（如书籍、手办、周边等）。

---

## ✨ 主要功能

- 🎨 **现代化界面**：采用响应式设计，支持导航栏切换“收藏”与“统计”双视图。
- 📸 **图片展示**：支持为收藏品上传图片，并在卡片和详情页直观展示。
- 📊 **多维统计**：
  - **支出占比**：饼图展示各类收藏品的消费分布。
  - **趋势分析**：柱状图按年月展示收藏支出变化。
- 📚 **书籍分册管理**：支持系列书籍的层级化展示，可详细记录每一册的价格、渠道和状态。
- 🔐 **权限控制**：
  - **访客模式**：仅限查看，保护数据安全。
  - **管理员模式**：登录后可进行新增、编辑、删除及汇率刷新等操作。
- 💱 **实时汇率**：支持刷新汇率，方便记录海外购入的收藏品。

---

## 🛠️ 技术栈

- **前端**: React 18, Vanilla CSS, ESBuild
- **后端**: Python (原生 `http.server` 扩展), SQLite3
- **部署**: 支持本地运行与局域网访问

---

## 🚀 快速开始

### 1. 环境准备
确保你的系统中已安装 **Python 3.x** 和 **Node.js**。

### 2. 安装依赖
在根目录下运行：
```bash
npm install
```

### 3. 构建前端
使用 esbuild 打包 React 代码：
```bash
npm run build
```

### 4. 运行后端
你可以直接运行脚本或手动启动：

**Windows (PowerShell):**
```powershell
.\run-local.ps1
```

**手动启动:**
```bash
python .\backend\server.py
```

访问地址: [http://127.0.0.1:8765](http://127.0.0.1:8765)

---

## 🔑 登录信息

- **默认密码**: `neko12345` (仅需密码即可登录管理员模式)
- **配置环境**: 可通过环境变量自定义管理员凭据：
  - `NEKO_ADMIN_USERNAME`
  - `NEKO_ADMIN_PASSWORD`

---

## 📂 项目结构

```text
E:\CodeX\Neko-collection\
├── backend/            # Python 后端服务与 SQLite 数据库
├── frontend/           # React 前端源码与静态资源
│   ├── assets/         # 样式、图片与打包后的脚本
│   └── index.html      # 入口文件
├── docs/               # 项目文档
├── package.json        # 前端依赖与构建脚本
└── run-local.ps1       # 本地运行脚本
```

---

## 📝 许可证

本项目采用 [MIT License](LICENSE) 许可。
