# Neko Collection v0.2

本版本完成了界面升级、图片属性、统计页和登录权限控制。

## 主要功能

1. 现代化界面：导航栏 + 收藏/统计双视图 + 响应式布局
2. Logo：使用 `frontend/assets/logo.png`（来自根目录 `logo.png`）
3. 收藏品图片：新增图片字段，支持上传并展示
4. 新增方式：右下角 `+` 按钮弹出新增/编辑弹窗
5. 统计入口：导航栏 `统计`
6. 统计图表：
- 各类收藏品花费占比（饼图）
- 各年各月花费（柱状图）
7. 收藏卡片点击进入详情：一级页面移除编辑按钮，详情页提供编辑入口
8. 价格显示优化：整数价格不显示 `.00`
9. 书籍分层展示：
- 一级页面展示系列名与总消费
- 详情页展示分册信息（封面、购买价、原价、渠道、购买状态、日期）
- 支持在详情页新增/编辑/删除分册（需登录）
10. 登录功能：
- 未登录：仅可查看
- 登录后：可新增、编辑、删除、维护分册、刷新汇率

## 默认登录信息

- 登录仅需输入密码：`neko12345`
- 服务端默认账号仍为 `admin`（用于内部校验，可通过环境变量覆盖）

可通过环境变量覆盖：

- `NEKO_ADMIN_USERNAME`
- `NEKO_ADMIN_PASSWORD`

## 运行方式

在 `E:\CodeX\neko-collection` 下运行：

```powershell
python .\backend\server.py
```

或：

```powershell
.\run-local.ps1
```

访问：

- [http://127.0.0.1:8765](http://127.0.0.1:8765)

## 关键接口

- `GET /api/me`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/items`
- `POST /api/items`（需登录）
- `PUT /api/items/{id}`（需登录）
- `DELETE /api/items/{id}`（需登录）
- `POST /api/items/reorder`（需登录）
- `GET /api/stats`
- `GET /api/rates`
- `POST /api/rates/refresh`（需登录）

## 数据库

- 文件：`backend/neko_collection.db`
- 新增能力：
- 用户与会话（登录）
- 收藏品图片 `image_data`
- 统计接口支持字段
