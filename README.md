<p align="center"><img src="assets/icon.png" width="160" alt="大肥鱼表情包图标"></p>

# 大肥鱼表情包

给 DeepSeek Harness 聊天配表情：按情绪随机挑图，支持 GIF、QQ 回复、主动搭话和分类预览。

## 功能

- **按情绪随机选图**：开心、疑惑、困倦、招呼等情绪各选各的，同类图片等概率抽取。
- **人物与素材组筛选**：默认使用全部素材，也能指定人物或素材组。
- **图片与 GIF**：保留原图字节，动图直接预览和使用。
- **QQ 聊天配图**：选图结果生成 Markdown，交给 QQ 桥随回复发送；支持普通回复和主动搭话，分条文字共享一张图。
- **素材管理页**：查看素材总量、可用数量、情绪分布和人物分布，四列表格紧凑展示。
- **分类预览**：按情绪、人物筛选，上一张和下一张循环浏览；单张素材自动禁用切换。
- **独立选图记录**：聊天选图留存记录，预览与聊天记录分开处理。
- **桌面与浏览器适配**：图片使用宿主相对地址，设置和预览接入 DSH 登录认证。

## 安装

运行环境：支持第三方插件及 `connection.requestRejection` 接口的 DeepSeek Harness、Node.js 22+、Python 3.10+。插件优先使用 DSH 捆绑 Python，全部使用 Node.js 与 Python 标准库。

```powershell
dsh plugin --profile desktop add "https://codeload.github.com/Akie-Star/dsh-stickers/tar.gz/v0.1.5"
```

也可以在 DSH 插件管理中填写归档地址安装。安装或更新后重启 DSH，打开「设置 → 表情包」。

## 配置表情库

把自己的图片放进素材文件夹，并用 `CATALOG.json` 登记情绪、人物和相对路径。[索引示例](examples/CATALOG.json)可直接修改使用。

```text
我的表情库/
├─ CATALOG.json
├─ 开心/
│  └─ 笑.png
└─ 疑惑/
   └─ 问号.gif
```

```json
{
  "items": [
    { "id": "happy-001", "label": "开心", "category": "开心", "collection": "我的表情", "relativePath": "开心/笑.png" },
    { "id": "question-001", "label": "疑惑", "category": "疑惑", "collection": "我的表情", "relativePath": "疑惑/问号.gif" }
  ]
}
```

1. 在设置页填写素材库的绝对路径并保存。
2. 选择情绪或人物，点击「仅预览」检查图片与分类数量。
3. 开启插件，在聊天中使用选图工具。

索引字段：`id` 为唯一编号，`label` 为图片名称，`category` 为情绪，`collection` 为人物或素材组，`relativePath` 为素材库内的相对路径。可选字段还有 `emotion/tags/use/url`。缺失图片自动跳过。

## 聊天配图

- `sticker_pick({"emotion":"疑惑"})`：按情绪等概率选图，成功返回图片 Markdown。
- `sticker_pick({"emotion":"开心","collection":"我的表情"})`：指定素材组。
- `sticker_status()`：查看开关、素材数量和分类分布。

在需要配图的会话中加入规则：

> QQ 普通回复和主动搭话每轮配一张表情，分条文字共享一张，静默轮次跳过。先判断情绪，调用 sticker_pick，将返回的 Markdown 原样放在最终正文末尾，与文字空一行。有 [QQ] 块时，图片也放在块内，由 QQ 桥发送。

每轮配图规则由会话执行。首次预览随机选图，上一张和下一张按筛选结果顺序循环；切换分类清空旧预览，导航出错保留当前图片，方便重试。

## 本地配置

- 插件配置：`$DSH_HOME/stickers/config.json`，字段为 `enabled/libraryPath/pythonPath`。
- 设置页可修改开关与素材库路径，Python 路径以只读方式展示。
- 自定义 Python：在本地配置中将 `pythonPath` 设为 Python 可执行程序的绝对路径。
- 选图记录：`$DSH_HOME/feiyu-chat/sticker-usage.json`。

## 开发与检查

```shell
node test.mjs
node test-client.mjs
```

可通过 `STICKER_TEST_PYTHON` 指定测试 Python。宿主代码、前端脚本和 Python 选择器直接运行。

代码与图标采用 [MIT License](LICENSE)。
