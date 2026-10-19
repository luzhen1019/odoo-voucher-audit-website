# 财务凭证校验 · 独立网站

Odoo 19 自定义模块 `voucher_audit` 的独立展示站。与 Odoo 系统本身完全分离：**不修改、不依赖、不启动 Odoo 也能打开**。

## 在线访问

- 在线演示：<https://zth183.github.io/odoo-voucher-audit-website/>
- 源码仓库：<https://github.com/Zth183/odoo-voucher-audit-website>

本地打开：直接双击本目录下的 `index.html`，或用浏览器打开：

```text
C:\Users\28607\Desktop\Odoo-VoucherAudit-Website\index.html
```

无需服务器与构建步骤。页面本体离线可用；字体走 Google Fonts，Excel 导入用的 SheetJS 走 cdnjs，离线时字体自动回退，CSV 导入仍可正常使用。

## 在线试用（核心功能）

页面顶部的 `#try` 区块不是截图，而是把 `voucher_audit` 的校验逻辑移植到浏览器后真正可操作的校验台：

- **规则配置**：R001–R010 逐条启停，容差、最大账龄、允许科目、费用限额、供应商黑名单、审批金额阈值可直接修改；改动即时重算，并写入 `localStorage`（隐私模式下写入失败会被忽略）。
- **数据导入**：Excel `.xlsx / .xlsm / .xls`（SheetJS）与 `.csv / .txt`（内置解析，UTF-8 / GBK 自动识别、分隔符探测）；支持按钮选择和拖拽导入；自动识别凭证表头，至少需要凭证号、日期、科目、供应商、发票号、金额中的 4 列。
- **实时校验**：借贷平衡、重复发票（批内 + 历史）、金额符号、期间逻辑、必填字段、科目合规、差旅 / 招待限额、供应商黑名单、审批层级，共 10 条规则，结果分「通过 / 警告 / 异常」。
- **异常清单**：5 个指标（总行数、通过、警告、异常、通过率）、按结果筛选、按凭证号 / 供应商 / 发票号 / 科目 / 异常码搜索、点击说明展开全部命中原因。
- **导出与模板**：一键导出当前全部结果 CSV（UTF-8 BOM，Excel 直接打开不乱码），并可下载带两行借贷平衡示例的 CSV 导入模板。
- **内置样例**：36 行合成凭证明细，打开页面自动载入；结果固定为 **通过 11 / 警告 5 / 异常 20，通过率 30.56%**，与 Odoo 模块和 Python 单测一致。
- **数据边界**：解析与校验全部在浏览器本地完成，不上传、不写入 Odoo；关闭页面后只保留规则配置，不保留导入的业务数据。

## 内容

| 区块 | 说明 |
|---|---|
| Hero | 项目定位与 5 个关键指标 |
| 在线试用 | 可操作的规则配置 + 数据导入 + 实时校验 + 异常清单 + CSV 导出 |
| 概览 | 痛点 / 做法 / 结果 |
| 演示 | 57 秒录屏（WebM） |
| 功能 | 6 项能力范围 |
| 规则 | R001–R010 完整清单、类型、级别、阈值 |
| 截图 | 14 张实机截图，点击放大 |
| 数据 | 36 行样例的校验结果与单元测试 |
| 文档 | 业务需求文档、用户操作手册 PDF |
| 真实性边界 | 明确项目能做到与不能做到的范围 |

## 中英双语

右上角 `中文 / EN` 切换。选择会写入 `localStorage`，下次打开保持；隐私模式下写入失败会自动忽略，不影响页面。

实现方式：所有文案成对写在 `.zh` / `.en` 中，由 `html[data-lang]` 控制显隐；标题、`<h1>`、表格、按钮、图表说明均已覆盖。

## 目录

```text
Odoo-VoucherAudit-Website\
  index.html                     单页站点（样式与脚本内联）
  DESIGN.md                      IBM Carbon 设计规范
  assets\
    01-rules.png … 14-end.png    14 张系统截图
    demo-data.js                 36 行合成样例（window.VOUCHER_SAMPLE）
    validator.js                 R001–R010 浏览器版校验引擎（window.VoucherEngine）
    requirements.pdf             业务需求文档
    user-manual.pdf              用户操作手册
    voucher-audit-demo.webm      57 秒实机录屏
```

## 部署

纯静态文件，当前已通过 GitHub Pages 从 `main` 分支根目录发布。也可以直接放到任意静态托管（Nginx、Cloudflare Pages、对象存储）；保持 `index.html` 与 `assets\` 的相对路径不变即可。

若托管环境不支持 WebM，可把 `assets\voucher-audit-demo.webm` 转成 MP4 并在 `<video>` 里补一个 `<source>`；页面已提供降级链接。

## 设计

按 IBM Carbon Design System 实现：

- IBM Blue `#0f62fe`、ink `#161616`、canvas `#ffffff`、surface `#f4f4f4`、hairline `#e0e0e0`
- 直角、无阴影、1px 分隔线；正文 16px / 字距 0.16px；展示标题 300 字重
- IBM Plex Sans / Plex Sans SC / Plex Mono
- 深色仅用于页脚，整体为单一浅色视觉世界（设计上有意为之）

## 真实性边界

本站展示的是 **Odoo 19 上的个人实践项目**，模拟 SAP FI 应付凭证校验场景：

- 不是 SAP 系统操作、SAP 配置或 SAP 项目上线经验；
- 不是生产部署，没有真实客户项目或真实业务数据；
- 不含 OCR、票据图片识别或真实 LLM API 调用；
- 在线试用是校验逻辑的浏览器移植版，用于演示与自查，不是 Odoo 服务端本身；
- 开发过程为 Vibe Coding（AI 辅助编码）；
- 样例供应商、金额、发票号均为合成数据；导入的数据只留在当前浏览器页面内。

演示地址 `http://127.0.0.1:8069/web/login?db=practice` 与 `admin / admin` 仅适用于本机演示环境。
