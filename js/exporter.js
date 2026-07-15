/**
 * exporter.js - JSON import/export functionality for ParaFin
 *
 * This module handles:
 * - Saving the current input settings as a minimal project JSON file
 * - Loading a project JSON file and restoring application settings
 * - Generating Gmsh GEO format for mesh generation
 */

const Exporter = (function() {
    'use strict';

    const APP_VERSION = '0.1.0';
    const PROJECT_FORMAT = 'parafin-project';
    const SUPPORTED_VERSIONS = [1];

    // ---------------------------------------------------------------------------
    // Export
    // ---------------------------------------------------------------------------

    /**
     * Build the project data object from current parameters.
     * Only user-configurable input values are included; no derived data,
     * boundary coordinates, or Gmsh IDs.
     * @param {Object} params - Parameter object
     * @returns {Object} Project data object
     */
    function generateJSON(params) {
        return {
            format: PROJECT_FORMAT,
            formatVersion: 1,
            units: 'mm',
            geometry: {
                fingerWidth: params.fingerWidth,
                fingerHeight: params.fingerHeight,
                stratumCorneumThickness: params.stratumCorneumThickness,
                epidermisThickness: params.epidermisThickness,
                dermisThickness: params.dermisThickness,
                boneWidth: params.boneWidth,
                boneHeight: params.boneHeight,
                boneOffsetY: params.boneOffsetY,
                nailAngularExtent: params.nailAngularExtent
            },
            fingerprint: {
                fingerprintAngularExtent: params.fingerprintAngularExtent,
                fingerprintWavelength: params.fingerprintWavelength,
                fingerprintRidgeHeight: params.fingerprintRidgeHeight
            },
            mesh: {
                fineSize: params.mesh.fineSize,
                bulkSize: params.mesh.bulkSize,
                fineDistance: params.mesh.fineDistance,
                transitionDistance: params.mesh.transitionDistance,
                distanceSampling: params.mesh.distanceSampling
            }
        };
    }

    /**
     * Download the project as a JSON file.
     * @param {Object} params - Parameter object
     * @param {string} filename - Output filename
     */
    function downloadJSON(params, filename = 'parafin-project.json') {
        const jsonData = generateJSON(params);
        const jsonString = JSON.stringify(jsonData, null, 2);
        
        // Create blob
        const blob = new Blob([jsonString], { type: 'application/json' });
        
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

        // Helper: Create parametric curve boundary (for fingerprint ridges)
        function createParametricCurveBoundary(boundary, comment) {
            geo.push(`// ${comment} (Parametric Curve with ${boundary.points.length} points)`);
            
            // Create points from parametric curve
            const pointIds = [];
            for (let i = 0; i < boundary.points.length; i++) {
                const pid = pointId++;
                const pt = boundary.points[i];
                geo.push(`Point(${pid}) = {${fmt(pt.x)}, ${fmt(pt.y)}, 0};`);
                pointIds.push(pid);
            }
            
            // Create BSpline curve through all points
            const splineId = curveId++;
            geo.push(`BSpline(${splineId}) = {${pointIds.join(', ')}};`);
            geo.push('');
            
            boundaryToCurves[boundary.id] = [splineId];
            boundaryToPoints[boundary.id] = { pointIds };
            
            return [splineId];
        }

        // Helper: Create hybrid fingerprint boundary (Ellipse arcs outside fingerprint region + BSpline inside)
        // Used when boundary.type === 'parametric-curve' (fingerprint ridges are active).
        // Returns named curve/point properties instead of a plain index array to avoid positional coupling.
        // Parameters:
        //   boundary       - parametric-curve boundary object (center, width, height, points)
        //   fpMetaData     - geometry.fingerprintMetadata with palmarStart and palmarEnd angles (degrees)
        //   skipNailRegion - true for stratum-corneum-inner (no nail arcs needed), false for finger-outer
        //   comment        - label written as a GEO comment
        function createHybridFingerprintBoundary(boundary, fpMetaData, skipNailRegion, comment) {
            const cx = boundary.center[0];
            const cy = boundary.center[1];
            const rx = boundary.width / 2;
            const ry = boundary.height / 2;

            const palmarStart = fpMetaData.palmarStart;  // degrees (e.g. 225)
            const palmarEnd   = fpMetaData.palmarEnd;    // degrees (e.g. 315)

            const startRad = nailStartAngle * Math.PI / 180;
            const endRad   = nailEndAngle   * Math.PI / 180;
            const psRad    = palmarStart    * Math.PI / 180;
            const peRad    = palmarEnd      * Math.PI / 180;

            geo.push(`// ${comment}`);

            // --- Gmsh Points (exact ellipse coordinates; displacement = 0 at fingerprint region boundaries) ---

            // 0° right point — also used as major-axis reference in every Ellipse() call
            const p0deg = pointId++;
            geo.push(`Point(${p0deg}) = {${fmt(cx + rx)}, ${fmt(cy)}, 0};  // 0° (right, major-axis ref)`);

            // 180° left point
            const p180 = pointId++;
            geo.push(`Point(${p180})  = {${fmt(cx - rx)}, ${fmt(cy)}, 0};  // 180° (left)`);

            // Ellipse center
            const pc = pointId++;
            geo.push(`Point(${pc})    = {${fmt(cx)}, ${fmt(cy)}, 0};  // center`);

            // 90° top point (finger-outer only; sc-inner skips nail region so this point is not needed)
            let p90 = null;
            if (!skipNailRegion) {
                p90 = pointId++;
                geo.push(`Point(${p90})   = {${fmt(cx)}, ${fmt(cy + ry)}, 0};  // 90° (top)`);
            }

            // Nail split points
            const pNailStart = pointId++;
            const pNailEnd   = pointId++;
            geo.push(`Point(${pNailStart}) = {${fmt(cx + rx * Math.cos(startRad))}, ${fmt(cy + ry * Math.sin(startRad))}, 0};  // nail-start (${nailStartAngle}°)`);
            geo.push(`Point(${pNailEnd})   = {${fmt(cx + rx * Math.cos(endRad))},   ${fmt(cy + ry * Math.sin(endRad))},   0};  // nail-end (${nailEndAngle}°)`);

            // Fingerprint region split points (exact ellipse, displacement = 0 at these boundaries)
            const pPalmarStart = pointId++;
            const pPalmarEnd   = pointId++;
            geo.push(`Point(${pPalmarStart}) = {${fmt(cx + rx * Math.cos(psRad))}, ${fmt(cy + ry * Math.sin(psRad))}, 0};  // fingerprint-start (${palmarStart.toFixed(2)}°)`);
            geo.push(`Point(${pPalmarEnd})   = {${fmt(cx + rx * Math.cos(peRad))}, ${fmt(cy + ry * Math.sin(peRad))}, 0};  // fingerprint-end (${palmarEnd.toFixed(2)}°)`);
            geo.push('');

            // --- BSpline control points (interior of fingerprint region from parametric boundary data) ---
            // Index 0 of boundary.points corresponds to 0°; index i → angle = i/totalPts * 360°.
            // The first and last sampled points in the fingerprint range are replaced by the exact
            // ellipse points above (pPalmarStart / pPalmarEnd) for geometric continuity with the Ellipse arcs.
            const totalPts   = boundary.points.length;
            const fpStartIdx = Math.round(palmarStart / 360 * totalPts);
            const fpEndIdx   = Math.round(palmarEnd   / 360 * totalPts) % totalPts;

            const bsplinePtIds = [pPalmarStart];
            for (let i = fpStartIdx + 1; i < fpEndIdx; i++) {
                const pid = pointId++;
                const pt  = boundary.points[i];
                geo.push(`Point(${pid}) = {${fmt(pt.x)}, ${fmt(pt.y)}, 0};  // fingerprint pt ${i}`);
                bsplinePtIds.push(pid);
            }
            bsplinePtIds.push(pPalmarEnd);
            geo.push('');

            // --- Ellipse arcs (regions outside the fingerprint range) ---

            // Segment: 0° → nail-start
            const nailStartCurve = curveId++;
            geo.push(`// Segment: 0° → nail-start (Ellipse)`);
            geo.push(`Ellipse(${nailStartCurve}) = {${p0deg}, ${pc}, ${p0deg}, ${pNailStart}};  // 0° → ${nailStartAngle}°`);

            // Segments within nail region (finger-outer only; sc-inner has no arc crossing through the nail)
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

            // Segment: 180° → fingerprint-start
            const palmarApproachCurve = curveId++;
            geo.push(`// Segment: 180° → fingerprint-start (Ellipse)`);
            geo.push(`Ellipse(${palmarApproachCurve}) = {${p180}, ${pc}, ${p0deg}, ${pPalmarStart}};  // 180° → ${palmarStart.toFixed(2)}°`);

            // Segment: fingerprint-start → fingerprint-end (BSpline through all ridge points)
            const fingerprintCurve = curveId++;
            geo.push(`// Segment: fingerprint-start → fingerprint-end (BSpline, ${bsplinePtIds.length} pts)`);
            geo.push(`BSpline(${fingerprintCurve}) = {${bsplinePtIds.join(', ')}};`);

            // Segment: fingerprint-end → 0°
            const palmarRecedeCurve = curveId++;
            geo.push(`// Segment: fingerprint-end → 0° (Ellipse)`);
            geo.push(`Ellipse(${palmarRecedeCurve}) = {${pPalmarEnd}, ${pc}, ${p0deg}, ${p0deg}};  // ${palmarEnd.toFixed(2)}° → 360°`);

            geo.push('');

            // Collect all curves in CCW traversal order starting from 0°
            const allCurves = skipNailRegion
                ? [nailStartCurve, nailEndCurve, palmarApproachCurve, fingerprintCurve, palmarRecedeCurve]
                : [nailStartCurve, nailCurve1, nailCurve2, nailEndCurve, palmarApproachCurve, fingerprintCurve, palmarRecedeCurve];

            // Register in shared maps (for Physical Curve output and compatibility with non-fingerprint paths)
            boundaryToCurves[boundary.id] = allCurves;
            boundaryToPoints[boundary.id] = { pNailStart, pNailEnd, pPalmarStart, pPalmarEnd, p0deg, p90, p180, pc };

            return {
                allCurves,
                nailStartCurve,
                nailCurve1,
                nailCurve2,
                nailEndCurve,
                palmarApproachCurve,
                fingerprintCurve,
                palmarRecedeCurve,
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

        // Helper: Create split ellipse boundary (split by nail angles)
        function createSplitEllipseBoundary(boundary, comment, skipNailRegion = false) {
            const cx = boundary.center[0];
            const cy = boundary.center[1];
            const rx = boundary.width / 2;
            const ry = boundary.height / 2;

            geo.push(`// ${comment}`);

            // Convert angles to radians
            const startRad = nailStartAngle * Math.PI / 180;
            const endRad = nailEndAngle * Math.PI / 180;

            // Create cardinal points
            const p1 = pointId++;  // Right (0°) - Major axis point
            const p2 = pointId++;  // Top (90°)
            const p3 = pointId++;  // Left (180°)
            const p4 = pointId++;  // Bottom (270°)
            const pc = pointId++;  // Center

            // Create nail split points
            const pNailStart = pointId++;  // Point at nail start angle
            const pNailEnd = pointId++;    // Point at nail end angle

            geo.push(`Point(${p1}) = {${fmt(cx + rx)}, ${fmt(cy)}, 0};  // 0°`);
            geo.push(`Point(${p2}) = {${fmt(cx)}, ${fmt(cy + ry)}, 0};  // 90°`);
            geo.push(`Point(${p3}) = {${fmt(cx - rx)}, ${fmt(cy)}, 0};  // 180°`);
            geo.push(`Point(${p4}) = {${fmt(cx)}, ${fmt(cy - ry)}, 0};  // 270°`);
            geo.push(`Point(${pc}) = {${fmt(cx)}, ${fmt(cy)}, 0};  // Center`);
            geo.push(`Point(${pNailStart}) = {${fmt(cx + rx * Math.cos(startRad))}, ${fmt(cy + ry * Math.sin(startRad))}, 0};  // ${nailStartAngle}°`);
            geo.push(`Point(${pNailEnd}) = {${fmt(cx + rx * Math.cos(endRad))}, ${fmt(cy + ry * Math.sin(endRad))}, 0};  // ${nailEndAngle}°`);

            const curves = [];

            if (skipNailRegion) {
                // Skip nail region: only create arcs outside nail range
                // Arc 1: 0° → nailStart
                const c1 = curveId++;
                geo.push(`Ellipse(${c1}) = {${p1}, ${pc}, ${p1}, ${pNailStart}};  // 0° → ${nailStartAngle}°`);
                curves.push(c1);

                // Arc 2: nailEnd → 180°
                const c2 = curveId++;
                geo.push(`Ellipse(${c2}) = {${pNailEnd}, ${pc}, ${p1}, ${p3}};  // ${nailEndAngle}° → 180°`);
                curves.push(c2);

                // Arc 3: 180° → 270°
                const c3 = curveId++;
                geo.push(`Ellipse(${c3}) = {${p3}, ${pc}, ${p1}, ${p4}};  // 180° → 270°`);
                curves.push(c3);

                // Arc 4: 270° → 360° (0°)
                const c4 = curveId++;
                geo.push(`Ellipse(${c4}) = {${p4}, ${pc}, ${p1}, ${p1}};  // 270° → 360°`);
                curves.push(c4);
            } else {
                // Full boundary with nail split points
                // Arc 1: 0° → nailStart
                const c1 = curveId++;
                geo.push(`Ellipse(${c1}) = {${p1}, ${pc}, ${p1}, ${pNailStart}};  // 0° → ${nailStartAngle}°`);
                curves.push(c1);

                // Arc 2: nailStart → 90°
                const c2 = curveId++;
                geo.push(`Ellipse(${c2}) = {${pNailStart}, ${pc}, ${p1}, ${p2}};  // ${nailStartAngle}° → 90°`);
                curves.push(c2);

                // Arc 3: 90° → nailEnd
                const c3 = curveId++;
                geo.push(`Ellipse(${c3}) = {${p2}, ${pc}, ${p1}, ${pNailEnd}};  // 90° → ${nailEndAngle}°`);
                curves.push(c3);

                // Arc 4: nailEnd → 180°
                const c4 = curveId++;
                geo.push(`Ellipse(${c4}) = {${pNailEnd}, ${pc}, ${p1}, ${p3}};  // ${nailEndAngle}° → 180°`);
                curves.push(c4);

                // Arc 5: 180° → 270°
                const c5 = curveId++;
                geo.push(`Ellipse(${c5}) = {${p3}, ${pc}, ${p1}, ${p4}};  // 180° → 270°`);
                curves.push(c5);

                // Arc 6: 270° → 360° (0°)
                const c6 = curveId++;
                geo.push(`Ellipse(${c6}) = {${p4}, ${pc}, ${p1}, ${p1}};  // 270° → 360°`);
                curves.push(c6);
            }

            geo.push('');

            boundaryToCurves[boundary.id] = curves;
            boundaryToPoints[boundary.id] = { p1, p2, p3, p4, pc, pNailStart, pNailEnd };

            return curves;
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

        // Create finger outer boundary (hybrid Ellipse+BSpline when fingerprint ridges are active)
        let foH = null;
        const fingerOuterBoundary = geometry.boundaries.find(b => b.id === 'finger-outer');
        let fingerOuterCurves;
        if (fingerOuterBoundary.type === 'parametric-curve') {
            foH = createHybridFingerprintBoundary(
                fingerOuterBoundary, fpMeta, false,
                'Finger outer boundary (hybrid: Ellipse arcs + BSpline for fingerprint region)');
            fingerOuterCurves = foH.allCurves;
        } else {
            fingerOuterCurves = createSplitEllipseBoundary(fingerOuterBoundary, 'Finger outer boundary', false);
        }
        const fingerOuterPoints = boundaryToPoints['finger-outer'];

        // Create stratum corneum inner boundary (hybrid Ellipse+BSpline when fingerprint ridges are active)
        let scH = null;
        const scInnerBoundary = geometry.boundaries.find(b => b.id === 'stratum-corneum-inner');
        let scInnerCurves;
        if (scInnerBoundary.type === 'parametric-curve') {
            scH = createHybridFingerprintBoundary(
                scInnerBoundary, fpMeta, true,
                'Stratum corneum inner boundary (hybrid: Ellipse arcs + BSpline for fingerprint region)');
            scInnerCurves = scH.allCurves;
        } else {
            scInnerCurves = createSplitEllipseBoundary(scInnerBoundary, 'Stratum corneum inner boundary', true);
        }
        const scInnerPoints = boundaryToPoints['stratum-corneum-inner'];

        const epidermisInnerCurves = createSplitEllipseBoundary(
            geometry.boundaries.find(b => b.id === 'epidermis-inner'),
            'Epidermis inner boundary',
            false   // Don't skip nail region
        );
        const epidermisInnerPoints = boundaryToPoints['epidermis-inner'];

        const dermisInnerCurves = createEllipseBoundary(
            geometry.boundaries.find(b => b.id === 'dermis-inner'),
            'Dermis inner boundary'
        );

        const boneCurves = createEllipseBoundary(
            geometry.boundaries.find(b => b.id === 'bone'),
            'Bone boundary'
        );

        // Fingerprint mode: build full 6-layer tissue topology using hybrid Ellipse+BSpline boundaries
        if (hasFingerprintRidges) {
            geo.push('// Connecting lines at nail edges');

            // Right side (nail-start angle): finger-outer → sc-inner → epidermis-inner
            const cConnectRightUpper = curveId++;
            const cConnectRightLower = curveId++;
            geo.push(`Line(${cConnectRightUpper}) = {${foH.pNailStart}, ${scH.pNailStart}};  // nail-start: finger-outer → sc-inner`);
            geo.push(`Line(${cConnectRightLower}) = {${scH.pNailStart}, ${epidermisInnerPoints.pNailStart}};  // nail-start: sc-inner → epidermis-inner`);

            // Left side (nail-end angle): finger-outer → sc-inner → epidermis-inner
            const cConnectLeftUpper = curveId++;
            const cConnectLeftLower = curveId++;
            geo.push(`Line(${cConnectLeftUpper}) = {${foH.pNailEnd}, ${scH.pNailEnd}};  // nail-end: finger-outer → sc-inner`);
            geo.push(`Line(${cConnectLeftLower}) = {${scH.pNailEnd}, ${epidermisInnerPoints.pNailEnd}};  // nail-end: sc-inner → epidermis-inner`);
            geo.push('');

            // Epidermis inner arcs (named for clarity in loop definitions)
            const [ep1, ep2, ep3, ep4, ep5, ep6] = epidermisInnerCurves;

            geo.push('// Curve Loops and Plane Surfaces');
            geo.push('');

            // 1. Stratum Corneum: annular region between finger-outer and sc-inner, excluding nail
            // Loop traversal (CCW starting at foH.p0deg = 0°):
            //   Outer FO:  nailStartCurve → connectRightUpper ↓
            //   Inner SC:  -nailStartCurve → -palmarRecedeCurve → -fingerprintCurve
            //              → -palmarApproachCurve → -nailEndCurve → -connectLeftUpper ↓
            //   Outer FO:  nailEndCurve → palmarApproachCurve → fingerprintCurve → palmarRecedeCurve
            const fpScLoopId = curveLoopId++;
            geo.push(`// Stratum Corneum (annular, excluding nail)`);
            geo.push(`Curve Loop(${fpScLoopId}) = {`);
            geo.push(`  ${foH.nailStartCurve},        // 0° → nail-start (finger-outer)`);
            geo.push(`  ${cConnectRightUpper},         // nail-start: finger-outer → sc-inner`);
            geo.push(`  -${scH.nailStartCurve},        // nail-start → 0° (sc-inner, reversed)`);
            geo.push(`  -${scH.palmarRecedeCurve},     // 0° → fingerprint-end (sc-inner, reversed)`);
            geo.push(`  -${scH.fingerprintCurve},      // fingerprint-end → fingerprint-start (sc-inner, reversed)`);
            geo.push(`  -${scH.palmarApproachCurve},   // fingerprint-start → 180° (sc-inner, reversed)`);
            geo.push(`  -${scH.nailEndCurve},          // 180° → nail-end (sc-inner, reversed)`);
            geo.push(`  -${cConnectLeftUpper},          // nail-end: sc-inner → finger-outer (reversed)`);
            geo.push(`  ${foH.nailEndCurve},           // nail-end → 180° (finger-outer)`);
            geo.push(`  ${foH.palmarApproachCurve},    // 180° → fingerprint-start (finger-outer)`);
            geo.push(`  ${foH.fingerprintCurve},       // fingerprint-start → fingerprint-end (finger-outer, BSpline)`);
            geo.push(`  ${foH.palmarRecedeCurve}       // fingerprint-end → 0° (finger-outer, closes loop)`);
            geo.push(`};`);
            const fpScSurfaceId = surfaceId++;
            geo.push(`Plane Surface(${fpScSurfaceId}) = {${fpScLoopId}};`);
            geo.push('');

            // 2. Epidermis: annular region between sc-inner and epidermis-inner, excluding nail
            // Loop traversal (CCW starting at scH.p0deg = 0°):
            //   Outer SC:  nailStartCurve → connectRightLower ↓
            //   Inner EP:  -ep1 → -ep6 → -ep5 → -ep4 → -connectLeftLower ↓
            //   Outer SC:  nailEndCurve → palmarApproachCurve → fingerprintCurve → palmarRecedeCurve
            const fpEpLoopId = curveLoopId++;
            geo.push(`// Epidermis (annular, excluding nail)`);
            geo.push(`Curve Loop(${fpEpLoopId}) = {`);
            geo.push(`  ${scH.nailStartCurve},         // 0° → nail-start (sc-inner)`);
            geo.push(`  ${cConnectRightLower},          // nail-start: sc-inner → epidermis-inner`);
            geo.push(`  -${ep1},                        // nail-start → 0° (epidermis-inner, reversed)`);
            geo.push(`  -${ep6},                        // 0° → 270° (epidermis-inner, reversed)`);
            geo.push(`  -${ep5},                        // 270° → 180° (epidermis-inner, reversed)`);
            geo.push(`  -${ep4},                        // 180° → nail-end (epidermis-inner, reversed)`);
            geo.push(`  -${cConnectLeftLower},           // nail-end: epidermis-inner → sc-inner (reversed)`);
            geo.push(`  ${scH.nailEndCurve},            // nail-end → 180° (sc-inner)`);
            geo.push(`  ${scH.palmarApproachCurve},     // 180° → fingerprint-start (sc-inner)`);
            geo.push(`  ${scH.fingerprintCurve},        // fingerprint-start → fingerprint-end (sc-inner, BSpline)`);
            geo.push(`  ${scH.palmarRecedeCurve}        // fingerprint-end → 0° (sc-inner, closes loop)`);
            geo.push(`};`);
            const fpEpSurfaceId = surfaceId++;
            geo.push(`Plane Surface(${fpEpSurfaceId}) = {${fpEpLoopId}};`);
            geo.push('');

            // 3. Dermis: annular region between epidermis-inner and dermis-inner
            const fpDermisOuterLoopId = curveLoopId++;
            const fpDermisInnerLoopId = curveLoopId++;
            geo.push(`// Dermis`);
            geo.push(`Curve Loop(${fpDermisOuterLoopId}) = {${epidermisInnerCurves.join(', ')}};  // outer boundary`);
            geo.push(`Curve Loop(${fpDermisInnerLoopId}) = {${dermisInnerCurves.join(', ')}};  // inner boundary`);
            const fpDermisSurfaceId = surfaceId++;
            geo.push(`Plane Surface(${fpDermisSurfaceId}) = {${fpDermisOuterLoopId}, ${fpDermisInnerLoopId}};`);
            geo.push('');

            // 4. Subcutaneous: dermis-inner region with bone hole
            const fpSubcutOuterLoopId = curveLoopId++;
            const fpSubcutInnerLoopId = curveLoopId++;
            geo.push(`// Subcutaneous tissue`);
            geo.push(`Curve Loop(${fpSubcutOuterLoopId}) = {${dermisInnerCurves.join(', ')}};  // outer boundary`);
            geo.push(`Curve Loop(${fpSubcutInnerLoopId}) = {${boneCurves.join(', ')}};  // bone hole`);
            const fpSubcutSurfaceId = surfaceId++;
            geo.push(`Plane Surface(${fpSubcutSurfaceId}) = {${fpSubcutOuterLoopId}, ${fpSubcutInnerLoopId}};`);
            geo.push('');

            // 5. Bone
            const fpBoneLoopId = curveLoopId++;
            geo.push(`// Bone`);
            geo.push(`Curve Loop(${fpBoneLoopId}) = {${boneCurves.join(', ')}};`);
            const fpBoneSurfaceId = surfaceId++;
            geo.push(`Plane Surface(${fpBoneSurfaceId}) = {${fpBoneLoopId}};`);
            geo.push('');

            // 6. Nail: dorsal cap region between finger-outer and epidermis-inner
            // Loop traversal (CCW starting at foH.pNailStart):
            //   Outer FO:  nailCurve1 → nailCurve2 → connectLeftUpper ↓ → connectLeftLower ↓
            //   Inner EP:  -ep3 → -ep2 → -connectRightLower ↑ → -connectRightUpper ↑
            const fpNailLoopId = curveLoopId++;
            geo.push(`// Nail (dorsal cap)`);
            geo.push(`Curve Loop(${fpNailLoopId}) = {`);
            geo.push(`  ${foH.nailCurve1},              // nail-start → 90° (finger-outer)`);
            geo.push(`  ${foH.nailCurve2},              // 90° → nail-end (finger-outer)`);
            geo.push(`  ${cConnectLeftUpper},            // nail-end: finger-outer → sc-inner`);
            geo.push(`  ${cConnectLeftLower},            // nail-end: sc-inner → epidermis-inner`);
            geo.push(`  -${ep3},                         // nail-end → 90° (epidermis-inner, reversed)`);
            geo.push(`  -${ep2},                         // 90° → nail-start (epidermis-inner, reversed)`);
            geo.push(`  -${cConnectRightLower},          // nail-start: epidermis-inner → sc-inner (reversed)`);
            geo.push(`  -${cConnectRightUpper}           // nail-start: sc-inner → finger-outer (reversed, closes loop)`);
            geo.push(`};`);
            const fpNailSurfaceId = surfaceId++;
            geo.push(`Plane Surface(${fpNailSurfaceId}) = {${fpNailLoopId}};`);
            geo.push('');

            // Physical surfaces (6 tissue layers)
            geo.push('// Physical Surfaces (Tissues)');
            geo.push(`Physical Surface("Stratum Corneum", 1) = {${fpScSurfaceId}};`);
            geo.push(`Physical Surface("Epidermis", 2) = {${fpEpSurfaceId}};`);
            geo.push(`Physical Surface("Dermis", 3) = {${fpDermisSurfaceId}};`);
            geo.push(`Physical Surface("Subcutaneous", 4) = {${fpSubcutSurfaceId}};`);
            geo.push(`Physical Surface("Bone", 5) = {${fpBoneSurfaceId}};`);
            geo.push(`Physical Surface("Nail", 6) = {${fpNailSurfaceId}};`);
            geo.push('');

            // Physical curves (boundaries)
            geo.push('// Physical Curves (Boundaries)');
            geo.push(`Physical Curve("Outer Boundary", 1) = {${fingerOuterCurves.join(', ')}};`);
            geo.push(`Physical Curve("Bone Boundary", 2) = {${boneCurves.join(', ')}};`);
            geo.push(`Physical Curve("Nail Bed", 3) = {${ep2}, ${ep3}};  // Epidermis inner dorsal arcs (nail bed)`);
            geo.push('');

            // Mesh-size control (fingerprint mode: refine near finger-outer and sc-inner BSplines)
            const fpCurveIds = [foH.fingerprintCurve, scH.fingerprintCurve];
            const meshLines = generateMeshControlGEO(params.mesh, fpCurveIds);
            meshLines.forEach(line => geo.push(line));

            return geo.join('\n');
        }

        // Create connecting lines between split boundaries
        geo.push('// Connecting lines at nail edges');
        
        // Right side connection (nailStart angle)
        const cConnectRightUpper = curveId++;  // finger-outer → sc-inner
        const cConnectRightLower = curveId++;  // sc-inner → epidermis-inner
        geo.push(`Line(${cConnectRightUpper}) = {${fingerOuterPoints.pNailStart}, ${scInnerPoints.pNailStart}};  // Right upper connection`);
        geo.push(`Line(${cConnectRightLower}) = {${scInnerPoints.pNailStart}, ${epidermisInnerPoints.pNailStart}};  // Right lower connection`);

        // Left side connection (nailEnd angle)
        const cConnectLeftUpper = curveId++;  // finger-outer → sc-inner
        const cConnectLeftLower = curveId++;  // sc-inner → epidermis-inner
        geo.push(`Line(${cConnectLeftUpper}) = {${fingerOuterPoints.pNailEnd}, ${scInnerPoints.pNailEnd}};  // Left upper connection`);
        geo.push(`Line(${cConnectLeftLower}) = {${scInnerPoints.pNailEnd}, ${epidermisInnerPoints.pNailEnd}};  // Left lower connection`);
        geo.push('');

        // Create Curve Loops and Plane Surfaces
        geo.push('// Curve Loops and Plane Surfaces');
        geo.push('');

        // Extract curve indices
        const [fo1, fo2, fo3, fo4, fo5, fo6] = fingerOuterCurves;  // finger outer: 6 arcs
        const [sc1, sc2, sc3, sc4] = scInnerCurves;  // sc inner: 4 arcs (no nail region)
        const [ep1, ep2, ep3, ep4, ep5, ep6] = epidermisInnerCurves;  // epidermis inner: 6 arcs

        // 1. Stratum Corneum (between finger-outer and sc-inner, excluding nail region)
        const scLoopId = curveLoopId++;
        geo.push(`// Stratum Corneum (single closed curve, excluding nail)`);
        geo.push(`Curve Loop(${scLoopId}) = {`);
        geo.push(`  ${fo1},  // 0° → nail-start (finger outer)`);
        geo.push(`  ${cConnectRightUpper},  // nail-start: finger outer → sc inner`);
        geo.push(`  -${sc1},  // nail-start → 0° (sc inner, reversed)`);
        geo.push(`  -${sc4},  // 0° → 270° (sc inner, reversed)`);
        geo.push(`  -${sc3},  // 270° → 180° (sc inner, reversed)`);
        geo.push(`  -${sc2},  // 180° → nail-end (sc inner, reversed)`);
        geo.push(`  -${cConnectLeftUpper},  // nail-end: sc inner → finger outer (reversed)`);
        geo.push(`  ${fo4},  // nail-end → 180° (finger outer)`);
        geo.push(`  ${fo5},  // 180° → 270° (finger outer)`);
        geo.push(`  ${fo6}  // 270° → 0° (finger outer, closes loop)`);
        geo.push(`};`);
        const scSurfaceId = surfaceId++;
        geo.push(`Plane Surface(${scSurfaceId}) = {${scLoopId}};`);
        geo.push('');

        // 2. Epidermis (between sc-inner and epidermis-inner)
        const epidermisLoopId = curveLoopId++;
        geo.push(`// Epidermis (single closed curve)`);
        geo.push(`Curve Loop(${epidermisLoopId}) = {`);
        geo.push(`  ${sc1},  // 0° → nail-start (sc inner)`);
        geo.push(`  ${cConnectRightLower},  // nail-start: sc inner → epidermis inner`);
        geo.push(`  -${ep1},  // nail-start → 0° (epidermis inner, reversed)`);
        geo.push(`  -${ep6},  // 0° → 270° (epidermis inner, reversed)`);
        geo.push(`  -${ep5},  // 270° → 180° (epidermis inner, reversed)`);
        geo.push(`  -${ep4},  // 180° → nail-end (epidermis inner, reversed)`);
        geo.push(`  -${cConnectLeftLower},  // nail-end: epidermis inner → sc inner (reversed)`);
        geo.push(`  ${sc2},  // nail-end → 180° (sc inner)`);
        geo.push(`  ${sc3},  // 180° → 270° (sc inner)`);
        geo.push(`  ${sc4}  // 270° → 0° (sc inner, closes loop)`);
        geo.push(`};`);
        const epidermisSurfaceId = surfaceId++;
        geo.push(`Plane Surface(${epidermisSurfaceId}) = {${epidermisLoopId}};`);
        geo.push('');

        // 3. Dermis (annular region between epidermis-inner and dermis-inner)
        const dermisOuterLoopId = curveLoopId++;
        const dermisInnerLoopId = curveLoopId++;
        geo.push(`// Dermis`);
        geo.push(`Curve Loop(${dermisOuterLoopId}) = {${epidermisInnerCurves.join(', ')}};  // Outer boundary`);
        geo.push(`Curve Loop(${dermisInnerLoopId}) = {${dermisInnerCurves.join(', ')}};  // Inner boundary`);
        const dermisSurfaceId = surfaceId++;
        geo.push(`Plane Surface(${dermisSurfaceId}) = {${dermisOuterLoopId}, ${dermisInnerLoopId}};`);
        geo.push('');

        // 4. Subcutaneous (dermis-inner interior, with hole for bone)
        const subcutaneousOuterLoopId = curveLoopId++;
        const subcutaneousInnerLoopId = curveLoopId++;
        geo.push(`// Subcutaneous tissue`);
        geo.push(`Curve Loop(${subcutaneousOuterLoopId}) = {${dermisInnerCurves.join(', ')}};  // Outer boundary`);
        geo.push(`Curve Loop(${subcutaneousInnerLoopId}) = {${boneCurves.join(', ')}};  // Bone hole`);
        const subcutaneousSurfaceId = surfaceId++;
        geo.push(`Plane Surface(${subcutaneousSurfaceId}) = {${subcutaneousOuterLoopId}, ${subcutaneousInnerLoopId}};`);
        geo.push('');

        // 5. Bone
        const boneLoopId = curveLoopId++;
        geo.push(`// Bone`);
        geo.push(`Curve Loop(${boneLoopId}) = {${boneCurves.join(', ')}};`);
        const boneSurfaceId = surfaceId++;
        geo.push(`Plane Surface(${boneSurfaceId}) = {${boneLoopId}};`);
        geo.push('');

        // 6. Nail (composed of finger outer arcs, epidermis inner arcs, and side connections)
        const nailLoopId = curveLoopId++;
        geo.push(`// Nail (single closed curve)`);
        geo.push(`Curve Loop(${nailLoopId}) = {`);
        geo.push(`  ${fo2},  // nail-start → 90° (finger outer)`);
        geo.push(`  ${fo3},  // 90° → nail-end (finger outer)`);
        geo.push(`  ${cConnectLeftUpper},  // nail-end: finger outer → sc inner`);
        geo.push(`  ${cConnectLeftLower},  // nail-end: sc inner → epidermis inner`);
        geo.push(`  -${ep3},  // nail-end → 90° (epidermis inner, reversed)`);
        geo.push(`  -${ep2},  // 90° → nail-start (epidermis inner, reversed)`);
        geo.push(`  -${cConnectRightLower},  // nail-start: epidermis inner → sc inner (reversed)`);
        geo.push(`  -${cConnectRightUpper}  // nail-start: sc inner → finger outer (reversed, closes loop)`);
        geo.push(`};`);
        const nailSurfaceId = surfaceId++;
        geo.push(`Plane Surface(${nailSurfaceId}) = {${nailLoopId}};`);
        geo.push('');

        // Physical definitions
        geo.push('// Physical Surfaces (Tissues)');
        geo.push(`Physical Surface("Stratum Corneum", 1) = {${scSurfaceId}};`);
        geo.push(`Physical Surface("Epidermis", 2) = {${epidermisSurfaceId}};`);
        geo.push(`Physical Surface("Dermis", 3) = {${dermisSurfaceId}};`);
        geo.push(`Physical Surface("Subcutaneous", 4) = {${subcutaneousSurfaceId}};`);
        geo.push(`Physical Surface("Bone", 5) = {${boneSurfaceId}};`);
        geo.push(`Physical Surface("Nail", 6) = {${nailSurfaceId}};`);
        geo.push('');

        geo.push('// Physical Curves (Boundaries)');
        geo.push(`Physical Curve("Outer Boundary", 1) = {${fingerOuterCurves.join(', ')}};`);
        geo.push(`Physical Curve("Bone Boundary", 2) = {${boneCurves.join(', ')}};`);
        geo.push(`Physical Curve("Nail Bed", 3) = {${ep2}, ${ep3}};  // Epidermis inner dorsal arcs (nail bed)`);

        // Mesh-size control (no fingerprint ridges: uniform bulk size)
        const meshLines = generateMeshControlGEO(params.mesh, []);
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
    // Import
    // ---------------------------------------------------------------------------

    /**
     * Parse raw JSON text into a plain object.
     * Detects the old boundary-dump format and surfaces a clear message.
     * @param {string} text - Raw JSON text
     * @returns {Object} Parsed object
     * @throws {Error}
     */
    function parseProjectJSON(text) {
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error('The file does not contain valid JSON.');
        }

        // Detect legacy format (old boundary-dump export)
        if (data.application === 'ParaFin' && data.geometry && data.geometry.boundaries) {
            throw new Error(
                'This JSON file uses an unsupported legacy ParaFin format. ' +
                'Please re-export the model using the current version.'
            );
        }

        if (data.format !== PROJECT_FORMAT) {
            throw new Error(
                'Invalid file: not a ParaFin project file ' +
                '(expected format "' + PROJECT_FORMAT + '").'
            );
        }

        return data;
    }

    /**
     * Validate a parsed v1 project data object.
     * Throws a descriptive Error on any invalid field.
     * @param {Object} geom - geometry section
     * @param {Object} fp   - fingerprint section
     */
    function validateVersion1Fields(geom, fp) {
        function requireFinite(val, name) {
            if (typeof val !== 'number' || !isFinite(val)) {
                throw new Error('Field "' + name + '" must be a finite number (got ' + val + ').');
            }
        }
        function requirePositive(val, name) {
            requireFinite(val, name);
            if (val <= 0) {
                throw new Error('Field "' + name + '" must be greater than 0 (got ' + val + ').');
            }
        }
        function requireNonNegative(val, name) {
            requireFinite(val, name);
            if (val < 0) {
                throw new Error('Field "' + name + '" must be >= 0 (got ' + val + ').');
            }
        }
        function requireInRange(val, name, min, max) {
            requireFinite(val, name);
            if (val < min || val > max) {
                throw new Error(
                    'Field "' + name + '" must be between ' + min + ' and ' + max +
                    ' (got ' + val + ').'
                );
            }
        }

        // Required geometry fields
        requirePositive(geom.fingerWidth, 'geometry.fingerWidth');
        requirePositive(geom.fingerHeight, 'geometry.fingerHeight');
        requireNonNegative(geom.stratumCorneumThickness, 'geometry.stratumCorneumThickness');
        requireNonNegative(geom.epidermisThickness, 'geometry.epidermisThickness');
        requireNonNegative(geom.dermisThickness, 'geometry.dermisThickness');
        requirePositive(geom.boneWidth, 'geometry.boneWidth');
        requirePositive(geom.boneHeight, 'geometry.boneHeight');
        requireFinite(geom.boneOffsetY, 'geometry.boneOffsetY');
        requireInRange(geom.nailAngularExtent, 'geometry.nailAngularExtent', 0, 180);

        // Optional fingerprint fields (only validate if present)
        if (fp.fingerprintAngularExtent !== undefined) {
            requireInRange(fp.fingerprintAngularExtent, 'fingerprint.fingerprintAngularExtent', 0, 180);
        }
        if (fp.fingerprintWavelength !== undefined) {
            requireFinite(fp.fingerprintWavelength, 'fingerprint.fingerprintWavelength');
            if (fp.fingerprintWavelength < 0.1) {
                throw new Error(
                    'Field "fingerprint.fingerprintWavelength" must be >= 0.1 mm ' +
                    '(got ' + fp.fingerprintWavelength + ').'
                );
            }
        }
        if (fp.fingerprintRidgeHeight !== undefined) {
            requireInRange(fp.fingerprintRidgeHeight, 'fingerprint.fingerprintRidgeHeight', 0, 0.2);
        }
    }

    /**
     * Extract settings from a v1 project data object.
     * Missing optional fields are filled from the application defaults.
     * @param {Object} data - Parsed project data
     * @returns {Object} Complete params object ready for applyProjectSettings
     */
    function parseVersion1(data) {
        const defaults = Geometry.getDefaultParameters();

        const geom = (typeof data.geometry === 'object' && data.geometry !== null)
            ? data.geometry : {};
        const fp = (typeof data.fingerprint === 'object' && data.fingerprint !== null)
            ? data.fingerprint : {};

        // Require essential geometry keys
        const requiredGeomKeys = [
            'fingerWidth', 'fingerHeight',
            'stratumCorneumThickness', 'epidermisThickness', 'dermisThickness',
            'boneWidth', 'boneHeight', 'boneOffsetY', 'nailAngularExtent'
        ];
        for (const key of requiredGeomKeys) {
            if (geom[key] === undefined) {
                throw new Error('Required field "geometry.' + key + '" is missing.');
            }
        }

        // Merge optional fingerprint fields with defaults
        const merged = {
            fingerWidth:                 geom.fingerWidth,
            fingerHeight:                geom.fingerHeight,
            stratumCorneumThickness:     geom.stratumCorneumThickness,
            epidermisThickness:          geom.epidermisThickness,
            dermisThickness:             geom.dermisThickness,
            boneWidth:                   geom.boneWidth,
            boneHeight:                  geom.boneHeight,
            boneOffsetY:                 geom.boneOffsetY,
            nailAngularExtent:           geom.nailAngularExtent,
            fingerprintAngularExtent:    fp.fingerprintAngularExtent    !== undefined
                                            ? fp.fingerprintAngularExtent
                                            : defaults.fingerprintAngularExtent,
            fingerprintWavelength:       fp.fingerprintWavelength       !== undefined
                                            ? fp.fingerprintWavelength
                                            : defaults.fingerprintWavelength,
            fingerprintRidgeHeight:      fp.fingerprintRidgeHeight      !== undefined
                                            ? fp.fingerprintRidgeHeight
                                            : defaults.fingerprintRidgeHeight
        };

        // Merge optional mesh settings (missing fields fall back to application defaults)
        const meshDefaults = defaults.mesh;
        const meshSrc = (typeof data.mesh === 'object' && data.mesh !== null) ? data.mesh : {};
        merged.mesh = {
            fineSize:           typeof meshSrc.fineSize === 'number' && isFinite(meshSrc.fineSize)
                                    ? meshSrc.fineSize
                                    : meshDefaults.fineSize,
            bulkSize:           typeof meshSrc.bulkSize === 'number' && isFinite(meshSrc.bulkSize)
                                    ? meshSrc.bulkSize
                                    : meshDefaults.bulkSize,
            fineDistance:       typeof meshSrc.fineDistance === 'number' && isFinite(meshSrc.fineDistance)
                                    ? meshSrc.fineDistance
                                    : meshDefaults.fineDistance,
            transitionDistance: typeof meshSrc.transitionDistance === 'number' && isFinite(meshSrc.transitionDistance)
                                    ? meshSrc.transitionDistance
                                    : meshDefaults.transitionDistance,
            distanceSampling:   typeof meshSrc.distanceSampling === 'number' && Number.isInteger(meshSrc.distanceSampling)
                                    ? meshSrc.distanceSampling
                                    : meshDefaults.distanceSampling
        };

        validateVersion1Fields(geom, fp);

        return merged;
    }

    /**
     * Dispatch parsing to the correct version handler.
     * Extend the switch for future format versions.
     * @param {Object} data - Parsed project data (format already verified)
     * @returns {Object} Validated params object
     */
    function parseProjectByVersion(data) {
        switch (data.formatVersion) {
            case 1:
                return parseVersion1(data);
            default:
                throw new Error(
                    'Unsupported project format version: ' + data.formatVersion + '. ' +
                    'Please update ParaFin to open this file.'
                );
        }
    }

    /**
     * Public import entry point.
     * Parses and validates the JSON text; throws on any error so the caller
     * can decide whether to apply the result.
     * @param {string} text - Raw file text
     * @returns {Object} Validated params object
     * @throws {Error}
     */
    function importProjectFromText(text) {
        const data = parseProjectJSON(text);
        if (data.units !== 'mm') {
            throw new Error(
                'Unsupported unit "' + data.units + '". Only "mm" is supported.'
            );
        }
        return parseProjectByVersion(data);
    }

    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------

    return {
        generateJSON,
        downloadJSON,
        generateGEO,
        downloadGEO,
        importProjectFromText
    };
})();
