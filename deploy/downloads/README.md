# 官网媒体部署

`index.html` 和 `media/` 内的图片发布到 A 服务器的 `/srv/rift-buddy-downloads/`。保留现有安装包、更新清单和其他服务。

首页播放器和根目录 README 共用以下宣传片。视频通过官网分发，不提交大文件到 Git。

| 文件 | 校验 |
| --- | --- |
| `media/rift-buddy-1.0-promo-7a9911ac.mp4` | 118886552 字节；SHA-256 `7a9911acef7f4ba731013def27e263bea9d02be1dc59ff64d38c84ab54f0af3f` |
| 规格 | 144 秒；1920 × 1080；60 fps；H.264 + AAC；MP4 faststart |

先上传并校验视频和封面，再替换首页。两个官网入口的 `/downloads/*` CSP 需要包含 `media-src 'self'`；保留其余策略及其他项目路由。使用 Caddy 原生静态文件服务，核验 `Content-Type: video/mp4`、HTTP Range 的 `206` 响应、实际播放与拖动进度。

页面采用原生播放器，保留声音和全屏控制；`preload="none"` 避免首次打开就下载完整视频。海报直接取自该成片，点击后播放完整版。
