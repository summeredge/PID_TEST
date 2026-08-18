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
