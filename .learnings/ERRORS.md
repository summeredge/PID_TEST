# Errors

## [ERR-20260818-001] PowerShell Select-String quoting

**Priority**: low
**Status**: resolved
**Area**: tools

### 摘要

在一次组合检查命令中，PowerShell 双引号转义导致 `Select-String` 的 `id="sp-input"` 搜索参数被错误拆分。

### 错误信息

```text
A positional parameter cannot be found that accepts argument 'sp-input\\'.
```

### 上下文

- 使用 PowerShell 检查 app.js 和 index.html 中的禁用属性。
- 改用单引号包裹搜索模式后验证通过。

### 元数据

- Reproducible: yes
- See Also: none

---

## [ERR-20260818-002] Playwright npm cache access

**Priority**: low
**Status**: pending
**Area**: tools

### 摘要

在受限 Windows 会话中使用 `npx --yes --package @playwright/cli playwright-cli` 时，npm 无法创建用户缓存临时目录，导致浏览器验证首次启动失败。

### 错误信息

```text
npm error code EPERM
npm error syscall mkdir
npm error path C:\Users\shaoy\AppData\Local\npm-cache\_cacache\tmp
```

### 上下文

- 在仓库根目录检查 `npx`、Node.js 和 npm 后启动 Playwright CLI。
- 需要改用可写缓存目录或获得真实 Windows 环境权限后重试。

### 元数据

- Reproducible: yes
- See Also: none

---

## [ERR-20260818-003] Playwright package typo

**Priority**: low
**Status**: resolved
**Area**: tools

### 摘要

一次 Playwright CLI 调用误写为不存在的 `@openai/cli` 包，导致 npm 返回 404。

### 错误信息

```text
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@openai%2fcli
```

### 上下文

- 在 Windows PowerShell 中启动本地页面的 Playwright 手工验收。
- 改用 `@playwright/cli` 后继续验证通过。

### 元数据

- Reproducible: yes
- See Also: ERR-20260818-002

---

## [ERR-20260818-004] Playwright negative fill argument

**Priority**: low
**Status**: resolved
**Area**: tools

### 摘要

Playwright CLI 的 `fill` 命令把未分隔的负数文本 `-100` 解析成了选项，导致扰动输入没有写入。

### 错误信息

```text
Unknown options: --0, --1
```

### 上下文

- 在 Windows PowerShell 中使用页面快照引用填写负的扰动幅值。
- 需要在文本参数前使用 `--` 结束 CLI 选项解析。

### 元数据

- Reproducible: yes
- See Also: none

---

## [ERR-20260818-005] Stop temporary server permission

**Priority**: low
**Status**: resolved
**Area**: tools

### 摘要

受限会话无法直接停止由提升权限启动的临时 localhost 服务进程。

### 错误信息

```text
Cannot stop process "python (38980)" because of the following error: 拒绝访问。
```

### 上下文

- 浏览器验收结束后，普通权限的 `Stop-Process` 被拒绝。
- 使用提升权限停止指定 PID，随后确认进程已退出。

### 元数据

- Reproducible: yes
- See Also: ERR-20260818-002

---
