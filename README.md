# Neko Collection

<p align="center">
  <img src="frontend/assets/logo.png" alt="Neko Collection Logo" width="120">
</p>

[![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)](https://github.com/your-username/neko-collection)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Neko Collection** 是一个专为收藏爱好者设计的私人收藏管理系统。它提供了一个现代化的 Web 界面，帮助你轻松记录、分类和统计你的收藏品（如书籍、手办、周边等）。

---

## ✨ 主要功能

- 🎨 **现代化界面**：采用响应式设计，支持导航栏切换“收藏”与“统计”双视图。
- 📸 **图片展示**：支持为收藏品上传图片，并在卡片和详情页直观展示。上传后的图片会以原文件形式保存到 `frontend/uploads/`，数据库中仅记录文件路径。
- 📊 **多维统计**：
  - **支出占比**：饼图展示各类收藏品的消费分布。
  - **趋势分析**：柱状图按年月展示收藏支出变化。
- 📚 **书籍分册管理**：支持系列书籍的层级化展示，可详细记录每一册的价格、渠道和状态。
- 🔒 **私密模式**：支持将特定收藏品标记为“私密”。私密条目仅在管理员登录且开启“私密模式”开关后可见，访客模式下完全隐藏。
- 🔐 **权限控制**：
  - **访客模式**：仅限查看公开条目，保护数据安全。
  - **管理员模式**：登录后可进行新增、编辑、删除、汇率刷新及查看/管理私密条目。
- 💱 **实时汇率**：支持刷新汇率，方便记录海外购入的收藏品。
- 💾 **服务器备份管理**：支持在线生成备份、查看备份列表、从服务器恢复或删除备份文件。

---

## 🛠️ 技术栈

- **前端**: React 18, Vanilla CSS, esbuild
- **后端**: Python (原生 `http.server` 扩展), SQLite3
- **部署**: 支持本地运行与局域网访问

---

## 🚀 快速开始

### 本地运行 (Node.js + Python)

#### 1. 环境准备
确保你的系统中已安装 **Python 3.x** 和 **Node.js**。

#### 2. 安装依赖
在项目根目录下运行：
```bash
npm install
```

#### 3. 构建前端
使用 esbuild 打包 React 代码：
```bash
npm run build
```

#### 4. 运行系统
你可以通过脚本快速启动：

- **Windows**:
  ```cmd
  .\run-windows.cmd [local|lan]
  ```
- **Linux / macOS**:
  ```bash
  chmod +x run-linux.sh
  ./run-linux.sh [local|lan]
  ```

---

## 🐳 Docker 部署

推荐使用 Docker Compose 进行快速部署，无需手动安装 Node.js 或 Python 环境。

### 1. 快速启动
在项目根目录下执行：
```bash
docker-compose up -d
```
启动后访问：[http://localhost:8765](http://localhost:8765)

### 2. 数据持久化 (推荐)
为了确保数据库和上传的图片在容器更新时不丢失，建议在 `docker-compose.yml` 中配置挂载卷：
```yaml
services:
  neko-collection:
    # ... 其他配置
    volumes:
      - ./backend/neko_collection.db:/app/backend/neko_collection.db
      - ./frontend/uploads:/app/frontend/uploads
      - ./backend/backups:/app/backend/backups
```

### 3. 环境变量配置
你可以在 `docker-compose.yml` 的 `environment` 节点下调整以下参数：

| 变量名 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `NEKO_ADMIN_PASSWORD` | 管理员登录密码 | `neko12345` |
| `NEKO_PORT` | 容器内服务端口 | `8765` |
| `NEKO_AUTO_BACKUP_ENABLED` | 是否启用自动备份 | `true` |
| `NEKO_AUTO_BACKUP_TIME` | 每日自动备份时间 (HH:mm) | `03:00` |
| `NEKO_MAX_LOCAL_BACKUPS` | 本地保留的最大备份数量 | `3` |

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
│   ├── assets/         # 样式、图片与打包后的脚本 (app.js, style.css 等)
│   ├── uploads/        # 收藏品与分册图片原文件存储目录
│   ├── index.html      # 入口文件
│   └── ...
├── docs/               # 项目文档与更新记录
├── package.json        # 前端依赖与构建脚本 (esbuild)
├── run-windows.cmd     # Windows 运行脚本 (支持 local/lan 模式)
└── run-linux.sh        # Linux/macOS 运行脚本 (支持 local/lan 模式)
```

---

## 📝 许可证

本项目采用 [MIT License](LICENSE) 许可。