[English](README.md) | [日本語](README.ja.md) | **한국어** | [简体中文](README.zh-CN.md)

> 이 문서는 [README.md](README.md)(영문판)의 한국어 번역입니다. 내용이 다를 경우 영문판을 기준으로 합니다.

# ParaFin

**유한요소해석을 위한 매개변수형 손끝 형상 생성기**

ParaFin은 매개변수형 2차원 손끝 단면 모델을 생성하고 미리 볼 수 있는 브라우저 기반 도구입니다. 프로젝트 설정은 JSON으로 저장할 수 있으며, 유한요소 메시 생성을 위해 Gmsh와 호환되는 `.geo` 파일을 내보낼 수 있습니다.

## 주요 기능

- 매개변수형 손끝, 조직층, 뼈, 손톱 형상
- 손바닥 쪽 표면의 지문 융선
- 표피–진피 경계면의 진피 유두
- 전체 및 확대 SVG 미리보기
- JSON을 이용한 프로젝트 저장/불러오기
- 물리 그룹이 포함된 Gmsh `.geo` 내보내기
- 균일 또는 국소 세분화 메시 크기 설정 내장
- 입력값은 브라우저(`localStorage`)에 자동 저장되어 다음 방문 시 복원됩니다. 처음부터 다시 하려면 `Reset to Defaults`를 사용하세요
- 설치, 빌드 과정, 웹 서버가 필요 없음

## 빠른 시작

