# 隐私政策 / Privacy Policy

DubWave（以下简称“本扩展”）不收集、不上传、不出售任何个人数据。

## 本扩展处理的数据

| 数据 | 用途 | 是否离开本机 |
|---|---|---|
| 当前视频的字幕文本 | 翻译与语音合成 | 是，发送到所选的翻译服务 |
| 页面 URL / 视频 ID | 关联字幕与设置 | 否 |
| 目标语言、音色、字幕模式等设置 | 记住用户偏好 | 否，保存在 `chrome.storage.local` |

## 网络请求

- **翻译**：字幕文本会发送到 `translate.googleapis.com`（默认）或用户自行配置的 OpenAI 兼容接口。
- **Bilibili 字幕**：使用用户当前登录态请求 `api.bilibili.com`，仅用于获取该视频的字幕。
- **语音合成**：文本发送到用户本机运行的 TTS 服务（默认 `http://127.0.0.1:8758`），该服务使用 Microsoft Edge 的在线语音接口；本扩展自身不向该接口发送数据。

## 存储

扩展只在本地保存设置项（目标语言、音色、翻译引擎、字幕显示方式、上次选择的字幕轨）。
不保存字幕内容，不写入远程数据库。

## 权限说明

| 权限 | 原因 |
|---|---|
| `storage` | 保存用户设置 |
| `https://www.youtube.com/*` | 读取播放器字幕、注入配音按钮 |
| `https://*.bilibili.com/*`、`https://api.bilibili.com/*`、`https://aisubtitle.hdslb.com/*` | 获取 B 站字幕 |
| `https://translate.googleapis.com/*` | 翻译字幕 |
| `http://127.0.0.1:8758/*`、`http://localhost:8758/*` | 调用用户本机的 TTS 服务 |

## 第三方

本项目不含分析、广告或追踪 SDK。

## 联系方式

如有疑问，请通过项目仓库的 Issue 反馈：<https://github.com/CoderAmedal/DubWave>

最后更新：2026-10-23
