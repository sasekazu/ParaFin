/**
 * exporter.js - Gmsh GEO export for ParaFin
 *
 * This module handles:
 * - Generating Gmsh GEO format for mesh generation
 *
 * JSON import/export is handled by project-io.js (_ProjectIO).
 */

const Exporter = (function() {
    'use strict';

    const APP_VERSION = '0.1.0';

    /**
     * Generate Gmsh mesh-size control GEO lines.
     * Returns an array of GEO lines (empty when mesh control is disabled).
     *
     * - If fingerprintCurveIds is non-empty: emits Distance + Threshold Fields with
     *   local refinement near fingerprint BSplines, transitioning smoothly to bulk size.
     * - If fingerprintCurveIds is empty: emits a uniform bulk-size block (no Fields).
     * - If meshSettings.enabled is false (or meshSettings is missing): returns [].
     *
     * Field IDs are allocated locally via a counter so future additions remain safe.
     *
     * @param {Object}   meshSettings       - mesh settings object (from params.mesh)
     * @param {number[]} fingerprintCurveIds - BSpline Curve IDs for fingerprint regions
     * @returns {string[]} Array of GEO lines
     */
    function generateMeshControlGEO(meshSettings, fingerprintCurveIds) {
        if (!meshSettings) {
            return [];
        }

        const hasCurves = Array.isArray(fingerprintCurveIds) && fingerprintCurveIds.length > 0;
        const lines = [];

        lines.push('// ------------------------------------------------------------');
        lines.push(hasCurves
            ? '// Local mesh-size control near fingerprint-bearing curves'
            : '// Uniform mesh-size control');
        lines.push('// Units: mm');
        lines.push('// ------------------------------------------------------------');

        if (hasCurves) {
            lines.push(`// Mesh control enabled: true`);
            lines.push(`// Fine size: ${meshSettings.fineSize} mm`);
            lines.push(`// Bulk size: ${meshSettings.bulkSize} mm`);
            lines.push(`// Fine distance: ${meshSettings.fineDistance} mm`);
            lines.push(`// Transition distance: ${meshSettings.transitionDistance} mm`);
            lines.push(`// Distance sampling: ${meshSettings.distanceSampling}`);
            lines.push(`// Fingerprint refinement curves: ${fingerprintCurveIds.join(', ')}`);
            lines.push('');

            lines.push(`meshFineSize = ${meshSettings.fineSize};`);
            lines.push(`meshBulkSize = ${meshSettings.bulkSize};`);
            lines.push(`meshFineDistance = ${meshSettings.fineDistance};`);
            lines.push(`meshTransitionDistance = ${meshSettings.transitionDistance};`);
            lines.push('');

            // Field ID allocator (safe for future additions)
            let nextFieldId = 1;
            const distanceFieldId = nextFieldId++;
            const thresholdFieldId = nextFieldId++;

            lines.push(`// Fingerprint curves used for refinement: ${fingerprintCurveIds.join(', ')}`);
            lines.push(`Field[${distanceFieldId}] = Distance;`);
            lines.push(`Field[${distanceFieldId}].CurvesList = {${fingerprintCurveIds.join(', ')}};`);
            lines.push(`Field[${distanceFieldId}].Sampling = ${meshSettings.distanceSampling};`);
            lines.push('');
            lines.push(`Field[${thresholdFieldId}] = Threshold;`);
            lines.push(`Field[${thresholdFieldId}].InField = ${distanceFieldId};`);
            lines.push(`Field[${thresholdFieldId}].SizeMin = meshFineSize;`);
            lines.push(`Field[${thresholdFieldId}].SizeMax = meshBulkSize;`);
            lines.push(`Field[${thresholdFieldId}].DistMin = meshFineDistance;`);
            lines.push(`Field[${thresholdFieldId}].DistMax = meshTransitionDistance;`);
            lines.push('');
            lines.push(`Background Field = ${thresholdFieldId};`);
            lines.push('');
            lines.push('Mesh.MeshSizeFromPoints = 0;');
            lines.push('Mesh.MeshSizeFromCurvature = 0;');
            lines.push('Mesh.MeshSizeExtendFromBoundary = 0;');
            lines.push('');
            lines.push('Mesh.MeshSizeMin = meshFineSize;');
            lines.push('Mesh.MeshSizeMax = meshBulkSize;');
            lines.push('');
            lines.push('Mesh.Algorithm = 6;');
        } else {
            lines.push('// No fingerprint curves found; using uniform bulk mesh size.');
            lines.push(`// Bulk size: ${meshSettings.bulkSize} mm`);
            lines.push('');
            lines.push(`meshBulkSize = ${meshSettings.bulkSize};`);
            lines.push('');
            lines.push('Mesh.MeshSizeFromPoints = 0;');
            lines.push('Mesh.MeshSizeFromCurvature = 0;');
            lines.push('Mesh.MeshSizeExtendFromBoundary = 0;');
            lines.push('');
            lines.push('Mesh.MeshSizeMin = meshBulkSize;');
            lines.push('Mesh.MeshSizeMax = meshBulkSize;');
            lines.push('');
            lines.push('Mesh.Algorithm = 6;');
        }

        return lines;
    }

    /**
     * Generate Gmsh GEO format string
     * @param {Object} params - Parameter object
     * @param {Object} geometry - Geometry model
     * @returns {string} GEO format string
     */
    function generateGEO(params, geometry) {
        let geo = [];
        let pointId = 1;
        let curveId = 1;
        let curveLoopId = 1;
        let surfaceId = 1;

        // Helper: format number with precision
        const fmt = (num) => Number(num).toFixed(6);

        // Header
        geo.push('// ParaFin - Parametric Finger Geometry');
        geo.push('// Generated by ParaFin v' + APP_VERSION);
        geo.push('// Unit: mm');
        geo.push('// Coordinate system: origin at finger center, +Y dorsal, Z=0');
        geo.push('// Mesh settings are controlled in Gmsh');
        if (params.fingerprintRidgeHeight > 0) {
            const fpMeta = geometry.fingerprintMetadata || {};
            geo.push('//');
            geo.push('// FINGERPRINT MODE ACTIVE:');
            geo.push(`//   Ridge height: ${params.fingerprintRidgeHeight} mm`);
            geo.push(`//   Wavelength: ${params.fingerprintWavelength} mm`);
            geo.push(`//   Requested angular extent: ${params.fingerprintAngularExtent}°`);
            geo.push(`//   Actual angular extent: ${fpMeta.actualAngularExtent?.toFixed(2) || 0}°`);
            geo.push(`//   Ridge count: ${fpMeta.ridgeCount || 0} (odd number, peak at palmar center)`);
            geo.push('//   Displacement function: d(s) = h_r/2 * (1 + cos(2πs/λ_r))');
            geo.push('//   Note: Parametric curves (BSplines) used for finger outer and stratum corneum inner boundaries');
            geo.push('//');
        }
        if (params.epidermisDermisHeight > 0) {
            const edMeta = geometry.epidermisDermisMetadata || {};
            geo.push('//');
            geo.push('// DERMAL PAPILLAE MODE ACTIVE (epidermis-dermis interface):');
            geo.push(`//   Papilla height: ${params.epidermisDermisHeight} mm`);
            geo.push(`//   Wavelength: ${params.epidermisDermisWavelength} mm`);
            geo.push(`//   Requested angular extent: ${params.epidermisDermisAngularExtent}°`);
            geo.push(`//   Actual angular extent: ${edMeta.actualAngularExtent?.toFixed(2) || 0}°`);
            geo.push(`//   Papilla half-wave count: ${edMeta.ridgeCount || 0} (odd number, positive peak at palmar center)`);
            geo.push('//   Displacement function: d(s) = h_ed/2 * cos(2πs_rel/λ_ed)  (h_ed = peak-to-peak height)');
            geo.push('//   Region ends are zero-crossings (smooth connection to base ellipse)');

            geo.push('//   Note: Parametric curve (BSpline) used for epidermis-inner boundary only');
            geo.push('//');
        }

        geo.push('');
        geo.push('SetFactory("OpenCASCADE");');
        geo.push('');
        
        // Check if fingerprint mode is active
        const hasFingerprintRidges = params.fingerprintRidgeHeight > 0;
        const fpMeta = geometry.fingerprintMetadata || {};
        if (hasFingerprintRidges) {
            geo.push('// WARNING: Fingerprint mode is active.');
            geo.push('// The finger-outer and stratum-corneum-inner boundaries are exported as hybrid Ellipse+BSpline arcs.');
            geo.push('// BSpline is used only for the fingerprint region; all other arcs are Ellipse.');
            geo.push('');
        }

        // Store mapping of boundary ID to curve IDs and points
        const boundaryToCurves = {};
        const boundaryToPoints = {};

        // Get nail parameters
        const nailBoundary = geometry.boundaries.find(b => b.id === 'nail');
        const nailStartAngle = nailBoundary.startAngle;
        const nailEndAngle = nailBoundary.endAngle;

        // Helper: Create segmented boundary with named arc segments (5 or 7 segments).
        // Applies to both ellipse (ridgeHeight=0) and parametric-curve (ridgeHeight>0) boundaries.
        //
        // palmarCoreCurves is always an ARRAY:
        //   parametric-curve boundary → [BSpline]         (palmarStart → palmarEnd, single arc)
        //   ellipse boundary          → [Ellipse1, Ellipse2]  (palmarStart → 270°, 270° → palmarEnd)
        //
        // Splitting the Ellipse palmar at 270° (the minor-axis endpoint / palmar center) ensures
        // no single Ellipse arc ever crosses the minor-axis endpoint as an interior point, which
        // matches the convention used everywhere else in this file.
        //
        // Segments in CCW order from 0°:
        //   0° → nail-start                 nailStartCurve      (Ellipse)
        //   nail-start → 90°                nailCurve1          (Ellipse; null if skipNailRegion)
        //   90° → nail-end                  nailCurve2          (Ellipse; null if skipNailRegion)
        //   nail-end → 180°                 nailEndCurve        (Ellipse)
        //   180° → palmar-start             palmarApproachCurve (Ellipse)
        //   palmar-start → palmar-end       palmarCoreCurves    ([BSpline] or [E1, E2])
        //   palmar-end → 0°                 palmarRecedeCurve   (Ellipse)
        //
        // Returns named curve and point properties for use in Curve Loop definitions.
        function createSegmentedBoundary(boundary, fpMeta, skipNailRegion, comment) {
            const cx = boundary.center[0];
            const cy = boundary.center[1];
            const rx = boundary.width / 2;
            const ry = boundary.height / 2;
            const isParametric = boundary.type === 'parametric-curve';

            const palmarStart = fpMeta.palmarStart;
            const palmarEnd   = fpMeta.palmarEnd;

            const startRad = nailStartAngle * Math.PI / 180;
            const endRad   = nailEndAngle   * Math.PI / 180;
            const psRad    = palmarStart    * Math.PI / 180;
            const peRad    = palmarEnd      * Math.PI / 180;

            geo.push(`// ${comment}`);

            // --- Points ---

            // 0° right point — also used as major-axis reference in every Ellipse() call
            const p0deg = pointId++;
            geo.push(`Point(${p0deg}) = {${fmt(cx + rx)}, ${fmt(cy)}, 0};  // 0° (right, major-axis ref)`);

            // 180° left point
            const p180 = pointId++;
            geo.push(`Point(${p180}) = {${fmt(cx - rx)}, ${fmt(cy)}, 0};  // 180° (left)`);

            // Ellipse center
            const pc = pointId++;
            geo.push(`Point(${pc}) = {${fmt(cx)}, ${fmt(cy)}, 0};  // center`);

            // 90° top point (only when nail arcs are included)
            let p90 = null;
            if (!skipNailRegion) {
                p90 = pointId++;
                geo.push(`Point(${p90}) = {${fmt(cx)}, ${fmt(cy + ry)}, 0};  // 90° (top)`);
            }

            // Nail split points
            const pNailStart = pointId++;
            const pNailEnd   = pointId++;
            geo.push(`Point(${pNailStart}) = {${fmt(cx + rx * Math.cos(startRad))}, ${fmt(cy + ry * Math.sin(startRad))}, 0};  // nail-start (${nailStartAngle}°)`);
            geo.push(`Point(${pNailEnd})   = {${fmt(cx + rx * Math.cos(endRad))},   ${fmt(cy + ry * Math.sin(endRad))},   0};  // nail-end (${nailEndAngle}°)`);

            // Palmar region split points (exact ellipse; BSpline displacement = 0 at these boundaries)
            const pPalmarStart = pointId++;
            const pPalmarEnd   = pointId++;
            geo.push(`Point(${pPalmarStart}) = {${fmt(cx + rx * Math.cos(psRad))}, ${fmt(cy + ry * Math.sin(psRad))}, 0};  // palmar-start (${palmarStart.toFixed(2)}°)`);
            geo.push(`Point(${pPalmarEnd})   = {${fmt(cx + rx * Math.cos(peRad))}, ${fmt(cy + ry * Math.sin(peRad))}, 0};  // palmar-end (${palmarEnd.toFixed(2)}°)`);
            geo.push('');

            // --- BSpline interior control points (parametric-curve boundaries only) ---
            // Index 0 of boundary.points corresponds to 0°; index i → angle = i/totalPts * 360°.
            // The first and last sampled points are replaced by the exact ellipse points above
            // (pPalmarStart / pPalmarEnd) for geometric continuity with the adjacent Ellipse arcs.
            let bsplinePtIds = null;
            if (isParametric) {
                const totalPts   = boundary.points.length;
                const fpStartIdx = Math.round(palmarStart / 360 * totalPts);
                const fpEndIdx   = Math.round(palmarEnd   / 360 * totalPts) % totalPts;

                bsplinePtIds = [pPalmarStart];
                for (let i = fpStartIdx + 1; i < fpEndIdx; i++) {
                    const pid = pointId++;
                    const pt  = boundary.points[i];
                    geo.push(`Point(${pid}) = {${fmt(pt.x)}, ${fmt(pt.y)}, 0};  // palmar pt ${i}`);
                    bsplinePtIds.push(pid);
                }
                bsplinePtIds.push(pPalmarEnd);
                geo.push('');
            }

            // --- Ellipse arcs ---

            // Segment: 0° → nail-start
            const nailStartCurve = curveId++;
            geo.push(`// Segment: 0° → nail-start (Ellipse)`);
            geo.push(`Ellipse(${nailStartCurve}) = {${p0deg}, ${pc}, ${p0deg}, ${pNailStart}};  // 0° → ${nailStartAngle}°`);

            // Segments within nail region (omitted for stratum-corneum-inner)
            let nailCurve1 = null;
            let nailCurve2 = null;
            if (!skipNailRegion) {
                nailCurve1 = curveId++;
                geo.push(`// Segment: nail-start → 90° (Ellipse)`);
                geo.push(`Ellipse(${nailCurve1}) = {${pNailStart}, ${pc}, ${p0deg}, ${p90}};  // ${nailStartAngle}° → 90°`);
                nailCurve2 = curveId++;
                geo.push(`// Segment: 90° → nail-end (Ellipse)`);
                geo.push(`Ellipse(${nailCurve2}) = {${p90}, ${pc}, ${p0deg}, ${pNailEnd}};  // 90° → ${nailEndAngle}°`);
            }

            // Segment: nail-end → 180°
            const nailEndCurve = curveId++;
            geo.push(`// Segment: nail-end → 180° (Ellipse)`);
            geo.push(`Ellipse(${nailEndCurve}) = {${pNailEnd}, ${pc}, ${p0deg}, ${p180}};  // ${nailEndAngle}° → 180°`);

            // Segment: 180° → palmar-start
            const palmarApproachCurve = curveId++;
            geo.push(`// Segment: 180° → palmar-start (Ellipse)`);
            geo.push(`Ellipse(${palmarApproachCurve}) = {${p180}, ${pc}, ${p0deg}, ${pPalmarStart}};  // 180° → ${palmarStart.toFixed(2)}°`);

            // Segment(s): palmar-start → palmar-end
            // For BSpline: single arc covering the full palmar range
            // For Ellipse: split at 270° (palmar center = minor-axis bottom) so no single arc
            //              crosses the minor-axis endpoint as an interior point
            let palmarCoreCurves;
            if (isParametric) {
                const c = curveId++;
                geo.push(`// Segment: palmar-start → palmar-end (BSpline, ${bsplinePtIds.length} pts)`);
                geo.push(`BSpline(${c}) = {${bsplinePtIds.join(', ')}};`);
                palmarCoreCurves = [c];
            } else {
                const p270 = pointId++;
                geo.push(`Point(${p270}) = {${fmt(cx)}, ${fmt(cy - ry)}, 0};  // 270° (palmar center)`);
                const c1 = curveId++;
                geo.push(`// Segment: palmar-start → 270° (Ellipse)`);
                geo.push(`Ellipse(${c1}) = {${pPalmarStart}, ${pc}, ${p0deg}, ${p270}};  // ${palmarStart.toFixed(2)}° → 270°`);
                const c2 = curveId++;
                geo.push(`// Segment: 270° → palmar-end (Ellipse)`);
                geo.push(`Ellipse(${c2}) = {${p270}, ${pc}, ${p0deg}, ${pPalmarEnd}};  // 270° → ${palmarEnd.toFixed(2)}°`);
                palmarCoreCurves = [c1, c2];
            }

            // Segment: palmar-end → 0°
            const palmarRecedeCurve = curveId++;
            geo.push(`// Segment: palmar-end → 0° (Ellipse)`);
            geo.push(`Ellipse(${palmarRecedeCurve}) = {${pPalmarEnd}, ${pc}, ${p0deg}, ${p0deg}};  // ${palmarEnd.toFixed(2)}° → 360°`);

            geo.push('');

            // Collect all curves in CCW traversal order starting from 0°
            const allCurves = skipNailRegion
                ? [nailStartCurve, nailEndCurve, palmarApproachCurve, ...palmarCoreCurves, palmarRecedeCurve]
                : [nailStartCurve, nailCurve1, nailCurve2, nailEndCurve, palmarApproachCurve, ...palmarCoreCurves, palmarRecedeCurve];

            // refineCurves: non-empty only for the BSpline boundary (used for mesh size control)
            const refineCurves = isParametric ? palmarCoreCurves : [];

            // Register in shared maps
            boundaryToCurves[boundary.id] = allCurves;
            boundaryToPoints[boundary.id] = { pNailStart, pNailEnd, pPalmarStart, pPalmarEnd, p0deg, p90, p180, pc };

            return {
                allCurves,
                nailStartCurve,
                nailCurve1,
                nailCurve2,
                nailEndCurve,
                palmarApproachCurve,
                palmarCoreCurves,
                palmarRecedeCurve,
                refineCurves,
                pNailStart,
                pNailEnd,
                pPalmarStart,
                pPalmarEnd,
                p0deg,
                p90,
                p180,
                pc
            };
        }

        // Helper: Create simple ellipse boundary (4 arcs, no splitting)
        function createEllipseBoundary(boundary, comment) {
            const cx = boundary.center[0];
            const cy = boundary.center[1];
            const rx = boundary.width / 2;
            const ry = boundary.height / 2;

            geo.push(`// ${comment}`);

            // Create 5 points: 4 cardinal points + center
            const p1 = pointId++;  // Right (0°) - Major axis point
            const p2 = pointId++;  // Top (90°)
            const p3 = pointId++;  // Left (180°)
            const p4 = pointId++;  // Bottom (270°)
            const pc = pointId++;  // Center

            geo.push(`Point(${p1}) = {${fmt(cx + rx)}, ${fmt(cy)}, 0};`);
            geo.push(`Point(${p2}) = {${fmt(cx)}, ${fmt(cy + ry)}, 0};`);
            geo.push(`Point(${p3}) = {${fmt(cx - rx)}, ${fmt(cy)}, 0};`);
            geo.push(`Point(${p4}) = {${fmt(cx)}, ${fmt(cy - ry)}, 0};`);
            geo.push(`Point(${pc}) = {${fmt(cx)}, ${fmt(cy)}, 0};`);

            // Create 4 ellipse arcs with consistent major axis point (p1)
            const c1 = curveId++;  // Right → Top (0° → 90°)
            const c2 = curveId++;  // Top → Left (90° → 180°)
            const c3 = curveId++;  // Left → Bottom (180° → 270°)
            const c4 = curveId++;  // Bottom → Right (270° → 360°)

            geo.push(`Ellipse(${c1}) = {${p1}, ${pc}, ${p1}, ${p2}};  // Major axis: p${p1}`);
            geo.push(`Ellipse(${c2}) = {${p2}, ${pc}, ${p1}, ${p3}};  // Major axis: p${p1}`);
            geo.push(`Ellipse(${c3}) = {${p3}, ${pc}, ${p1}, ${p4}};  // Major axis: p${p1}`);
            geo.push(`Ellipse(${c4}) = {${p4}, ${pc}, ${p1}, ${p1}};  // Major axis: p${p1}`);
            geo.push('');

            boundaryToCurves[boundary.id] = [c1, c2, c3, c4];
            boundaryToPoints[boundary.id] = { p1, p2, p3, p4, pc };

            return [c1, c2, c3, c4];
        }

        // Create segmented boundaries (topology is identical regardless of ridgeHeight;
        // only palmarCoreCurve differs: BSpline when parametric-curve, Ellipse otherwise)
        const fingerOuterBoundary = geometry.boundaries.find(b => b.id === 'finger-outer');
        const fo = createSegmentedBoundary(
            fingerOuterBoundary, fpMeta, false, 'Finger outer boundary');

        const scInnerBoundary = geometry.boundaries.find(b => b.id === 'stratum-corneum-inner');
        const sc = createSegmentedBoundary(
            scInnerBoundary, fpMeta, true, 'Stratum corneum inner boundary');

        // Epidermis-inner boundary uses its own independent metadata (epidermisDermisMetadata),
        // since dermal papillae angular extent/wavelength/height are independent of fingerprint
        // parameters. createSegmentedBoundary() is reused unchanged; it only branches on
        // boundary.type ('parametric-curve' vs 'ellipse'), which is already set correctly by
        // Geometry.generateEpidermisDermisBoundary() based on h_ed.
        const edMeta = geometry.epidermisDermisMetadata || {};
        const ep = createSegmentedBoundary(
            geometry.boundaries.find(b => b.id === 'epidermis-inner'),
            edMeta, false, 'Epidermis inner boundary');


        const dermisInnerCurves = createEllipseBoundary(
            geometry.boundaries.find(b => b.id === 'dermis-inner'),
            'Dermis inner boundary'
        );

        const boneCurves = createEllipseBoundary(
            geometry.boundaries.find(b => b.id === 'bone'),
            'Bone boundary'
        );

        // Connecting lines at nail edges (finger-outer → sc-inner → epidermis-inner)
        geo.push('// Connecting lines at nail edges');
        const cConnectRightUpper = curveId++;
        const cConnectRightLower = curveId++;
        const cConnectLeftUpper  = curveId++;
        const cConnectLeftLower  = curveId++;
        geo.push(`Line(${cConnectRightUpper}) = {${fo.pNailStart}, ${sc.pNailStart}};  // nail-start: finger-outer → sc-inner`);
        geo.push(`Line(${cConnectRightLower}) = {${sc.pNailStart}, ${ep.pNailStart}};  // nail-start: sc-inner → epidermis-inner`);
        geo.push(`Line(${cConnectLeftUpper})  = {${fo.pNailEnd},   ${sc.pNailEnd}};    // nail-end: finger-outer → sc-inner`);
        geo.push(`Line(${cConnectLeftLower})  = {${sc.pNailEnd},   ${ep.pNailEnd}};    // nail-end: sc-inner → epidermis-inner`);
        geo.push('');

        geo.push('// Curve Loops and Plane Surfaces');
        geo.push('');

        // 1. Stratum Corneum: annular region between finger-outer and sc-inner, excluding nail
        // Loop traversal (CCW starting at fo.p0deg = 0°):
        //   Outer FO: nailStartCurve → cConnectRightUpper ↓
        //   Inner SC: -nailStartCurve → -palmarRecedeCurve → -palmarCoreCurves(reversed)
        //             → -palmarApproachCurve → -nailEndCurve → -cConnectLeftUpper ↑
        //   Outer FO: nailEndCurve → palmarApproachCurve → palmarCoreCurves → palmarRecedeCurve
        const scLoopId = curveLoopId++;
        geo.push('// Stratum Corneum (annular, excluding nail)');
        geo.push(`Curve Loop(${scLoopId}) = {`);
        geo.push(`  ${fo.nailStartCurve},        // 0° → nail-start (finger-outer)`);
        geo.push(`  ${cConnectRightUpper},         // nail-start: finger-outer → sc-inner`);
        geo.push(`  -${sc.nailStartCurve},         // nail-start → 0° (sc-inner, reversed)`);
        geo.push(`  -${sc.palmarRecedeCurve},      // 0° → palmar-end (sc-inner, reversed)`);
        [...sc.palmarCoreCurves].reverse().forEach(cid => geo.push(`  -${cid},`));
        geo.push(`  -${sc.palmarApproachCurve},    // palmar-start → 180° (sc-inner, reversed)`);
        geo.push(`  -${sc.nailEndCurve},           // 180° → nail-end (sc-inner, reversed)`);
        geo.push(`  -${cConnectLeftUpper},          // nail-end: sc-inner → finger-outer (reversed)`);
        geo.push(`  ${fo.nailEndCurve},            // nail-end → 180° (finger-outer)`);
        geo.push(`  ${fo.palmarApproachCurve},     // 180° → palmar-start (finger-outer)`);
        fo.palmarCoreCurves.forEach(cid => geo.push(`  ${cid},`));
        geo.push(`  ${fo.palmarRecedeCurve}        // palmar-end → 0° (finger-outer, closes loop)`);
        geo.push('};');
        const scSurfaceId = surfaceId++;
        geo.push(`Plane Surface(${scSurfaceId}) = {${scLoopId}};`);
        geo.push('');

        // 2. Epidermis: annular region between sc-inner and epidermis-inner, excluding nail
        // Loop traversal (CCW starting at sc.p0deg = 0°):
        //   Outer SC: nailStartCurve → cConnectRightLower ↓
        //   Inner EP: -nailStartCurve → -palmarRecedeCurve → -palmarCoreCurves(reversed)
        //             → -palmarApproachCurve → -nailEndCurve → -cConnectLeftLower ↑
        //   Outer SC: nailEndCurve → palmarApproachCurve → palmarCoreCurves → palmarRecedeCurve
        const epidermisLoopId = curveLoopId++;
        geo.push('// Epidermis (annular, excluding nail)');
        geo.push(`Curve Loop(${epidermisLoopId}) = {`);
        geo.push(`  ${sc.nailStartCurve},          // 0° → nail-start (sc-inner)`);
        geo.push(`  ${cConnectRightLower},           // nail-start: sc-inner → epidermis-inner`);
        geo.push(`  -${ep.nailStartCurve},           // nail-start → 0° (epidermis-inner, reversed)`);
        geo.push(`  -${ep.palmarRecedeCurve},        // 0° → palmar-end (epidermis-inner, reversed)`);
        [...ep.palmarCoreCurves].reverse().forEach(cid => geo.push(`  -${cid},`));
        geo.push(`  -${ep.palmarApproachCurve},      // palmar-start → 180° (epidermis-inner, reversed)`);
        geo.push(`  -${ep.nailEndCurve},             // 180° → nail-end (epidermis-inner, reversed)`);
        geo.push(`  -${cConnectLeftLower},            // nail-end: epidermis-inner → sc-inner (reversed)`);
        geo.push(`  ${sc.nailEndCurve},             // nail-end → 180° (sc-inner)`);
        geo.push(`  ${sc.palmarApproachCurve},      // 180° → palmar-start (sc-inner)`);
        sc.palmarCoreCurves.forEach(cid => geo.push(`  ${cid},`));
        geo.push(`  ${sc.palmarRecedeCurve}         // palmar-end → 0° (sc-inner, closes loop)`);
        geo.push('};');
        const epidermisSurfaceId = surfaceId++;
        geo.push(`Plane Surface(${epidermisSurfaceId}) = {${epidermisLoopId}};`);
        geo.push('');

        // 3. Dermis: annular region between epidermis-inner and dermis-inner
        const dermisOuterLoopId = curveLoopId++;
        const dermisInnerLoopId = curveLoopId++;
        geo.push('// Dermis');
        geo.push(`Curve Loop(${dermisOuterLoopId}) = {${ep.allCurves.join(', ')}};  // outer boundary`);
        geo.push(`Curve Loop(${dermisInnerLoopId}) = {${dermisInnerCurves.join(', ')}};  // inner boundary`);
        const dermisSurfaceId = surfaceId++;
        geo.push(`Plane Surface(${dermisSurfaceId}) = {${dermisOuterLoopId}, ${dermisInnerLoopId}};`);
        geo.push('');

        // 4. Subcutaneous: dermis-inner region with bone hole
        const subcutaneousOuterLoopId = curveLoopId++;
        const subcutaneousInnerLoopId = curveLoopId++;
        geo.push('// Subcutaneous tissue');
        geo.push(`Curve Loop(${subcutaneousOuterLoopId}) = {${dermisInnerCurves.join(', ')}};  // outer boundary`);
        geo.push(`Curve Loop(${subcutaneousInnerLoopId}) = {${boneCurves.join(', ')}};  // bone hole`);
        const subcutaneousSurfaceId = surfaceId++;
        geo.push(`Plane Surface(${subcutaneousSurfaceId}) = {${subcutaneousOuterLoopId}, ${subcutaneousInnerLoopId}};`);
        geo.push('');

        // 5. Bone
        const boneLoopId = curveLoopId++;
        geo.push('// Bone');
        geo.push(`Curve Loop(${boneLoopId}) = {${boneCurves.join(', ')}};`);
        const boneSurfaceId = surfaceId++;
        geo.push(`Plane Surface(${boneSurfaceId}) = {${boneLoopId}};`);
        geo.push('');

        // 6. Nail: dorsal cap region between finger-outer and epidermis-inner
        // Loop traversal (CCW starting at fo.pNailStart):
        //   Outer FO: nailCurve1 → nailCurve2 → cConnectLeftUpper ↓ → cConnectLeftLower ↓
        //   Inner EP: -nailCurve2 → -nailCurve1 → -cConnectRightLower ↑ → -cConnectRightUpper ↑
        const nailLoopId = curveLoopId++;
        geo.push('// Nail (dorsal cap)');
        geo.push(`Curve Loop(${nailLoopId}) = {`);
        geo.push(`  ${fo.nailCurve1},              // nail-start → 90° (finger-outer)`);
        geo.push(`  ${fo.nailCurve2},              // 90° → nail-end (finger-outer)`);
        geo.push(`  ${cConnectLeftUpper},           // nail-end: finger-outer → sc-inner`);
        geo.push(`  ${cConnectLeftLower},           // nail-end: sc-inner → epidermis-inner`);
        geo.push(`  -${ep.nailCurve2},              // nail-end → 90° (epidermis-inner, reversed)`);
        geo.push(`  -${ep.nailCurve1},              // 90° → nail-start (epidermis-inner, reversed)`);
        geo.push(`  -${cConnectRightLower},          // nail-start: epidermis-inner → sc-inner (reversed)`);
        geo.push(`  -${cConnectRightUpper}           // nail-start: sc-inner → finger-outer (reversed, closes loop)`);
        geo.push('};');
        const nailSurfaceId = surfaceId++;
        geo.push(`Plane Surface(${nailSurfaceId}) = {${nailLoopId}};`);
        geo.push('');

        // Physical surfaces (6 tissue layers)
        geo.push('// Physical Surfaces (Tissues)');
        geo.push(`Physical Surface("Stratum Corneum", 1) = {${scSurfaceId}};`);
        geo.push(`Physical Surface("Epidermis", 2) = {${epidermisSurfaceId}};`);
        geo.push(`Physical Surface("Dermis", 3) = {${dermisSurfaceId}};`);
        geo.push(`Physical Surface("Subcutaneous", 4) = {${subcutaneousSurfaceId}};`);
        geo.push(`Physical Surface("Bone", 5) = {${boneSurfaceId}};`);
        geo.push(`Physical Surface("Nail", 6) = {${nailSurfaceId}};`);
        geo.push('');

        // Physical curves (boundaries)
        geo.push('// Physical Curves (Boundaries)');
        geo.push(`Physical Curve("Outer Boundary", 1) = {${fo.allCurves.join(', ')}};`);
        geo.push(`Physical Curve("Bone Boundary", 2) = {${boneCurves.join(', ')}};`);
        geo.push(`Physical Curve("Nail Bed", 3) = {${ep.nailCurve1}, ${ep.nailCurve2}};  // Epidermis inner dorsal arcs (nail bed)`);
        geo.push('');

        // Mesh-size control: refine near BSpline palmar curves when fingerprint ridges and/or
        // dermal papillae are active; empty entries contribute nothing when the corresponding
        // boundary has an Ellipse palmarCoreCurve (ridgeHeight=0 / epidermisDermisHeight=0).
        const fineCurveIds = [...fo.refineCurves, ...sc.refineCurves, ...ep.refineCurves];

        const meshLines = generateMeshControlGEO(params.mesh, fineCurveIds);
        meshLines.forEach(line => geo.push(line));

        return geo.join('\n');
    }

    /**
     * Download GEO as file
     * @param {Object} params - Parameter object
     * @param {Object} geometry - Geometry model
     * @param {string} filename - Output filename
     */
    function downloadGEO(params, geometry, filename = 'parafin-model.geo') {
        const geoString = generateGEO(params, geometry);
        
        // Create blob
        const blob = new Blob([geoString], { type: 'text/plain' });
        
        // Create object URL
        const url = URL.createObjectURL(blob);
        
        // Create temporary download link
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        
        // Trigger download
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------

    return {
        generateJSON:          _ProjectIO.generateJSON,
        downloadJSON:          _ProjectIO.downloadJSON,
        generateGEO,
        downloadGEO,
        importProjectFromText: _ProjectIO.importProjectFromText,
    };
})();