1. [데모 사이트](https://sasekazu.github.io/ParaFin/)를 열거나, 최신 브라우저에서 `index.html`을 엽니다. 애플리케이션은 전적으로 브라우저 안에서 실행됩니다.
2. 매개변수를 조정한 다음 `Download GEO`를 클릭하여 `parafin-model.geo`를 저장합니다.
3. [Gmsh](https://gmsh.info/)로 GEO 파일을 2차원 메시(`.msh`)로 변환합니다.

```bash
gmsh parafin-model.geo -2 -o parafin-model.msh
```

Gmsh GUI를 사용하려면 `.geo` 파일을 열고 `Mesh` → `2D`를 실행한 뒤, `File` → `Export`로 메시를 저장합니다. 자세한 내용은 [Gmsh GEO 내보내기](#gmsh-geo-내보내기)를 참조하세요.

기본 매개변수로 생성한 파일(`.geo`, 프로젝트 `.json`, 그리고 MSH 4.1 및 MSH 2.2 형식의 `.msh`)은 각 [릴리스](https://github.com/sasekazu/ParaFin/releases)에 첨부되어 있습니다. [최신 릴리스](https://github.com/sasekazu/ParaFin/releases/latest)에서 다운로드할 수 있습니다.

## 미리보기 조작

두 미리보기(전체 단면, 지문 상세)는 모두 확대/축소와 이동이 가능합니다.

| 동작 | 마우스·터치 | 키보드(패널에 포커스 시) |
|---|---|---|
| 확대/축소 | 마우스 휠, 핀치, `+` / `−` 버튼 | `+` / `-` |
| 이동 | 드래그 | 방향키 |
| 보기 초기화 | 더블 클릭 또는 `Reset` 버튼 | `0` |
| 이미지로 저장 | 각 뷰의 `SVG` / `PNG` 버튼 | |

확대/축소나 이동을 하기 전까지는 매개변수를 바꾸거나 창 크기를 조절할 때마다 각 뷰가 자동으로 맞춰집니다. 확대/축소나 이동을 한 뒤에는 그 보기가 유지되며, `Reset`으로 자동 맞춤으로 돌아갑니다. 축척 막대는 확대 수준에 맞게 바뀝니다.

`SVG` / `PNG` 버튼은 현재 표시된 뷰(현재 확대 수준, 축, 축척 막대 포함)를 흰 배경으로 그대로 저장합니다. PNG는 화면 크기의 2배로 저장됩니다.

헤더의 `File name…` 버튼(선택 사항)으로 여는 입력란에서 내려받는 `.geo`, `.json`, 이미지 파일의 기본 이름을 지정할 수 있습니다(예: `finger` → `finger.geo`, `finger.json`, `finger-cross-section.svg`). 비워 두면 기본 이름을 사용합니다. `.json` 파일을 페이지에 끌어다 놓아 프로젝트를 불러올 수도 있으며, 각 매개변수 옆의 `?` 버튼으로 짧은 설명을 볼 수 있습니다.

## 매개변수

모든 기하학적 길이는 밀리미터, 각도는 도(°) 단위로 지정합니다.

### 손가락과 조직층

| 기호 | 매개변수 | 프로젝트 JSON 키 | 기본값 |
|---|---|---|---:|
| *w*<sub>f</sub> | 손가락 너비 | `geometry.fingerWidth` | 20 mm |
| *h*<sub>f</sub> | 손가락 높이 | `geometry.fingerHeight` | 14 mm |
| *t*<sub>sc</sub> | 각질층 두께 | `geometry.stratumCorneumThickness` | 0.1 mm |
| *t*<sub>e</sub> | 표피 두께 | `geometry.epidermisThickness` | 0.6 mm |
| *t*<sub>d</sub> | 진피 두께 | `geometry.dermisThickness` | 0.8 mm |

### 뼈와 손톱

| 기호 | 매개변수 | 프로젝트 JSON 키 | 기본값 |
|---|---|---|---:|
| *w*<sub>b</sub> | 뼈 너비 | `geometry.boneWidth` | 6 mm |
| *h*<sub>b</sub> | 뼈 높이 | `geometry.boneHeight` | 3 mm |
| *e*<sub>b</sub> | 뼈 수직 오프셋 | `geometry.boneOffsetY` | 2 mm |
| α<sub>n</sub> | 손톱 각도 범위 | `geometry.nailAngularExtent` | 108° |

뼈는 수평 방향으로 중앙에 배치됩니다. 손톱 범위는 90°에 있는 손등 쪽 정점을 기준으로 대칭입니다. 손톱 두께는 자동으로 *t*<sub>sc</sub> + *t*<sub>e</sub>로 설정됩니다.

### 지문 융선

| 기호 | 매개변수 | 프로젝트 JSON 키 | 기본값 |
|---|---|---|---:|
| α<sub>r</sub> | 요청 지문 각도 범위 | `fingerprint.fingerprintAngularExtent` | 140° |
| λ<sub>r</sub> | 지문 파장 | `fingerprint.fingerprintWavelength` | 0.5 mm |
| *h*<sub>r</sub> | 지문 융선 높이 | `fingerprint.fingerprintRidgeHeight` | 0.1 mm |

지문 융선은 270°에 있는 손바닥 쪽 정점을 중심으로 배치됩니다. 손가락 외곽 경계와 각질층 안쪽 경계에는 위상을 맞춘 변위를 사용하므로, 각질층 두께는 국소 법선 방향을 따라 일정하게 유지됩니다.

융선의 수는 파장 수가 홀수 정수가 되도록 올림됩니다. 따라서 실제 각도 범위는 요청한 값보다 약간 클 수 있습니다. 매끄러운 경계를 원하면 *h*<sub>r</sub>을 `0`으로 설정하세요.

### 진피 유두

| 기호 | 매개변수 | 프로젝트 JSON 키 | 기본값 |
|---|---|---|---:|
| α<sub>ed</sub> | 요청 진피 유두 각도 범위 | `dermalPapillae.epidermisDermisAngularExtent` | 140° |
| λ<sub>ed</sub> | 진피 유두 파장 | `dermalPapillae.epidermisDermisWavelength` | 1.0 mm |
| *h*<sub>ed</sub> | 진피 유두 높이 | `dermalPapillae.epidermisDermisHeight` | 0.2 mm |

진피 유두는 지문 설정과 독립적으로 적용되며, 표피–진피 경계면의 270°를 중심으로 배치됩니다. 개수 역시 파장 수가 홀수 정수가 되도록 올림되므로, 실제 각도 범위는 요청한 값을 약간 초과할 수 있습니다.

매끄러운 경계면을 원하면 *h*<sub>ed</sub>를 `0`으로 설정하세요. 0이 아닌 값은 표피 두께보다 작아야 합니다.

### 메시 설정

| 매개변수 | 프로젝트 JSON 키 | 기본값 |
|---|---|---:|
| 미세 메시 크기 | `mesh.fineSize` | 0.05 mm |
| 일반(벌크) 메시 크기 | `mesh.bulkSize` | 0.30 mm |
| 미세 영역 거리 | `mesh.fineDistance` | 0.10 mm |
| 전이 거리 | `mesh.transitionDistance` | 0.60 mm |
| 거리 샘플링 | `mesh.distanceSampling` | 200 |

미세 메시 크기는 일반 메시 크기를 초과할 수 없습니다. 전이 거리는 미세 영역 거리보다 커야 하며, 거리 샘플링은 10 이상의 정수여야 합니다.

## GitHub에서 설치

ParaFin은 npm 레지스트리에 게시되어 있지 않지만, 이 GitHub 저장소에서 직접 설치하여(ES Module로) 다른 Node.js / JavaScript 프로젝트에서 사용할 수 있습니다.

```bash
npm install github:sasekazu/ParaFin
```

또는 다음과 같이 지정할 수도 있습니다.

```bash
npm install https://github.com/sasekazu/ParaFin.git
```

기본 브랜치를 따라가지 않고 태그가 붙은 특정 버전에 고정하려면 다음과 같이 합니다.

```bash
npm install github:sasekazu/ParaFin#v0.1.0
```

## 프로그래밍 API

ParaFin의 형상 생성 로직은 DOM/UI에 의존하지 않는 순수 JavaScript API로, 동등한 두 가지 형태로 제공됩니다.

- **브라우저(기존 `<script>` 태그):** `window.ParaFin`으로 노출됩니다
  (`js/parafin-api.js` 참조, 실제 구현은 `js/geometry.js`). `index.html`이 사용하는 형태이며, 같은 페이지의 다른 스크립트가 UI를 건드리지 않고 손끝 형상을 생성할 수도 있습니다.
- **npm / ES Modules:** `js/parafin-api.esm.js`(실제 구현은 `js/geometry-core.js`)를 통해 노출됩니다. 위와 같이 GitHub에서 설치한 후 다른 Node.js/JavaScript 프로젝트에서 사용할 수 있습니다.

두 형태 모두 동일한 기하 알고리즘을 기반으로 완전히 같은 `generate()` 동작을 구현합니다.

### 브라우저에서 사용하기

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

### npm / ES Modules에서 사용하기

```js
import ParaFin from 'parafin';

const result = ParaFin.generate({
  fingerWidth: 18,
  fingerHeight: 14
});

console.log(result.boundaries);
```

이름이 지정된 import도 사용할 수 있습니다.

```js
import {
  generate,
  getDefaultParameters,
  validateParameters,
  validateMeshSettings,
  generateGeometry
} from 'parafin';
```

### `generate(parameters)` 동작

`generate(parameters)`(브라우저에서는 `ParaFin.generate(parameters)`, npm에서는 `generate` 또는 default export)는 기본 매개변수 집합 위에 `parameters`를 병합하고(`mesh` 하위 객체는 별도로 병합됩니다), 병합된 결과를 (메시 설정을 포함하여) 검증한 뒤, 형상을 생성하는 과정을 한 번의 호출로 수행합니다. 지정하지 않은 키는 기본값으로 대체되므로 `generate({})`는 기본 형상을 반환합니다. 병합된 매개변수가 유효하지 않으면, 일부만 생성된 형상을 반환하는 대신 문제를 설명하는 `Error`를 던집니다.

성공하면 최소한 다음을 포함하는 객체를 반환합니다.

```js
{
  parameters,               // 생성에 사용된 병합된 매개변수
  boundaries,               // 경계 정의의 배열
  regions,                  // 영역 정의의 배열
  fingerprintMetadata,      // 지문 융선 배치 메타데이터
  epidermisDermisMetadata   // 진피 유두 배치 메타데이터
}
```

더 낮은 수준의 구성 요소도 편의를 위해 직접 노출됩니다.
`getDefaultParameters()`, `validateParameters(params)`, `validateMeshSettings(mesh)`, `generateGeometry(params)`입니다(마지막 함수는 입력을 검증하지 않습니다).

## 좌표계

- **원점:** 손가락 바깥쪽 타원의 중심
- **X축:** 왼쪽(−)에서 오른쪽(+)
- **Y축:** 손바닥 쪽(−)에서 손등 쪽(+)
- **각도 규약:** +X 방향이 0°, 손등 쪽 정점이 90°, 손바닥 쪽 정점이 270°
- **방향:** 반시계 방향
- **단위:** 밀리미터와 도(°)

## 프로젝트 JSON

`Download JSON`은 사용자가 설정할 수 있는 항목만 저장합니다. 생성된 경계 좌표, 파생된 형상, Gmsh 엔티티 ID, 메시 데이터는 저장하지 않습니다.

현재 형식은 다음과 같습니다.

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

`Load Project`는 파일을 적용하기 전에 검증합니다. 선택 사항인 지문, 진피 유두, 메시 필드가 없으면 애플리케이션 기본값으로 대체됩니다. 현재는 밀리미터 단위의 형식 버전 1 프로젝트만 지원합니다. 내보낸 경계 데이터가 포함된 이전 형식의 JSON 파일은 지원하지 않습니다.

## Gmsh GEO 내보내기

`Download GEO`는 다음을 포함하는 `parafin-model.geo`를 생성합니다.

- OpenCASCADE 지오메트리
- 매끄러운 경계 부분의 타원 호
- 활성화된 지문 및 진피 유두 영역의 BSpline 곡선
- 인접한 조직 면 사이에서 공유되는 곡선
- 6개의 물리 조직 면
- 물리 경계 곡선
- 메시 크기 제어 매개변수

### 물리 면

| ID | 이름 |
|---:|---|
| 1 | Stratum Corneum (각질층) |
| 2 | Epidermis (표피) |
| 3 | Dermis (진피) |
| 4 | Subcutaneous (피하 조직) |
| 5 | Bone (뼈) |
| 6 | Nail (손톱) |

### 물리 곡선

| ID | 이름 |
|---:|---|
| 1 | Outer Boundary (외곽 경계) |
| 2 | Bone Boundary (뼈 경계) |
| 3 | Nail Bed (조상) |

### 메시 크기 제어

지문 융선이나 진피 유두가 활성화되어 있으면, ParaFin은 해당 BSpline 곡선 주변의 메시를 세분화하는 Gmsh `Distance` 및 `Threshold` 필드를 기록합니다. 요소 크기는 이 곡선 근처의 `fineSize`에서 멀리 떨어진 곳의 `bulkSize`로 전이됩니다.

두 파동 높이가 모두 0이면, 내보낸 GEO는 대신 균일한 `bulkSize`를 사용합니다. 생성된 파일에는 다음이 설정됩니다.

```geo
Mesh.Algorithm = 6;
```

명령줄에서 2차원 메시를 생성하려면 다음과 같이 합니다.

```bash
gmsh parafin-model.geo -2
```

Gmsh는 기본적으로 MSH 4.1 파일을 기록합니다. 사용하는 솔버나 도구가 MSH 2.2만 읽을 수 있다면 `-format msh2`를 추가하세요.

```bash
gmsh parafin-model.geo -2 -format msh2 -o parafin-model.msh
```

메시 설정은 메시를 생성하기 전에 생성된 GEO 파일을 직접 편집하여 바꿀 수도 있습니다.

## 기하 모델과 근사

모델은 6개의 영역을 포함합니다.

1. 각질층
2. 표피
3. 진피
4. 피하 조직
5. 뼈
6. 손톱

매끄러운 조직층 경계에는 실제 법선 오프셋 대신 단순화한 타원 스케일링을 사용합니다.

```text
innerWidth  = outerWidth  - 2 × thickness
innerHeight = outerHeight - 2 × thickness
```

이 근사는 원에 가까운 타원에 가장 적합하며, 타원의 이심률이 커질수록 정확도가 떨어집니다.

추가 제한 사항:

- 이 모델은 2차원 단면입니다.
- 뼈는 독립적인 타원으로 표현됩니다.
- 손톱은 타원형 손등 쪽 영역으로 표현됩니다.
- 지문 융선과 진피 유두는 해부학적으로 재구성한 곡면이 아니라 샘플링된 매개변수 곡선을 사용합니다.
- 내보낸 메시 설정은 조직별 요소 크기나 경계층 메시가 아니라, 하나의 공통 세분화 방식을 제공합니다.

## 개발

```bash
npm test          # API 테스트와 geometry 일치 테스트 (Node만 필요, 의존성 없음)
npm run test:ui   # index.html 브라우저 스모크 테스트 (Playwright 필요)
```

`js/geometry.js`(클래식 스크립트, `index.html`에서 사용)와 `js/geometry-core.js`(ES 모듈, npm 패키지에서 사용)는 `index.html`이 `file://`에서도 동작해야 하므로 동일한 알고리즘의 사본으로 관리됩니다. `npm test`는 유효/무효 매개변수 세트로 둘을 실행하여 결과가 다르면 실패하므로, 변경은 두 파일 모두에 적용해야 합니다.

UI 테스트에는 Playwright가 필요합니다(이 패키지의 의존성이 아님): `npm install --no-save playwright && npx playwright install chromium`

## 참고 문헌

매개변수 표기와 기본 손끝 단면 모델은 다음 문헌을 따릅니다.

Serhat, G., Vardar, Y., and Kuchenbecker, K. J. (2022). “Contact evolution of dry and hydrated fingertips at initial touch.” *PLOS ONE*, 17(7), e0269722. https://doi.org/10.1371/journal.pone.0269722

## 라이선스

[LICENSE](LICENSE) 파일을 참조하세요.
