[English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | **简体中文**

> 本文档是 [README.md](README.md)（英文版）的简体中文翻译。如有出入，以英文版为准。

# ParaFin

**面向有限元分析的参数化指尖几何生成器**

ParaFin 是一个基于浏览器的工具，用于生成并预览参数化的二维指尖截面模型。项目设置可以保存为 JSON，也可以导出与 Gmsh 兼容的 `.geo` 文件，用于有限元网格划分。

## 功能特性

- 参数化的指尖、组织层、骨骼和指甲几何
- 掌侧表面的指纹嵴线
- 表皮–真皮交界处的真皮乳头
- 完整视图和放大视图的 SVG 预览
- 使用 JSON 保存/加载项目
- 带物理组的 Gmsh `.geo` 导出
- 内嵌均匀或局部加密的网格尺寸设置
- 输入值会自动保存在浏览器中（`localStorage`），下次访问时恢复；如需重新开始，请使用 `Reset to Defaults`
- 无需安装、构建过程或 Web 服务器

## 快速开始

1. 打开[演示网站](https://sasekazu.github.io/ParaFin/)，或在现代浏览器中打开 `index.html`。应用程序完全在浏览器中运行。
2. 调整参数，然后点击 `Download GEO` 保存 `parafin-model.geo`。
3. 使用 [Gmsh](https://gmsh.info/) 将 GEO 文件转换为二维网格（`.msh`）：

```bash
gmsh parafin-model.geo -2 -o parafin-model.msh
```

如果使用 Gmsh 图形界面，请打开 `.geo` 文件，执行 `Mesh` → `2D`，然后通过 `File` → `Export` 保存网格。详情请参阅 [Gmsh GEO 导出](#gmsh-geo-导出)。

使用默认参数生成的文件（`.geo`、项目 `.json`，以及 MSH 4.1 和 MSH 2.2 两种格式的 `.msh`）已附在每个[发布版本](https://github.com/sasekazu/ParaFin/releases)中。可从[最新发布版本](https://github.com/sasekazu/ParaFin/releases/latest)下载。

## 预览操作

两个预览面板（完整截面和指纹细节）都支持缩放和平移。

| 操作 | 鼠标 / 触摸 | 键盘（面板获得焦点时） |
|---|---|---|
| 缩放 | 鼠标滚轮、双指捏合 | `+` / `-` |
| 平移 | 拖动 | 方向键 |
| 重置视图 | 双击 | `0` |
| 保存为图片 | 各视图中的 `SVG` / `PNG` 按钮 | |

在缩放或平移之前，每次修改参数或调整窗口大小时，各视图都会自动适配。缩放或平移之后将保持当前视图，双击视图（或按 `0` 键）可恢复自动适配。比例尺会随缩放级别变化。

预览下方的 `Display` 复选框可隐藏 X/Y 坐标轴和指纹细节视图（设置会被记住）。`SVG` / `PNG` 按钮会将当前显示的视图（包含当前缩放、已显示的坐标轴和比例尺）以白色背景原样保存；PNG 为屏幕尺寸的两倍。

通过页眉中的 `File name…` 按钮（可选）打开的输入框，可设置下载的 `.geo`、`.json` 和图片文件的基本名称（例如 `finger` → `finger.geo`、`finger.json`、`finger-cross-section.svg`）。留空则使用默认名称。也可以将 `.json` 文件拖放到页面上来加载项目；各参数旁的 `?` 按钮可显示简短说明。

## 参数

所有几何长度均以毫米为单位，角度以度为单位。

### 手指与组织层

| 符号 | 参数 | 项目 JSON 键 | 默认值 |
|---|---|---|---:|
| *w*<sub>f</sub> | 手指宽度 | `geometry.fingerWidth` | 20 mm |
| *h*<sub>f</sub> | 手指高度 | `geometry.fingerHeight` | 14 mm |
| *t*<sub>sc</sub> | 角质层厚度 | `geometry.stratumCorneumThickness` | 0.1 mm |
| *t*<sub>e</sub> | 表皮厚度 | `geometry.epidermisThickness` | 0.6 mm |
| *t*<sub>d</sub> | 真皮厚度 | `geometry.dermisThickness` | 0.8 mm |

### 骨骼与指甲

| 符号 | 参数 | 项目 JSON 键 | 默认值 |
|---|---|---|---:|
| *w*<sub>b</sub> | 骨骼宽度 | `geometry.boneWidth` | 6 mm |
| *h*<sub>b</sub> | 骨骼高度 | `geometry.boneHeight` | 3 mm |
| *e*<sub>b</sub> | 骨骼垂直偏移 | `geometry.boneOffsetY` | 2 mm |
| α<sub>n</sub> | 指甲角度范围 | `geometry.nailAngularExtent` | 108° |

骨骼在水平方向居中。指甲范围关于位于 90° 的背侧顶点对称。指甲厚度自动设为 *t*<sub>sc</sub> + *t*<sub>e</sub>。

### 指纹嵴线

| 符号 | 参数 | 项目 JSON 键 | 默认值 |
|---|---|---|---:|
| α<sub>r</sub> | 指纹请求角度范围 | `fingerprint.fingerprintAngularExtent` | 140° |
| λ<sub>r</sub> | 指纹波长 | `fingerprint.fingerprintWavelength` | 0.5 mm |
| *h*<sub>r</sub> | 指纹嵴线高度 | `fingerprint.fingerprintRidgeHeight` | 0.1 mm |

指纹嵴线以位于 270° 的掌侧顶点为中心。手指外边界和角质层内边界采用相位匹配的位移，因此角质层厚度沿局部法线方向保持一致。

嵴线数量向上取整，使波长数为奇数。因此，实际角度范围可能比请求值略大。如需光滑边界，请将 *h*<sub>r</sub> 设为 `0`。

### 真皮乳头

| 符号 | 参数 | 项目 JSON 键 | 默认值 |
|---|---|---|---:|
| α<sub>ed</sub> | 真皮乳头请求角度范围 | `dermalPapillae.epidermisDermisAngularExtent` | 140° |
| λ<sub>ed</sub> | 真皮乳头波长 | `dermalPapillae.epidermisDermisWavelength` | 1.0 mm |
| *h*<sub>ed</sub> | 真皮乳头高度 | `dermalPapillae.epidermisDermisHeight` | 0.2 mm |

真皮乳头独立于指纹设置而应用，并以表皮–真皮交界面上 270° 的位置为中心。其数量同样向上取整，使波长数为奇数，因此实际角度范围可能略微超过请求值。

如需光滑的交界面，请将 *h*<sub>ed</sub> 设为 `0`。非零值必须小于表皮厚度。

### 网格设置

| 参数 | 项目 JSON 键 | 默认值 |
|---|---|---:|
| 精细网格尺寸 | `mesh.fineSize` | 0.05 mm |
| 粗网格（整体）尺寸 | `mesh.bulkSize` | 0.30 mm |
| 精细区域距离 | `mesh.fineDistance` | 0.10 mm |
| 过渡距离 | `mesh.transitionDistance` | 0.60 mm |
| 距离采样数 | `mesh.distanceSampling` | 200 |

精细网格尺寸不得超过粗网格尺寸。过渡距离必须大于精细区域距离，距离采样数必须是不小于 10 的整数。

## 从 GitHub 安装

ParaFin 没有发布到 npm 注册表，但可以直接从此 GitHub 仓库安装（作为 ES Module），在其他 Node.js / JavaScript 项目中使用：

```bash
npm install github:sasekazu/ParaFin
```

或者等价地：

```bash
npm install https://github.com/sasekazu/ParaFin.git
```

如需固定到某个带标签的版本，而不是跟踪默认分支：

```bash
npm install github:sasekazu/ParaFin#v0.1.0
```

## 编程 API

ParaFin 的形状生成逻辑以不依赖 DOM/UI 的纯 JavaScript API 形式提供，有两种等价的形式：

- **浏览器（传统 `<script>` 标签）：** 以 `window.ParaFin` 的形式暴露
  （参见 `js/parafin-api.js`，底层为 `js/geometry.js`）。`index.html` 使用的就是这种形式，同一页面上的其他脚本也可以在不接触 UI 的情况下生成指尖几何。
- **npm / ES Modules：** 通过 `js/parafin-api.esm.js`（底层为 `js/geometry-core.js`）暴露。按上文所示从 GitHub 安装后，可在其他 Node.js/JavaScript 项目中使用。

两种形式基于相同的底层几何算法，实现完全一致的 `generate()` 行为。

### 浏览器用法

```html
<script src="js/geometry.js"></script>
<script src="js/parafin-api.js"></script>
<script>
  const result = ParaFin.generate({
    fingerWidth: 18,
    fingerHeight: 14
  });

  console.log(result.boundaries);
</script>
```

### npm / ES Modules 用法

```js
import ParaFin from 'parafin';

const result = ParaFin.generate({
  fingerWidth: 18,
  fingerHeight: 14
});

console.log(result.boundaries);
```

也可以使用具名导入：

```js
import {
  generate,
  getDefaultParameters,
  validateParameters,
  validateMeshSettings,
  generateGeometry
} from 'parafin';
```

### `generate(parameters)` 的行为

`generate(parameters)`（浏览器中为 `ParaFin.generate(parameters)`，npm 中为 `generate` 或默认导出）会将 `parameters` 合并到默认参数集之上（`mesh` 子对象单独合并），校验合并结果（包括网格设置），并在一次调用中生成几何。缺失的键会回退到默认值，因此 `generate({})` 会返回默认形状。如果合并后的参数无效，它会抛出描述问题的 `Error`，而不是返回不完整的形状。

成功时，它返回至少包含以下内容的对象：

```js
{
  parameters,               // 生成时使用的合并后参数
  boundaries,               // 边界定义数组
  regions,                  // 区域定义数组
  fingerprintMetadata,      // 指纹嵴线布局元数据
  epidermisDermisMetadata   // 真皮乳头布局元数据
}
```

为方便使用，更底层的构建块也被直接暴露：
`getDefaultParameters()`、`validateParameters(params)`、`validateMeshSettings(mesh)` 和 `generateGeometry(params)`（后者不会校验其输入）。

## 坐标系

- **原点：** 手指外部椭圆的中心
- **X 轴：** 从左（−）到右（+）
- **Y 轴：** 从掌侧（−）到背侧（+）
- **角度约定：** +X 方向为 0°，背侧顶点为 90°，掌侧顶点为 270°
- **方向：** 逆时针
- **单位：** 毫米和度

## 项目 JSON

`Download JSON` 只保存用户可配置的设置，不保存生成的边界坐标、派生几何、Gmsh 实体 ID 或网格数据。

当前格式如下：

```json
{
  "format": "parafin-project",
  "formatVersion": 1,
  "units": "mm",
  "geometry": {},
  "fingerprint": {},
  "dermalPapillae": {},
  "mesh": {}
}
```

`Load Project` 在应用文件之前会先进行校验。缺失的可选指纹、真皮乳头或网格字段将由应用程序默认值替代。目前仅支持以毫米为单位的格式版本 1 项目。不支持包含已导出边界数据的旧版 JSON 文件。

## Gmsh GEO 导出

`Download GEO` 会生成 `parafin-model.geo`，其中包含：

- OpenCASCADE 几何
- 光滑边界部分的椭圆弧
- 启用的指纹和真皮乳头区域的 BSpline 曲线
- 相邻组织面之间共享的曲线
- 六个物理组织面
- 物理边界曲线
- 网格尺寸控制参数

### 物理面

| ID | 名称 |
|---:|---|
| 1 | Stratum Corneum（角质层） |
| 2 | Epidermis（表皮） |
| 3 | Dermis（真皮） |
| 4 | Subcutaneous（皮下组织） |
| 5 | Bone（骨骼） |
| 6 | Nail（指甲） |

### 物理曲线

| ID | 名称 |
|---:|---|
| 1 | Outer Boundary（外边界） |
| 2 | Bone Boundary（骨骼边界） |
| 3 | Nail Bed（甲床） |

### 网格尺寸控制

当指纹嵴线和/或真皮乳头启用时，ParaFin 会写入 Gmsh 的 `Distance` 和 `Threshold` 场，对相应 BSpline 曲线周围的网格进行加密。单元尺寸从这些曲线附近的 `fineSize` 过渡到远处的 `bulkSize`。

当两个波高均为零时，导出的 GEO 改用均匀的 `bulkSize`。生成的文件会设置：

```geo
Mesh.Algorithm = 6;
```

可通过命令行生成二维网格：

```bash
gmsh parafin-model.geo -2
```

Gmsh 默认写出 MSH 4.1 文件。如果您的求解器或工具只能读取 MSH 2.2，请添加 `-format msh2`：

```bash
gmsh parafin-model.geo -2 -format msh2 -o parafin-model.msh
```

也可以在划分网格之前，直接编辑生成的 GEO 文件来修改网格设置。

## 几何模型与近似

模型包含六个区域：

1. 角质层
2. 表皮
3. 真皮
4. 皮下组织
5. 骨骼
6. 指甲

光滑的组织层边界使用简化的椭圆缩放，而不是真正的法向偏移：

```text
innerWidth  = outerWidth  - 2 × thickness
innerHeight = outerHeight - 2 × thickness
```

这种近似最适用于接近圆形的椭圆，随着椭圆偏心率增大，精度会下降。

其他限制：

- 该模型是二维截面。
- 骨骼用独立的椭圆表示。
- 指甲用椭圆形的背侧区域表示。
- 指纹嵴线和真皮乳头使用采样的参数曲线，而非按解剖结构重建的曲面。
- 导出的网格设置提供的是一种统一的加密方案，而不是针对不同组织的单元尺寸或边界层网格。

## 开发

```bash
npm test          # API 测试和 geometry 一致性测试（仅需 Node，无依赖）
npm run test:ui   # index.html 浏览器冒烟测试（需要 Playwright）
```

`js/geometry.js`（经典脚本，由 `index.html` 使用）和 `js/geometry-core.js`（ES 模块，由 npm 包使用）是同一算法的两份副本，因为 `index.html` 必须能从 `file://` 直接打开。`npm test` 会用有效和无效的参数集运行两者，结果不一致则失败，因此修改必须同时应用到两个文件。

UI 测试需要 Playwright（它不是本包的依赖）：`npm install --no-save playwright && npx playwright install chromium`

## 参考文献

参数符号和基本的指尖截面模型遵循：

Serhat, G., Vardar, Y., and Kuchenbecker, K. J. (2022). “Contact evolution of dry and hydrated fingertips at initial touch.” *PLOS ONE*, 17(7), e0269722. https://doi.org/10.1371/journal.pone.0269722

## 许可证

请参阅 [LICENSE](LICENSE) 文件。
