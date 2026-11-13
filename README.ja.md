[English](README.md) | **日本語** | [한국어](README.ko.md) | [简体中文](README.zh-CN.md)

> この文書は [README.md](README.md)（英語版）の日本語訳です。内容に差異がある場合は英語版を正とします。

# ParaFin

**有限要素解析のためのパラメトリック指先形状ジェネレータ**

ParaFin は、パラメトリックな2次元の指先断面モデルを生成・プレビューするブラウザベースのツールです。プロジェクト設定は JSON で保存でき、有限要素メッシュ生成用に Gmsh 互換の `.geo` ファイルをエクスポートできます。

## 特徴

- パラメトリックな指先・組織層・骨・爪の形状
- 掌側表面の指紋の隆線
- 表皮–真皮境界の真皮乳頭
- 全体表示と拡大表示の SVG プレビュー
- JSON によるプロジェクトの保存・読み込み
- 物理グループ付きの Gmsh `.geo` エクスポート
- 一様または局所細分化のメッシュサイズ設定の埋め込み
- インストール、ビルド、Web サーバーが不要

## クイックスタート

1. [デモサイト](https://sasekazu.github.io/ParaFin/)を開くか、最新のブラウザで `index.html` を開きます。アプリケーションはすべてブラウザ内で動作します。
2. パラメータを調整し、`Download GEO` をクリックして `parafin-model.geo` を保存します。
3. [Gmsh](https://gmsh.info/) で GEO ファイルを2次元メッシュ（`.msh`）に変換します。

```bash
gmsh parafin-model.geo -2 -o parafin-model.msh
```

Gmsh の GUI を使う場合は、`.geo` ファイルを開き、`Mesh` → `2D` を実行して、`File` → `Export` でメッシュを保存します。詳細は [Gmsh GEOエクスポート](#gmsh-geoエクスポート) を参照してください。

既定のパラメータで生成したファイル（`.geo`、プロジェクト `.json`、および MSH 4.1 形式と MSH 2.2 形式の `.msh`）は、各[リリース](https://github.com/sasekazu/ParaFin/releases)に添付されています。[最新リリース](https://github.com/sasekazu/ParaFin/releases/latest)からダウンロードできます。

## プレビュー操作

2つのプレビュー（断面全体・指紋の詳細）は、どちらもズームと移動ができます。

| 操作 | マウス・タッチ | キーボード（パネルにフォーカス時） |
|---|---|---|
| ズーム | マウスホイール、ピンチ、`+` / `−` ボタン | `+` / `-` |
| 移動 | ドラッグ | 矢印キー |
| 表示のリセット | ダブルクリック、または `Reset` ボタン | `0` |

ズームや移動をするまでは、パラメータの変更やウィンドウのリサイズのたびに、各ビューが自動でフィットします。ズームまたは移動した後は、その表示が保たれます。`Reset` で自動フィットに戻ります。スケールバーはズームに合わせて変わります。

## パラメータ

幾何学的な長さはすべてミリメートル、角度は度で指定します。

### 指と組織層

| 記号 | パラメータ | プロジェクト JSON キー | 既定値 |
|---|---|---|---:|
| *w*<sub>f</sub> | 指の幅 | `geometry.fingerWidth` | 20 mm |
| *h*<sub>f</sub> | 指の高さ | `geometry.fingerHeight` | 14 mm |
| *t*<sub>sc</sub> | 角質層の厚さ | `geometry.stratumCorneumThickness` | 0.1 mm |
| *t*<sub>e</sub> | 表皮の厚さ | `geometry.epidermisThickness` | 0.6 mm |
| *t*<sub>d</sub> | 真皮の厚さ | `geometry.dermisThickness` | 0.8 mm |

### 骨と爪

| 記号 | パラメータ | プロジェクト JSON キー | 既定値 |
|---|---|---|---:|
| *w*<sub>b</sub> | 骨の幅 | `geometry.boneWidth` | 6 mm |
| *h*<sub>b</sub> | 骨の高さ | `geometry.boneHeight` | 3 mm |
| *e*<sub>b</sub> | 骨の垂直オフセット | `geometry.boneOffsetY` | 2 mm |
| α<sub>n</sub> | 爪の角度範囲 | `geometry.nailAngularExtent` | 108° |

骨は水平方向の中央に配置されます。爪の範囲は、90° にある背側の頂点に対して対称です。爪の厚さは *t*<sub>sc</sub> + *t*<sub>e</sub> に自動的に設定されます。

### 指紋の隆線

| 記号 | パラメータ | プロジェクト JSON キー | 既定値 |
|---|---|---|---:|
| α<sub>r</sub> | 指紋の要求角度範囲 | `fingerprint.fingerprintAngularExtent` | 140° |
| λ<sub>r</sub> | 指紋の波長 | `fingerprint.fingerprintWavelength` | 0.5 mm |
| *h*<sub>r</sub> | 指紋の隆線の高さ | `fingerprint.fingerprintRidgeHeight` | 0.1 mm |

指紋の隆線は、270° にある掌側の頂点を中心に配置されます。指の外側境界と角質層の内側境界には位相を合わせた変位を用いるため、角質層の厚さは局所的な法線方向に沿って保たれます。

隆線の数は、波長の数が奇数の整数になるよう切り上げられます。そのため、実際の角度範囲は要求値よりわずかに大きくなることがあります。滑らかな境界にするには *h*<sub>r</sub> を `0` に設定してください。

### 真皮乳頭

| 記号 | パラメータ | プロジェクト JSON キー | 既定値 |
|---|---|---|---:|
| α<sub>ed</sub> | 真皮乳頭の要求角度範囲 | `dermalPapillae.epidermisDermisAngularExtent` | 140° |
| λ<sub>ed</sub> | 真皮乳頭の波長 | `dermalPapillae.epidermisDermisWavelength` | 1.0 mm |
| *h*<sub>ed</sub> | 真皮乳頭の高さ | `dermalPapillae.epidermisDermisHeight` | 0.2 mm |

真皮乳頭は指紋の設定とは独立に適用され、表皮–真皮境界の 270° を中心に配置されます。その数も、波長の数が奇数の整数になるよう切り上げられるため、実際の角度範囲は要求値をわずかに超えることがあります。

滑らかな境界にするには *h*<sub>ed</sub> を `0` に設定してください。0 以外の値は表皮の厚さより小さくなければなりません。

### メッシュ設定

| パラメータ | プロジェクト JSON キー | 既定値 |
|---|---|---:|
| 細かいメッシュサイズ | `mesh.fineSize` | 0.05 mm |
| 粗いメッシュサイズ | `mesh.bulkSize` | 0.30 mm |
| 細分化領域の距離 | `mesh.fineDistance` | 0.10 mm |
| 遷移距離 | `mesh.transitionDistance` | 0.60 mm |
| 距離のサンプリング数 | `mesh.distanceSampling` | 200 |

細かいメッシュサイズは粗いメッシュサイズを超えてはいけません。遷移距離は細分化領域の距離より大きくなければならず、距離のサンプリング数は10以上の整数でなければなりません。

## GitHub からのインストール

ParaFin は npm レジストリには公開されていませんが、この GitHub リポジトリから直接インストールして（ES Module として）、他の Node.js / JavaScript プロジェクトで利用できます。

```bash
npm install github:sasekazu/ParaFin
```

または、次のようにも指定できます。

```bash
npm install https://github.com/sasekazu/ParaFin.git
```

デフォルトブランチを追跡せず、タグ付きの特定バージョンに固定するには次のようにします。

```bash
npm install github:sasekazu/ParaFin#v0.1.0
```

## プログラム用 API

ParaFin の形状生成ロジックは、DOM や UI に依存しない素の JavaScript API として、同等の2つの形式で利用できます。

- **ブラウザ（従来の `<script>` タグ）:** `window.ParaFin` として公開されます
  （`js/parafin-api.js` を参照。実体は `js/geometry.js`）。`index.html` が使用している形式で、同じページ上の他のスクリプトから UI に触れずに指先形状を生成することもできます。
- **npm / ES Modules:** `js/parafin-api.esm.js`（実体は `js/geometry-core.js`）を通じて公開されます。上記のように GitHub からインストールした後、他の Node.js / JavaScript プロジェクトから利用できます。

どちらの形式も、同じ幾何アルゴリズムの上で、まったく同じ `generate()` の動作を実装しています。

### ブラウザでの使い方

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

### npm / ES Modules での使い方

```js
import ParaFin from 'parafin';

const result = ParaFin.generate({
  fingerWidth: 18,
  fingerHeight: 14
});

console.log(result.boundaries);
```

名前付きインポートも利用できます。

```js
import {
  generate,
  getDefaultParameters,
  validateParameters,
  validateMeshSettings,
  generateGeometry
} from 'parafin';
```

### `generate(parameters)` の動作

`generate(parameters)`（ブラウザでは `ParaFin.generate(parameters)`、npm では `generate` または default export）は、既定のパラメータセットの上に `parameters` をマージし（`mesh` サブオブジェクトは別にマージされます）、マージ結果を（メッシュ設定を含めて）検証し、形状を生成する処理を1回の呼び出しで行います。指定されていないキーは既定値になるため、`generate({})` は既定の形状を返します。マージ後のパラメータが不正な場合は、部分的な形状を返す代わりに、問題を説明する `Error` を投げます。

成功すると、少なくとも次を含むオブジェクトを返します。

```js
{
  parameters,               // 生成に使用されたマージ後のパラメータ
  boundaries,               // 境界定義の配列
  regions,                  // 領域定義の配列
  fingerprintMetadata,      // 指紋の隆線の配置メタデータ
  epidermisDermisMetadata   // 真皮乳頭の配置メタデータ
}
```

より低レベルの構成要素も、利便性のために直接公開されています。
`getDefaultParameters()`、`validateParameters(params)`、`validateMeshSettings(mesh)`、`generateGeometry(params)` です（最後のものは入力を検証しません）。

## 座標系

- **原点:** 指の外側の楕円の中心
- **X 軸:** 左（−）から右（+）
- **Y 軸:** 掌側（−）から背側（+）
- **角度の規約:** +X 方向が 0°、背側の頂点が 90°、掌側の頂点が 270°
- **回転方向:** 反時計回り
- **単位:** ミリメートルと度

## プロジェクト JSON

`Download JSON` は、ユーザーが設定可能な項目のみを保存します。生成された境界座標、派生した形状、Gmsh のエンティティ ID、メッシュデータは保存されません。

現在の形式は次のとおりです。

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

`Load Project` は、ファイルを適用する前に検証します。省略可能な指紋・真皮乳頭・メッシュのフィールドが欠けている場合は、アプリケーションの既定値で補われます。現在サポートしているのは、ミリメートル単位のフォーマットバージョン1のプロジェクトのみです。エクスポートされた境界データを含む旧形式の JSON ファイルはサポートされていません。

## Gmsh GEOエクスポート

`Download GEO` は、次を含む `parafin-model.geo` を生成します。

- OpenCASCADE ジオメトリ
- 滑らかな境界部分の楕円弧
- 有効な指紋・真皮乳頭領域の BSpline 曲線
- 隣接する組織面どうしで共有される曲線
- 6つの物理組織面
- 物理境界曲線
- メッシュサイズ制御パラメータ

### 物理面

| ID | 名前 |
|---:|---|
| 1 | Stratum Corneum（角質層） |
| 2 | Epidermis（表皮） |
| 3 | Dermis（真皮） |
| 4 | Subcutaneous（皮下組織） |
| 5 | Bone（骨） |
| 6 | Nail（爪） |

### 物理曲線

| ID | 名前 |
|---:|---|
| 1 | Outer Boundary（外側境界） |
| 2 | Bone Boundary（骨境界） |
| 3 | Nail Bed（爪床） |

### メッシュサイズ制御

指紋の隆線や真皮乳頭が有効な場合、ParaFin は対応する BSpline 曲線の周囲のメッシュを細分化する Gmsh の `Distance` および `Threshold` フィールドを書き出します。要素サイズは、これらの曲線の近くの `fineSize` から、離れた場所の `bulkSize` へと遷移します。

両方の波の高さが 0 の場合、エクスポートされる GEO は代わりに一様な `bulkSize` を使用します。生成されるファイルには次が設定されます。

```geo
Mesh.Algorithm = 6;
```

コマンドラインから2次元メッシュを生成するには、次のようにします。

```bash
gmsh parafin-model.geo -2
```

Gmsh は既定で MSH 4.1 形式のファイルを書き出します。お使いのソルバーやツールが MSH 2.2 しか読み込めない場合は、`-format msh2` を追加してください。

```bash
gmsh parafin-model.geo -2 -format msh2 -o parafin-model.msh
```

メッシュ設定は、メッシュ生成の前に、生成された GEO ファイルを直接編集して変更することもできます。

## 幾何モデルと近似

モデルは6つの領域を含みます。

1. 角質層
2. 表皮
3. 真皮
4. 皮下組織
5. 骨
6. 爪

滑らかな組織層の境界には、真の法線オフセットではなく、簡略化した楕円のスケーリングを用います。

```text
innerWidth  = outerWidth  - 2 × thickness
innerHeight = outerHeight - 2 × thickness
```

この近似は、真円に近い楕円に最も適しており、楕円の離心率が大きくなるほど精度が低下します。

その他の制限事項:

- このモデルは2次元の断面です。
- 骨は独立した楕円で表現されます。
- 爪は楕円形の背側領域で表現されます。
- 指紋の隆線と真皮乳頭は、解剖学的に再構成された曲面ではなく、サンプリングされたパラメトリック曲線を用います。
- エクスポートされるメッシュ設定は、組織ごとの要素サイズや境界層メッシュではなく、単一の共通の細分化方式を提供します。

## 参考文献

パラメータの表記と基本的な指先断面モデルは、次の文献に従っています。

Serhat, G., Vardar, Y., and Kuchenbecker, K. J. (2022). “Contact evolution of dry and hydrated fingertips at initial touch.” *PLOS ONE*, 17(7), e0269722. https://doi.org/10.1371/journal.pone.0269722

## ライセンス

[LICENSE](LICENSE) ファイルを参照してください。
