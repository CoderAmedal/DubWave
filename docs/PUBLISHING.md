# 发布到 Chrome Web Store

面向本仓库（DubWave）的上架流程与检查清单。

## 0. 先看这个：决定能否上架的关键点

本扩展的语音合成依赖**用户本机运行的 Python 服务**（`helper/helper.py`，127.0.0.1:8758）。
Chrome Web Store 允许扩展与配套软件协作，但审核会关注两点：

1. **扩展本身是否仍提供可感知的功能**——如果没启动 helper 就完全不可用，容易被判
   “Minimum Functionality” 不足；
2. **安装说明是否清晰**——listing 与扩展内都要明确「需要在本机运行一个 TTS 服务」。

三条可选路线：

| 路线 | 做法 | 上架难度 | 用户体验 |
|---|---|---|---|
| A（已实现） | `chrome.tts` 兜底，helper 不可用时用浏览器内置语音 | 低 | 装完即可用，音质一般 |
| B | helper 打包成 native messaging host，另发安装包 | 中（需说明外部依赖） | 音质好，但安装步骤多 |
| C | 不上架，只发 GitHub Release / Edge 商店 | 无 | 需要手动加载 |

下面的流程按 **A** 写；若先按现状提交，方案 C 更稳妥。

## 1. 注册开发者账号

1. 打开 <https://chrome.google.com/webstore/devconsole>
2. 用 Google 账号登录，支付 **一次性 5 美元** 注册费（信用卡）
3. 填写开发者名称与联系邮箱（会公开显示，后续审核邮件也发到这里）
4. 建议开启两步验证，账号被盗会导致已上架扩展被下架

## 2. 准备上架物料

| 物料 | 要求 | 本项目现状 |
|---|---|---|
| 扩展包 | zip，manifest 在根目录 | `tools/package.sh` 生成 |
| 图标 | 128×128 PNG | `icon/icon128.png` ✅ |
| 截图 | 1280×800 或 640×400，1–5 张 | 需补 |
| 小型宣传图 | 440×280 | 需补（可选） |
| 商店图标 | 128×128 | 复用 icon128 |
| 名称 | ≤45 字符 | `DubWave（视频字幕配音）` |
| 简介 | ≤132 字符 | 见下方文案 |
| 详细描述 | 说明功能、用法、限制 | 见下方文案 |
| 隐私政策 URL | 必须可公开访问 | `PRIVACY.md` 需挂到 GitHub Pages |
| 单用途说明 | 一句话说明唯一用途 | 「把视频字幕翻译并朗读出来」 |
| 权限理由 | 每个 host 权限都要写 | 见 `PRIVACY.md` 的权限表 |

> 截图建议：播放器带双语字幕的画面、选轨面板、设置页。
> 不要用 YouTube/Bilibili 的商标做图标或主视觉。

## 3. 打包

```bash
bash tools/package.sh        # 输出 dist/dubwave-<version>.zip
```

脚本只打包 `manifest.json`、`src/`、`icon/`、`LICENSE`，
不含 `docs/`、`helper/`、`openspec/`、`.hermes/`。

## 4. 创建商店条目

1. Developer Dashboard → **New item** → 上传 zip
2. **Store listing**：填名称、简介、详细描述、截图、分类（Productivity）
3. **Privacy practices**：
   - 声明是否收集用户数据。本项目**不收集**，但会处理「网站内容」（字幕）与「用户活动」，需如实勾选
   - 说明用途：字幕翻译与语音合成
   - 不上传到自有服务器，只调用 Google 翻译 / B 站接口 / 本机 TTS
   - 填写隐私政策 URL
4. **Permissions justification**：逐个填写，参考 `PRIVACY.md`
5. 选择发布范围（公开 / 不公开测试）

## 5. 提交审核

- 点击 **Submit for review**
- 首次审核通常 **1–3 天**，涉及敏感权限可能 1–2 周
- 审核期间可以继续改代码，但重新提交会排队
- 被拒会收到邮件 + Dashboard 提示，按提示修改后可重新提交，**不要重复提交同一版本**

## 6. 常见拒审原因与对策

| 原因 | 本项目的风险点 | 对策 |
|---|---|---|
| Single Purpose | 同时支持 YouTube + B 站、翻译 + TTS | 描述统一表述为「视频字幕配音」这一个用途 |
| Minimum Functionality | 没启动 helper 就不可用 | 路线 A：加 `chrome.tts` 兜底 |
| 远程代码 | 无（代码全在包内） | 保持不引入 CDN 脚本 |
| 权限过宽 | 只申请了具体域名 | 不要改成 `<all_urls>` |
| 数据披露不符 | 处理字幕文本 | 在 Privacy practices 中如实勾选「Website content」 |
| 商标使用 | 描述里出现 YouTube / Bilibili | 用「支持主流视频网站」或加“非官方”声明 |

## 7. 审核通过后

- 商店条目会生成固定 ID，后续更新直接上传新版本 zip
- 版本号必须递增（`0.3.0` → `0.3.1`），manifest 与 zip 内一致
- 更新同样要过审核，通常几小时到 1 天

## 8. 备选分发渠道

- **Edge Add-ons**：同一份 MV3 包可直接提交，审核通常更快
- **GitHub Releases**：附 zip + 安装说明，适合开发版
- **自托管 crx**：需用户开启开发者模式，不推荐给普通用户
