# Changelog

<!-- SCHEMA: {"ts":"ISO-8601","action":"add|promote|extract|resolve","type":"learning|error|feature","id":"entry ID","summary":"≤100字","target":"晋升目标(可选)"} -->

```jsonl
{"ts":"2026-08-18T16:02:01+08:00","action":"add","type":"learning","id":"LRN-20260818-001","summary":"AUTO 可编辑 SV、MAN 可编辑 MV，模式输入禁用条件必须分别定义"}
{"ts":"2026-08-18T16:02:01+08:00","action":"add","type":"error","id":"ERR-20260818-001","summary":"PowerShell Select-String 双引号转义导致搜索参数拆分，改用单引号"}
{"ts":"2026-08-18T16:20:00+08:00","action":"add","type":"error","id":"ERR-20260818-002","summary":"受限 Windows 会话无法创建 npm Playwright 缓存临时目录"}
{"ts":"2026-08-18T16:24:00+08:00","action":"add","type":"error","id":"ERR-20260818-003","summary":"Playwright CLI 包名误写为 @openai/cli，npm 返回 404，改用 @playwright/cli"}
{"ts":"2026-08-18T16:26:00+08:00","action":"add","type":"error","id":"ERR-20260818-004","summary":"Playwright fill 的负数参数被解析为选项，使用 -- 结束选项解析"}
{"ts":"2026-08-18T16:29:00+08:00","action":"add","type":"error","id":"ERR-20260818-005","summary":"普通权限无法停止提升权限启动的临时 localhost 服务，改用提升权限停止指定 PID"}
{"ts":"2026-08-19T09:27:02+08:00","action":"add","type":"learning","id":"LRN-20260819-001","summary":"每周期贡献趋势需按控制器 DT 采样，避免瞬时 P/D 响应被慢采样遗漏"}
```
