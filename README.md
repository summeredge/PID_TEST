# PID Loop Trainer

轻量、纯前端的 DCS 风格 PID 过程控制教学仿真。页面没有后端、数据库或构建步骤，适合直接作为 GitHub Pages 静态站点发布。
https://summeredge.github.io/PID_TEST/

## 功能

- 实时显示 PV、SV、MV，并提供清晰的 AUTO / MAN 状态。
- 固定 `dt = 0.5 s` 的 FOPDT 过程模型：`Gain`、`Tau`、`Dead Time`。
- 可切换三种过程模型：`FOPDT`、`Integrating / IPDT`、`SOPDT`。
- 仿真倍速：`1× / 2× / 5× / 10×`，默认 `1×`。
- Yokogawa 增量式 PID：`PB (%)`、`Ti`、`Td`；界面同时显示只读等效 `Kc`，MV 限制在 0–100%。
- PV RANGE：以工程单位输入/显示 `LRV`、`URV`、`Unit`，并实时显示 DCS PV、SV、Error 的 `%Span`；SV 量程跟随 PV Range。
- MAN 模式可直接编辑 MV；AUTO ↔ MAN 使用基础 bumpless transfer。
- 直接修改 SV 可进行设定值阶跃实验；支持 Step / Square / Sine 三种负荷扰动、Pause / Resume 和 Reset。
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

默认算法为 `I-PD`。本仿真采用 `e = SV − DCS PV`，以匹配当前正增益过程模型；这只是控制方向的符号约定，不改变 Yokogawa PID / I-PD / PI-D 的输入变量定义。

### PV Range / %Span

过程模型内部的 `state.pv` 是 Process Raw PV，可以继续超出 LRV / URV；DCS 画面、趋势和 PID 使用独立的 DCS PV 信号。控制器计算前使用当前合法量程转换为 `%Span`：

```text
Raw PV% = 100 × (Raw PV − LRV) / (URV − LRV)
DCS PV% = clamp(Raw PV%, -4.5, 104.5)
DCS PV EU = LRV + DCS PV% / 100 × (URV − LRV)
SV% = 100 × (SV − LRV) / (URV − LRV)
Error% = SV% − DCS PV%
```

其中 `Span = URV − LRV`，必须满足 `URV > LRV`。非法量程会标记输入并继续使用最近一次合法量程，不会交换 LRV / URV，也不会让 PID 进入除零或 `NaN` 计算。SV 始终限制在 `LRV…URV`（`0…100 %Span`），并同步输入框的 `min` / `max`。在线修改量程不会截断 Raw PV、重置 PV、SV、MV、过程或趋势；AUTO 下第一个周期保持当前 MV，并同步 PID 的 DCS `%Span` 历史，避免人为 P/D 尖峰。

例如，量程为 `0…200 °C` 时，Raw PV 为 `220 °C` 对应 `Raw PV% = 110%`，但 DCS PV 为 `104.5%`、`209 °C`。这表示 measurement/input over-range saturation，不表示物理过程停止变化；Raw PV 仍由过程模型继续演化。下超量程同理，DCS PV 最低为 `-4.5%`。

PB 的定义保持不变：`Kc = 100 / PB`。因此在相同 PB 下，同一个工程量偏差的量程越大，控制器看到的 `%Span` 偏差越小，比例作用越弱。反过来，如果两个工况的 `%Span` 偏差相同，比例响应应基本相同。

趋势图内部使用 `DCS PV / SV = %Span` 和 `MV = %`，三条曲线共用至少覆盖 `-4.5…104.5` 的百分数轴；Loop Summary 显示 DCS PV / SV 工程值，MV 仍显示百分比。

I-PD 的 P、D 项作用于 PV，I 项作用于 Deviation。要观察量程对 I-PD P/D 敏感度的影响，应使用 Step / Square / Sine Load Disturbance 制造 PV 变化，而不是只做 SV 阶跃。PI-D / PID 的 P 项作用于 Deviation，可以通过 SV 变化观察。

## 本地运行

直接双击 `index.html` 即可打开。若希望模拟 GitHub Pages 的静态服务器，也可以在仓库根目录运行：

