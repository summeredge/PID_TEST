# PID Loop Trainer

轻量、纯前端的 DCS 风格 PID 过程控制教学仿真。页面没有后端、数据库或构建步骤，适合直接作为 GitHub Pages 静态站点发布。
https://summeredge.github.io/PID_TEST/

## 功能

- 实时显示 PV、SV、MV，并提供清晰的 AUTO / MAN 状态。
- 固定 `dt = 0.5 s` 的 FOPDT 过程模型：`Gain`、`Tau`、`Dead Time`。
- 可切换三种过程模型：`FOPDT`、`Integrating / IPDT`、`SOPDT`。
- 仿真倍速：`1× / 2× / 5× / 10×`，默认 `1×`。
- Yokogawa 增量式 PID：`PB (%)`、`Ti`、`Td`；界面同时显示只读等效 `Kc`，MV 限制在 0–100%。
- MAN 模式可直接编辑 MV；AUTO ↔ MAN 使用基础 bumpless transfer。
- SV Step（50 → 70）、可调幅值的 Load Disturbance、Reset。
- PV / SV / MV 单一原生 Canvas 实时滚动趋势图，不依赖第三方库。

界面采用 DCS 常用术语：`SV = Set Value`、`PV = Process Value`、`MV = Manipulated Value`。

本页面 PID 参数采用 Yokogawa/CENTUM 常见比例带表达：`PB (%) = 100 / Kc`。因此 PB 越小表示比例作用越强。为保持现有 `Kc` 最大值 50，PB 最小值设为 2%。

## Yokogawa PID Algorithms

控制器采用固定 `dt = 0.5 s` 的增量式（velocity form）计算，算法选择及各项输入如下：

| Algorithm | P | I | D |
| --- | --- | --- | --- |
| PID | Deviation | Deviation | Deviation |
| I-PD | PV | Deviation | PV |
| PI-D | Deviation | Deviation | PV |

默认算法为 `I-PD`。本仿真采用 `e = SV − PV`，以匹配当前正增益过程模型；这只是控制方向的符号约定，不改变 Yokogawa PID / I-PD / PI-D 的输入变量定义。

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

仿真倍速只改变仿真时间相对于真实时间的推进速度。内部数值计算始终保持固定 `dt = 0.5 s`，因此改变倍速不会改变 PID 和 FOPDT 的离散计算参数。Reset 会保留当前倍速选择。

### 三种过程模型

- `FOPDT`：`G(s) = K e^(-θs) / (τs + 1)`，输出改变后 PV 最终达到新的稳定值，适合温度、压力、流量等自衡过程。
- `Integrating / IPDT`：`G(s) = K e^(-θs) / s`，`OP = 50%` 时保持平衡，偏离该 Bias 后 PV 持续变化，适合液位等非自衡过程。Gain 单位为 `PV unit / (%OP · s)`。
- `SOPDT`：`G(s) = K e^(-θs) / ((τ1s + 1)(τ2s + 1))`，由两个串联一阶惯性环节组成，响应更缓慢、更平滑。

默认工况：

```text
SV = 50       PV = 50       MV = 50       MODE = AUTO
Algorithm = I-PD
PB = 50%      Kc = 2        Ti = 20 s     Td = 2 s
Gain = 1      Tau = 30 s    Dead Time = 5 s
```

## 课堂验证建议

1. 点击 `SV Step`，观察 PV 的跟踪、超调和 MV 动作。
2. 减小 `PB`（等效增大 `Kc`），比较响应速度和振荡趋势；改变 `Ti`、`Td` 观察积分与微分影响。
3. 增大 `Tau` 或 `Dead Time`，观察过程变慢和控制难度增加。
4. AUTO 运行时切到 MAN，修改 MV，再切回 AUTO，观察输出是否平滑接管。
5. 打开 `Load Disturbance`，观察闭环恢复；最后点击 `Reset` 检查趋势和状态是否完整清零恢复。
