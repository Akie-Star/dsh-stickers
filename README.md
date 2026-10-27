<p align="center"><img src="assets/icon.png" width="160" alt="大肥鱼表情包图标"></p>

# 大肥鱼表情包

给 DSH 聊天配表情用的，不用每次自己翻图、贴图。

- **按情绪挑图**：先判断这句话是什么情绪，再从对应分类里随机挑一张。同类每张图机会一样，不偏人物，也不因为最近用过就排除。
- **普通图片和 GIF 都支持**，不改原图，动图照样动。
- **QQ 回复和主动搭话都能配图**，按一轮一张的规则来，文字分成几条也共用这一张。
- **设置里能看素材数量和情绪分布**，四列表格不占太长一页；也能按情绪、人物筛选，点上一张、下一张慢慢翻。
- **预览只看图，不发消息、不记使用记录**。聊天选好图后，交给现有 QQ 桥发送。

## 安装

需要支持第三方插件的 DeepSeek Harness、Node.js 22+ 和 Python 3.10+。有 DSH 捆绑 Python 就直接用，不用再装依赖。插件本身没有 npm 或 Python 第三方依赖。

```powershell
dsh plugin --profile desktop add "https://codeload.github.com/Akie-Star/dsh-stickers/tar.gz/v0.1.4"
```

也可以在 DSH 插件管理里使用上面的 GitHub 归档地址安装。安装或更新后，按宿主提示重启 DSH，再打开「设置 → 表情包」。后端没有热重载时，只刷新页面不够。

## 准备自己的表情库

**插件不自带表情图片，也不会自动给图片分类。** 图片放在你自己的文件夹，用 `CATALOG.json` 告诉插件每张图是什么情绪。可以从 [索引示例](examples/CATALOG.json) 开始，按自己的图片修改路径和分类：

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

在设置中填写：

1. **素材库路径**：上面文件夹的绝对路径。
2. **Python 路径**：现有 Python 可执行文件；插件会优先找 DSH 捆绑的 Python。
3. 保存后点「仅预览」。能看到图片和分类数量，就可以用了。

`id` 要唯一，`relativePath` 相对素材库且不能指向库外。`label` 是名字，`category` 是情绪，`collection` 是人物或素材组；还可选填 `emotion/tags/use/url`。缺失图片会跳过，原图和 GIF 不会改动。

## 聊天怎么配图

插件提供两个工具：

- `sticker_pick({"emotion":"疑惑"})`：从该情绪中等概率挑一张，成功只返回 `markdown`。
- `sticker_status()`：按需查开关、素材数量和情绪分布，不需要每轮先查。

默认不限制人物；只有用户明确点名时才传 `collection`。无匹配时换相近情绪，关闭插件时不能绕过开关去调用脚本。

给需要配图的会话加上这段规则即可：

> QQ 普通回复和主动搭话每个实际回复轮次配一张表情，分条文字共享一张，静默不发图。先判断情绪，调用 sticker_pick，把实际返回的 markdown 原样放在最终正文末尾，前面空一行。有 [QQ] 块时，图片也放在块内。不要解释选图过程，不另行发送，由 QQ 桥处理。

每轮一张由工具说明和会话规则落实，插件不会在模型漏图时强制补图。它只负责选图，不改 QQ 登录、绑定或群权限，也不会把普通 DSH 回复自动当成 QQ 消息发送。

## 预览与记录

- 首次预览等概率选图，上一张/下一张按当前筛选结果的稳定顺序循环；只有一张时禁用切换。
- 修改情绪或人物筛选会清空旧预览；导航失败保留旧图，方便重试。
- 预览不发送 QQ，不写选图记录。聊天选图记录只作留痕，不改变下次概率，也不是 QQ 投递回执。
- 配置位于 `$DSH_HOME/stickers/config.json`，仅含 `enabled/libraryPath/pythonPath`。
- 选择记录位于 `$DSH_HOME/feiyu-chat/sticker-usage.json`；目录名沿用本插件最初的兼容入口。
- 桌面版和浏览器共用宿主相对图片地址，不要求桌面页面是 HTTP(S) 协议。

## 开发与检查

```shell
node test.mjs
node test-client.mjs
```

测试用临时图片、模拟工具宿主和设置页，不会发送真实 QQ 消息。可用 `STICKER_TEST_PYTHON` 指定测试 Python。宿主代码、前端注册脚本和 Python 选择器都是直接可用的源码，不需要额外构建。

本仓库只包含插件、示例索引、图标和测试，不包含用户表情图片、账号配置或聊天记录。代码与图标采用 [MIT License](LICENSE)。
