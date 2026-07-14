# ParaFin

**Parametric Fingertip Geometry Generator for FEA**

Web-based tool for generating 2D fingertip cross-section geometries with parametric control. Export to JSON for finite element analysis.

---

## Quick Start

Open `index.html` in a web browser. No installation or server required.

```bash
open index.html
```

---

## Reference

Parameter notation follows:

**Serhat, G., Vardar, Y., and Kuchenbecker, K. J. (2022).**  
"Contact evolution of dry and hydrated fingertips at initial touch."  
*PLOS ONE*, 17(7), e0269722. DOI: [10.1371/journal.pone.0269722](https://doi.org/10.1371/journal.pone.0269722)

---

## Parameters

| Symbol | Parameter | JSON Key |
|--------|-----------|----------|
| *w*<sub>f</sub> | Finger width [mm] | `fingerWidth` |
| *h*<sub>f</sub> | Finger height [mm] | `fingerHeight` |
| *t*<sub>sc</sub> | Stratum corneum thickness [mm] | `stratumCorneumThickness` |
| *t*<sub>e</sub> | Epidermis thickness [mm] | `epidermisThickness` |
| *t*<sub>d</sub> | Dermis thickness [mm] | `dermisThickness` |
| *w*<sub>b</sub> | Bone width [mm] | `boneWidth` |
| *h*<sub>b</sub> | Bone height [mm] | `boneHeight` |
| *e*<sub>b</sub> | Bone vertical offset [mm] | `boneOffsetY` |
| α<sub>n</sub> | Nail angular extent [deg] | `nailAngularExtent` |

**Notes:**
- Nail thickness = *t*<sub>sc</sub> + *t*<sub>e</sub> (auto-calculated)
- Bone horizontal offset fixed at 0 (centered)
- Subcutaneous tissue fills space between dermis and bone

**Future parameters (not implemented):**
- α<sub>r</sub>: Fingerprint angular extent
- λ<sub>r</sub>: Fingerprint wavelength
- *h*<sub>r</sub>: Fingerprint ridge height
- λ<sub>ed</sub>: Epidermis-dermis interface wavelength
- *h*<sub>ed</sub>: Epidermis-dermis interface height

---

## Coordinate System

- **Origin**: Finger center
- **X-axis**: Left (-) to right (+)
- **Y-axis**: Palmar (-) to dorsal (+)
- **Units**: millimeters (mm), degrees (°)
- **Angles**: 0° = +X, 90° = +Y (dorsal), counterclockwise

---

## JSON Export

Exports geometry with:
- Input parameters
- Boundary definitions (ellipses and arcs)
- Region definitions (tissue layers)
- Coordinate system metadata

Use for mesh generation in Gmsh, FEniCS, or custom tools.

---

## GEO Export

Exports **geometry-only** `.geo` files for [Gmsh](https://gmsh.info/):
- 6 tissue layers: stratum corneum, epidermis, dermis, subcutaneous, bone, nail
- Ellipse arcs split at nail boundaries (no Boolean operations)
- Shared curve IDs between adjacent tissues (no duplicate boundaries)
- Physical Surface and Physical Curve definitions

**Mesh settings are NOT included in the GEO file.** Configure mesh resolution (element size, refinement, etc.) in Gmsh GUI or via command-line options:

```bash
gmsh parafin-model.geo -2 -clmin 0.02 -clmax 0.5
```

This design philosophy keeps geometry definition separate from mesh generation, allowing flexible mesh experimentation without regenerating the geometry.

---

## Approximations

⚠️ **Tissue layer boundaries use simplified ellipse scaling**, not true normal offset:
```
innerWidth = outerWidth - 2 × thickness
innerHeight = outerHeight - 2 × thickness
```

This approximation is reasonable for nearly circular ellipses but less accurate for eccentric shapes.

Other simplifications:
- No fingerprint ridges (smooth surface)
- No epidermal-dermal interface waviness
- 2D cross-section only

---

## File Structure

```
parafin/
├── index.html         # Main UI
├── css/style.css      # Styling
├── js/
│   ├── geometry.js    # Model generation & validation
│   ├── renderer.js    # SVG rendering
│   ├── exporter.js    # JSON export
│   └── app.js         # UI controller
└── README.md
```

---

## License

See [LICENSE](LICENSE) file.
