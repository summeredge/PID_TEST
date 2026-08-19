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

## [LRN-20260819-001] best_practice

**Priority**: medium
**Status**: resolved
**Area**: config

### 内容

控制器固定步长为 `0.5 s` 而趋势原先每 `1.0 s` 采样时，标准 PID 的瞬时 P/D 增量可能在趋势记录前被下一周期抵消；每周期贡献图必须与主趋势使用控制周期采样，才能保留实际瞬态。

### 建议修复

新增控制器周期贡献曲线时，复用主趋势的历史、时间窗口和清理逻辑，并让两张图都按 `DT` 记录；不要只在较慢的显示采样点读取最后一项贡献。

### 元数据

- Source: task_review
- Pattern-Key: per-cycle-trend-sampling

---
