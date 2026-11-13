**English** | [日本語](README.ja.md) | [한국어](README.ko.md) | [简体中文](README.zh-CN.md)

# ParaFin

**Parametric Fingertip Geometry Generator for FEA**

ParaFin is a browser-based tool for generating and previewing parametric 2D fingertip cross-section models. Project settings can be saved to JSON, and Gmsh-compatible `.geo` files can be exported for finite element meshing.

## Features

- Parametric fingertip, tissue-layer, bone, and nail geometry
- Fingerprint ridges on the palmar surface
- Dermal papillae at the epidermis–dermis interface
- Full and magnified SVG previews
- Project save/load using JSON
- Gmsh `.geo` export with physical groups
- Embedded uniform or locally refined mesh-size settings
- Inputs are saved automatically in the browser (`localStorage`) and restored on the next visit; use `Reset to Defaults` to start over
- No installation, build process, or web server required

## Quick Start

1. Open the [demo site](https://sasekazu.github.io/ParaFin/), or open `index.html` in a modern web browser. The application runs entirely in your browser.
2. Adjust the parameters, then click `Download GEO` to save `parafin-model.geo`.
3. Convert the GEO file to a 2D mesh (`.msh`) with [Gmsh](https://gmsh.info/):

```bash
gmsh parafin-model.geo -2 -o parafin-model.msh
```

If you prefer the Gmsh GUI, open the `.geo` file, run `Mesh` → `2D`, and save the mesh with `File` → `Export`. See [Gmsh GEO Export](#gmsh-geo-export) for details.

Files generated with the default parameters (`.geo`, project `.json`, and `.msh` in both MSH 4.1 and MSH 2.2 formats) are attached to each [release](https://github.com/sasekazu/ParaFin/releases). Download them from the [latest release](https://github.com/sasekazu/ParaFin/releases/latest).

## Preview Controls

Both preview panels (full cross section and fingerprint detail) can be zoomed and panned.

| Action | Mouse / touch | Keyboard (panel focused) |
|---|---|---|
| Zoom | Mouse wheel, pinch, or the `+` / `−` buttons | `+` / `-` |
| Pan | Drag | Arrow keys |
| Reset view | Double-click or the `Reset` button | `0` |
| Save image | `SVG` / `PNG` buttons in each view | |

Until you zoom or pan, each view is fitted automatically when parameters change or the window is resized. Once you zoom or pan, your view is kept; use `Reset` to return to automatic fitting. The scale bar adapts to the zoom level.

The `SVG` and `PNG` buttons save the view exactly as shown (including the current zoom, axes and scale bar) on a white background; PNG files are saved at twice the on-screen size.

The optional `File name` field sets the base name of downloaded `.geo`, `.json` and image files (e.g. `finger` → `finger.geo`, `finger.json`, `finger-cross-section.svg`). Leave it empty for the default names. You can also load a project by dropping a `.json` file onto the page, and the `?` buttons next to each parameter show a short explanation.

## Parameters

All geometric lengths are specified in millimeters and angles in degrees.

### Finger and tissue layers

| Symbol | Parameter | Project JSON key | Default |
|---|---|---|---:|
| *w*<sub>f</sub> | Finger width | `geometry.fingerWidth` | 20 mm |
| *h*<sub>f</sub> | Finger height | `geometry.fingerHeight` | 14 mm |
| *t*<sub>sc</sub> | Stratum corneum thickness | `geometry.stratumCorneumThickness` | 0.1 mm |
| *t*<sub>e</sub> | Epidermis thickness | `geometry.epidermisThickness` | 0.6 mm |
| *t*<sub>d</sub> | Dermis thickness | `geometry.dermisThickness` | 0.8 mm |

### Bone and nail

| Symbol | Parameter | Project JSON key | Default |
|---|---|---|---:|
| *w*<sub>b</sub> | Bone width | `geometry.boneWidth` | 6 mm |
| *h*<sub>b</sub> | Bone height | `geometry.boneHeight` | 3 mm |
| *e*<sub>b</sub> | Bone vertical offset | `geometry.boneOffsetY` | 2 mm |
| α<sub>n</sub> | Nail angular extent | `geometry.nailAngularExtent` | 108° |

The bone is horizontally centered. Nail extent is symmetric about the dorsal apex at 90°. Nail thickness is automatically set to *t*<sub>sc</sub> + *t*<sub>e</sub>.

### Fingerprint ridges

| Symbol | Parameter | Project JSON key | Default |
|---|---|---|---:|
| α<sub>r</sub> | Requested fingerprint angular extent | `fingerprint.fingerprintAngularExtent` | 140° |
| λ<sub>r</sub> | Fingerprint wavelength | `fingerprint.fingerprintWavelength` | 0.5 mm |
| *h*<sub>r</sub> | Fingerprint ridge height | `fingerprint.fingerprintRidgeHeight` | 0.1 mm |

Fingerprint ridges are centered at the palmar apex, 270°. The outer finger boundary and stratum-corneum inner boundary use phase-matched displacements so that the stratum corneum thickness remains aligned along the local normal direction.

The ridge count is rounded up to an odd integer number of wavelengths. Consequently, the actual angular extent can be slightly larger than the requested value. Set *h*<sub>r</sub> to `0` for smooth boundaries.

### Dermal papillae

| Symbol | Parameter | Project JSON key | Default |
|---|---|---|---:|
| α<sub>ed</sub> | Requested dermal-papillae angular extent | `dermalPapillae.epidermisDermisAngularExtent` | 140° |
| λ<sub>ed</sub> | Dermal-papillae wavelength | `dermalPapillae.epidermisDermisWavelength` | 1.0 mm |
| *h*<sub>ed</sub> | Dermal-papillae height | `dermalPapillae.epidermisDermisHeight` | 0.2 mm |

Dermal papillae are applied independently of the fingerprint settings and are centered at 270° on the epidermis–dermis interface. Their count is also rounded up to an odd integer number of wavelengths, so the actual angular extent can exceed the requested value slightly.

Set *h*<sub>ed</sub> to `0` for a smooth interface. A nonzero value must be smaller than the epidermis thickness.

### Mesh settings

| Parameter | Project JSON key | Default |
|---|---|---:|
| Fine mesh size | `mesh.fineSize` | 0.05 mm |
| Bulk mesh size | `mesh.bulkSize` | 0.30 mm |
| Fine-region distance | `mesh.fineDistance` | 0.10 mm |
| Transition distance | `mesh.transitionDistance` | 0.60 mm |
| Distance sampling | `mesh.distanceSampling` | 200 |

The fine mesh size must not exceed the bulk mesh size. The transition distance must be greater than the fine-region distance, and distance sampling must be an integer of at least 10.

## Installation from GitHub

ParaFin is not published to the npm registry, but it can be installed directly
from this GitHub repository (as an ES Module) for use in other Node.js /
JavaScript projects:

```bash
npm install github:sasekazu/ParaFin
```

or, equivalently:

```bash
npm install https://github.com/sasekazu/ParaFin.git
```

To pin a specific tagged version instead of tracking the default branch:

```bash
npm install github:sasekazu/ParaFin#v0.1.0
```

## Programmatic API

ParaFin's shape-generation logic is available as a plain, DOM/UI-independent
JavaScript API in two equivalent forms:

- **Browser (classic `<script>` tags):** exposed as `window.ParaFin`
  (see `js/parafin-api.js`, backed by `js/geometry.js`). This is what `index.html` uses,
  and it also lets other scripts on the same page generate fingertip geometry without
  touching the UI.
- **npm / ES Modules:** exposed via `js/parafin-api.esm.js` (backed by
  `js/geometry-core.js`), for use from other Node.js/JavaScript projects after installing
  from GitHub as shown above.

Both forms implement the exact same `generate()` behavior on top of the same underlying
geometry algorithms.

### Browser usage

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

### npm / ES Modules usage

```js
import ParaFin from 'parafin';

const result = ParaFin.generate({
  fingerWidth: 18,
  fingerHeight: 14
});

console.log(result.boundaries);
```

Named imports are also available:

```js
import {
  generate,
  getDefaultParameters,
  validateParameters,
  validateMeshSettings,
  generateGeometry
} from 'parafin';
```

### `generate(parameters)` behavior

`generate(parameters)` (i.e. `ParaFin.generate(parameters)` in the browser, or the
`generate`/default export in npm) merges `parameters` on top of the default parameter
set (the `mesh` sub-object is merged separately), validates the merged result
(including mesh settings), and generates geometry in one call. Missing keys fall back
to defaults, so `generate({})` returns the default shape. If the merged parameters are
invalid, it throws an `Error` describing the problem instead of returning a partial
shape.

On success, it returns an object containing at least:

```js
{
  parameters,               // merged parameters used for generation
  boundaries,               // array of boundary definitions
  regions,                  // array of region definitions
  fingerprintMetadata,      // fingerprint ridge layout metadata
  epidermisDermisMetadata   // dermal papillae layout metadata
}
```

The lower-level building blocks are also exposed directly for convenience:
`getDefaultParameters()`, `validateParameters(params)`, `validateMeshSettings(mesh)`, and
`generateGeometry(params)` (the latter does not validate its input).

## Coordinate System

- **Origin:** center of the outer finger ellipse
- **X-axis:** left (−) to right (+)
- **Y-axis:** palmar (−) to dorsal (+)
- **Angle convention:** 0° at +X, 90° at the dorsal apex, and 270° at the palmar apex
- **Direction:** counterclockwise
- **Units:** millimeters and degrees

## Project JSON

`Download JSON` saves only user-configurable settings. It does not store generated boundary coordinates, derived geometry, Gmsh entity IDs, or mesh data.

The current format is:

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

`Load Project` validates the file before applying it. Missing optional fingerprint, dermal-papillae, or mesh fields are replaced with application defaults. Only millimeter-based format-version-1 projects are currently supported. Legacy JSON files containing exported boundary data are not supported.

## Gmsh GEO Export

`Download GEO` generates `parafin-model.geo` containing:

- OpenCASCADE geometry
- Ellipse arcs for smooth boundary portions
- BSpline curves for active fingerprint and dermal-papillae regions
- Shared curves between adjacent tissue surfaces
- Six physical tissue surfaces
- Physical boundary curves
- Mesh-size control parameters

### Physical surfaces

| ID | Name |
|---:|---|
| 1 | Stratum Corneum |
| 2 | Epidermis |
| 3 | Dermis |
| 4 | Subcutaneous |
| 5 | Bone |
| 6 | Nail |

### Physical curves

| ID | Name |
|---:|---|
| 1 | Outer Boundary |
| 2 | Bone Boundary |
| 3 | Nail Bed |

### Mesh-size control

When fingerprint ridges and/or dermal papillae are active, ParaFin writes Gmsh `Distance` and `Threshold` fields that refine the mesh around the corresponding BSpline curves. The element size transitions from `fineSize` near those curves to `bulkSize` farther away.

When both wave heights are zero, the exported GEO uses a uniform `bulkSize` instead. The generated file sets:

```geo
Mesh.Algorithm = 6;
```

Generate a 2D mesh from the command line with:

```bash
gmsh parafin-model.geo -2
```

Gmsh writes MSH 4.1 files by default. If your solver or tool only reads MSH 2.2, add `-format msh2`:

```bash
gmsh parafin-model.geo -2 -format msh2 -o parafin-model.msh
```

Mesh settings can also be edited directly in the generated GEO file before meshing.

## Geometric Model and Approximations

The model contains six regions:

1. Stratum corneum
2. Epidermis
3. Dermis
4. Subcutaneous tissue
5. Bone
6. Nail

Smooth tissue-layer boundaries use simplified ellipse scaling rather than a true normal offset:

```text
innerWidth  = outerWidth  - 2 × thickness
innerHeight = outerHeight - 2 × thickness
```

This approximation is most appropriate for nearly circular ellipses and becomes less accurate as ellipse eccentricity increases.

Additional limitations:

- The model is a two-dimensional cross-section.
- The bone is represented by an independent ellipse.
- The nail is represented by an elliptical dorsal region.
- Fingerprint ridges and dermal papillae use sampled parametric curves rather than anatomically reconstructed surfaces.
- The exported mesh settings provide one shared refinement scheme rather than tissue-specific element sizes or boundary-layer meshes.

## Reference

Parameter notation and the basic fingertip cross-section model follow:

Serhat, G., Vardar, Y., and Kuchenbecker, K. J. (2022). “Contact evolution of dry and hydrated fingertips at initial touch.” *PLOS ONE*, 17(7), e0269722. https://doi.org/10.1371/journal.pone.0269722

## License

See the [LICENSE](LICENSE) file.
