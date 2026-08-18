# Learnings

## [LRN-20260818-001] correction

**Priority**: medium
**Status**: resolved
**Area**: config

### 内容

状态相关输入必须按控制模式分别处理：AUTO 状态下 SV 可编辑、MV 不可编辑；MAN 状态下 SV 不可编辑、MV 可编辑。不能把同一个 `isAuto` 条件同时用于两个输入的禁用逻辑。

### 建议修复

实现状态 UI 时先列出每个模式的可编辑矩阵，再分别设置 `spInput.disabled = !isAuto` 和 `opInput.disabled = isAuto`，并用浏览器验证两个状态。

### 元数据

- Source: correction
- Pattern-Key: mode-dependent-editability

---
