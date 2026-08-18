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