```text
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。

数值回归测试使用 Node.js 内置测试运行器：

```text
node --test tests/pv-range.test.js
```

## GitHub Pages

这是无构建静态站点。将仓库发布源设置为包含 `index.html` 的分支根目录（或将该目录作为 Pages 发布目录）即可。页面只依赖浏览器原生 HTML、CSS、JavaScript 和 Canvas API。

## 仿真说明

过程动态采用：

```text
dPV/dt = [Gain × (MV + Disturbance) − PV] / Tau
```

纯滞后通过内部 FIFO 延迟缓冲实现，而不是平移趋势数据。趋势每 `0.5 s` 记录一次，并保留最近 300 s。Reset 会恢复默认参数、默认工况、控制模式、积分与微分历史、延迟缓冲、扰动和趋势数据。

仿真倍速只改变仿真时间相对于真实时间的推进速度。内部数值计算始终保持固定 `dt = 0.5 s`，因此改变倍速不会改变 PID 和 FOPDT 的离散计算参数。Reset 会保留当前倍速和 Pause 状态。

### 负荷扰动

负荷扰动注入过程输入，而不是直接修改 PV：

```text
effective input = MV + Disturbance
```

- `Step`：恒定输入偏置，默认 `Amplitude = -15%`，用于观察最大偏差、恢复时间、稳态偏差和 MV 补偿量。
- `Square`：零均值的周期性矩形扰动，在每个周期内依次施加 `+A` 和 `-A`。
- `Sine`：周期性正弦扰动，用于观察闭环对周期负荷变化的抑制能力。

`Period` 仅对 `Square` 和 `Sine` 显示，范围为 `5–600 s`，默认 `60 s`。周期和波形都使用仿真时间计算，因此改变 `1× / 10×` 倍速只改变观看速度，Pause 时过程、PID、Dead Time、扰动相位和趋势会一起冻结。开启扰动或切换扰动类型会从当前仿真时刻重新开始波形周期；关闭扰动时输入偏置恢复为零。

建议教学范围：`5–10%` 为小扰动，`10–20%` 为常规教学扰动，`20–30%` 为强扰动；超过 `30%` 时可能较快进入 MV `0–100%` 饱和场景。`Ti = 0` 时不要期待积分自动消除自衡过程的稳态偏差。

### 三种过程模型

- `FOPDT`：`G(s) = K e^(-θs) / (τs + 1)`，输出改变后 PV 最终达到新的稳定值，适合温度、压力、流量等自衡过程。
- `Integrating / IPDT`：`G(s) = K e^(-θs) / s`，`OP = 50%` 时保持平衡，偏离该 Bias 后 PV 持续变化，适合液位等非自衡过程。Gain 单位为 `PV unit / (%OP · s)`。
- `SOPDT`：`G(s) = K e^(-θs) / ((τ1s + 1)(τ2s + 1))`，由两个串联一阶惯性环节组成，响应更缓慢、更平滑。

默认工况：

```text
SV = 50       PV = 50       MV = 50       MODE = AUTO
Algorithm = I-PD
PB = 100%     Kc = 1        Ti = 20 s     Td = 0 s
Gain = 1      Tau = 30 s    Dead Time = 3 s
```

## 课堂验证建议

1. 直接修改 SV，观察 PV 的跟踪、超调和 MV 动作。
2. 减小 `PB`（等效增大 `Kc`），比较响应速度和振荡趋势；改变 `Ti`、`Td` 观察积分与微分影响。
3. 增大 `Tau` 或 `Dead Time`，观察过程变慢和控制难度增加。
4. AUTO 运行时切到 MAN，修改 MV，再切回 AUTO，观察输出是否平滑接管。
5. 打开 `Load Disturbance`，观察闭环恢复；最后点击 `Reset` 检查趋势和状态是否完整清零恢复。
6. 将 `Algorithm = PI-D`、`PB = 50%`、`Ti = 0`、`Td = 0`，保持 `PV = 50`、`SV = 60`，比较 `0–100` 与 `0–200` 量程：Error `%Span` 应从 `10%` 变为 `5%`，比例作用约减半。
7. 保持 `10%Span` 偏差：分别使用 `0–100 / PV=50 / SV=60` 和 `0–200 / PV=100 / SV=120`，比例响应应基本相同。
8. 使用默认 `I-PD` 配合 Load Disturbance 比较 `0–100` 与 `0–200`，观察相同工程 PV 变化在更大量程下产生更小的 PV `%Span` 变化。