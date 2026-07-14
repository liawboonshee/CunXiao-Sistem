 # 存销系统 · 免费语音版

`inventory-v1` 分支的 Android APK 已改为免费语音记账。

## 免费原理

- 语音转文字：Android 手机语音识别（`@capacitor-community/speech-recognition`）
- 指令理解：APK 内置本地规则解析
- 回答播报：Android 手机文字转语音
- 库存、客户、欠款与交易记录：保存在本机

APK 运行时不调用 OpenAI、AI Platform、Cloudflare Worker 或 `/api/chat`，不需要 API Key、Proxy Token 或 Worker 地址。

> 注：部分 Android 手机自带的语音识别需要网络，但不会使用仓库拥有者的 AI 额度。

## 可说的指令

- `进货10克，成本60`
- `卖给阿明5克，收300`
- `卖给阿明1克，总价10，欠5`
- `现在库存多少`
- `今天收入多少`
- `今天利润多少`
- `阿明欠款多少`
- `最近一笔交易`

支持中文数字、小数、公斤/克/毫克，重量最小 `0.01g`。

## GitHub 自动生成 APK

1. 打开仓库的 **Actions**。
2. 选择 **Build Android APK**。
3. 点 **Run workflow**，分支选 `inventory-v1`。
4. 完成后在 **Artifacts** 下载 `CunXiao-Free-Voice-v1.3`。

构建不再需要设置任何 AI 密钥。

## 本地构建

```bash
cd client
npm ci
npm run verify:free
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

APK 输出：`client/android/app/build/outputs/apk/debug/app-debug.apk`

## 数据与更新

应用包名仍为 `com.chatgpt.voice.pro`，用来延续旧版的本机库存资料。此版版本号为 `1.3-free-voice`（`versionCode 4`）。

`worker/`、`server/` 和 `AI语音助手-交付包/` 是旧版云端助手的保留资料，当前免费语音 APK 不会引用它们。
