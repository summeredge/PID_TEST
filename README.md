# PID Loop Trainer

轻量、纯前端的 DCS 风格 PID 过程控制教学仿真。页面没有后端、数据库或构建步骤，适合直接作为 GitHub Pages 静态站点发布。
https://summeredge.github.io/PID_TEST/

## 功能

- 实时显示 PV、SP、OP，并提供清晰的 AUTO / MAN 状态。
- 固定 `dt = 0.5 s` 的 FOPDT 过程模型：`Gain`、`Tau`、`Dead Time`。
- ISA / Ideal 形式 PID：`Kc`、`Ti`、`Td`；微分作用于 PV，OP 限制在 0–100%。
- MAN 模式可直接编辑 OP；AUTO ↔ MAN 使用基础 bumpless transfer。
- SP Step（50 → 70）、可调幅值的 Load Disturbance、Reset。
- SP/PV 与 OP 两张原生 Canvas 实时滚动趋势图，不依赖第三方库。

## 本地运行

直接双击 `index.html` 即可打开。若希望模拟 GitHub Pages 的静态服务器，也可以在仓库根目录运行：

```text
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。

## GitHub Pages

这是无构建静态站点。将仓库发布源设置为包含 `index.html` 的分支根目录（或将该目录作为 Pages 发布目录）即可。页面只依赖浏览器原生 HTML、CSS、JavaScript 和 Canvas API。

## 仿真说明

过程动态采用：

```text
dPV/dt = [Gain × (OP + Load) − PV] / Tau
```

纯滞后通过内部 FIFO 延迟缓冲实现，而不是平移趋势数据。趋势每 `1.0 s` 记录一次，并保留最近 300 s。Reset 会恢复默认参数、默认工况、控制模式、积分与微分历史、延迟缓冲、扰动和趋势数据。

默认工况：

```text
SP = 50       PV = 50       OP = 50       MODE = AUTO
Kc = 2        Ti = 20 s     Td = 2 s
Gain = 1      Tau = 30 s    Dead Time = 5 s
```

## 课堂验证建议

1. 点击 `SP Step`，观察 PV 的跟踪、超调和 OP 动作。
2. 增大 `Kc`，比较响应速度和振荡趋势；改变 `Ti`、`Td` 观察积分与微分影响。
3. 增大 `Tau` 或 `Dead Time`，观察过程变慢和控制难度增加。
4. AUTO 运行时切到 MAN，修改 OP，再切回 AUTO，观察输出是否平滑接管。
5. 打开 `Load Disturbance`，观察闭环恢复；最后点击 `Reset` 检查趋势和状态是否完整清零恢复。
