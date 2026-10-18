# Gemini Batch Script

在 Gemini 网页中批量生成音乐和图片的 Tampermonkey 脚本，当前版本 **v0.6**。

## 功能

- 音乐、图片两个模式，各自保存提示词版本和参数。
- 按顺序生成，支持设置次数、秒数间隔和中途停止。
- 本地随机微调：保留基础提示词，随机增删改少量附加要求，无需模型 API。
- 收集音乐或图片，完成后统一打包 ZIP，附带每轮提示词和批次清单。
- 支持浅色 / 深色主题、提示词库备份及未收集文件重试。

## 安装与使用

1. 在浏览器安装 Tampermonkey，并登录 Gemini。
2. 新建用户脚本，将 [gemini_music_batch.user.js](gemini_music_batch.user.js) 的全部内容复制进去并保存；更新时直接替换原脚本。
3. 打开 Gemini，在页面选择音乐或图片工具，并在脚本面板选择相同模式。
4. 编辑提示词，设置生成次数、间隔秒数和下载方式，点击开始。

完整说明见 [使用说明.md](使用说明.md)。

脚本使用 Gemini 网页现有功能和额度。网页改版可能影响生成或下载；实际下载结果请在浏览器下载列表确认。批次文件缓存位于标签页内存中，刷新或关闭前请保存结果。

## 项目文件

```text
gemini_music_batch.user.js   可直接安装的脚本，也是后续维护的源文件
使用说明.md                  v0.6 使用说明
tests/core.test.cjs          随机微调与秒数迁移测试
```

安装 Node.js 后，在项目目录运行：

```sh
node --check gemini_music_batch.user.js
node tests/core.test.cjs
```

测试覆盖随机逻辑和参数迁移；真实 Gemini 页面及媒体下载需要另行检查。

## 用 GitHub Desktop 管理后续版本

本仓库从 **v0.6** 建立版本历史，标签 `v0.6` 标记此时的代码。

每次修改按下面的顺序操作：

1. 在此项目目录修改文件，功能变更时同步更新脚本头部的 `@version` 和说明。
2. 打开 GitHub Desktop，选择 **gemini-batch-script**。
3. 在 **Changes** 查看本次修改；点击文件可以看到具体差异。
4. 在 **Summary** 写一句修改说明，例如“修复图片下载重试”。
5. 点击 **Commit to main**，保存一个本地版本。
6. 点击 **Push origin**，把提交上传到 GitHub。

**History** 用来查看以往提交。开始新一轮修改前，可点击 **Fetch origin** 检查远端；若显示 **Pull origin**，先同步更新。

| 名称 | 含义 |
|---|---|
| Commit | 在本机保存一次有说明的版本快照 |
| Push | 把本地提交上传到 GitHub |
| Pull | 把 GitHub 的更新同步到本机 |
| Tag | 给某个提交命名，例如 `v0.6` |

以后以此仓库目录为准继续维护。浏览器里已经安装的脚本仍需用新代码更新。
