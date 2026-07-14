/**
 * exporter.js - JSON export functionality for ParaFin
 * 
 * This module handles:
 * - Converting geometry model to JSON format
 * - Creating downloadable JSON file
 * - Managing export metadata
 */

const Exporter = (function() {
    'use strict';

    const APP_VERSION = '0.1.0';

    /**
     * Generate complete JSON export object
     * @param {Object} params - Parameter object
     * @param {Object} geometry - Geometry model
     * @returns {Object} JSON export object
     */
    function generateJSON(params, geometry) {
        return {
            application: 'ParaFin',
            version: APP_VERSION,
            unit: 'mm',
            coordinateSystem: {
                origin: 'finger-center',
                xAxis: 'left-right',
                yAxis: 'dorsal-palmar',
                dorsalDirection: 'positive-y',
                description: 'Right-handed coordinate system with origin at finger center'
            },
            parameters: {
                fingerWidth: params.fingerWidth,
                fingerHeight: params.fingerHeight,
                stratumCorneumThickness: params.stratumCorneumThickness,
                epidermisThickness: params.epidermisThickness,
                dermisThickness: params.dermisThickness,
                boneWidth: params.boneWidth,
                boneHeight: params.boneHeight,
                boneOffsetY: params.boneOffsetY,
                nailAngularExtent: params.nailAngularExtent,
                fingerprintAngularExtent: params.fingerprintAngularExtent,
                fingerprintWavelength: params.fingerprintWavelength,
                fingerprintRidgeHeight: params.fingerprintRidgeHeight
            },
            derivedValues: {
                boneOffsetX: 0,
                nailThickness: params.stratumCorneumThickness + params.epidermisThickness,
                nailStartAngle: 90 - params.nailAngularExtent / 2,
                nailEndAngle: 90 + params.nailAngularExtent / 2,
                fingerprintMode: params.fingerprintRidgeHeight > 0 ? 'enabled' : 'disabled',
                fingerprint: geometry.fingerprintMetadata || {
                    requestedAngularExtent: params.fingerprintAngularExtent,
                    actualAngularExtent: 0,
                    ridgeCount: 0
                }
            },
            geometry: {
                boundaries: geometry.boundaries,
                regions: geometry.regions
            },
            notes: {
                approximation: 'Tissue layer boundaries use simplified ellipse scaling (width/height reduction) rather than true normal offset',
                assumptions: params.fingerprintRidgeHeight === 0 
                    ? 'No fingerprint ridges, smooth epidermal surface'
                    : 'Fingerprint ridges applied to palmar surface with integer periods, smooth transitions at boundaries',
                nailModel: 'Nail thickness equals stratum corneum + epidermis (nail replaces these layers). Nail arc is symmetric around dorsal apex (90°).',
                fingerprintModel: params.fingerprintRidgeHeight === 0
                    ? 'Fingerprint ridge height = 0: smooth elliptical surface (same as legacy behavior)'
                    : `Fingerprint ridges with integer periods (odd count, ridge peak at palmar center). Displacement: d(s) = h_r/2 * (1 + cos(2πs/λ_r)). Requested extent: ${params.fingerprintAngularExtent}°, actual extent: ${geometry.fingerprintMetadata?.actualAngularExtent?.toFixed(2) || 0}°, ridge count: ${geometry.fingerprintMetadata?.ridgeCount || 0}. Wavelength: ${params.fingerprintWavelength} mm, height: ${params.fingerprintRidgeHeight} mm.`
            },
            extensionReserved: {
                epidermalRidges: null,
                receptors: null,
                meshSize: null
            }
        };
    }

    /**
     * Download JSON as file
     * @param {Object} params - Parameter object
     * @param {Object} geometry - Geometry model
     * @param {string} filename - Output filename
     */
    function downloadJSON(params, geometry, filename = 'parafin-model.json') {
        const jsonData = generateJSON(params, geometry);
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
        if (hasFingerprintRidges) {
            geo.push('// WARNING: Fingerprint mode is active.');
            geo.push('// The finger-outer and stratum-corneum-inner boundaries are exported as BSplines.');
            geo.push('// Complex topology with nail region may require manual adjustment in Gmsh.');
            geo.push('// For simpler meshing, consider setting fingerprintRidgeHeight to 0.');
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

        // Create boundaries
        const fingerOuterBoundary = geometry.boundaries.find(b => b.id === 'finger-outer');
        const fingerOuterCurves = (fingerOuterBoundary.type === 'parametric-curve')
            ? createParametricCurveBoundary(fingerOuterBoundary, 'Finger outer boundary (with fingerprint ridges)')
            : createSplitEllipseBoundary(fingerOuterBoundary, 'Finger outer boundary', false);
        const fingerOuterPoints = boundaryToPoints['finger-outer'];

        const scInnerBoundary = geometry.boundaries.find(b => b.id === 'stratum-corneum-inner');
        const scInnerCurves = (scInnerBoundary.type === 'parametric-curve')
            ? createParametricCurveBoundary(scInnerBoundary, 'Stratum corneum inner boundary (with fingerprint ridges)')
            : createSplitEllipseBoundary(scInnerBoundary, 'Stratum corneum inner boundary', true);
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

        // If fingerprint mode is active (parametric curves), use simplified topology
        if (hasFingerprintRidges) {
            geo.push('// Simplified topology for fingerprint mode');
            geo.push('// Note: Nail region and complex curve loops are not yet supported with BSpline boundaries');
            geo.push('// Boundaries are exported for reference, but surfaces may need manual definition in Gmsh');
            geo.push('');
            
            // Export basic physical curves
            geo.push('// Physical Curves (Boundaries)');
            geo.push(`Physical Curve("Finger Outer", 1) = {${fingerOuterCurves.join(', ')}};`);
            geo.push(`Physical Curve("Stratum Corneum Inner", 2) = {${scInnerCurves.join(', ')}};`);
            geo.push(`Physical Curve("Epidermis Inner", 3) = {${epidermisInnerCurves.join(', ')}};`);
            geo.push(`Physical Curve("Dermis Inner", 4) = {${dermisInnerCurves.join(', ')}};`);
            geo.push(`Physical Curve("Bone", 5) = {${boneCurves.join(', ')}};`);
            geo.push('');
            
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

    // Public API
    return {
        generateJSON,
        downloadJSON,
        generateGEO,
        downloadGEO
    };
})();
