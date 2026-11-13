/**
 * renderer.js - SVG rendering for ParaFin
 * 
 * This module handles:
 * - SVG element initialization
 * - Coordinate transformation (model coordinates in mm to screen coordinates)
 * - Automatic scaling to fit viewport (re-fitted on parameter change and resize)
 * - Zoom (wheel / pinch / buttons / keys) and pan (drag) for both views
 * - Drawing ellipses, elliptical arcs, regions
 * - Axes and legend rendering
 */

const Renderer = (function() {
    'use strict';

    // ---------------------------------------------------------------------
    // View state
    //
    // Each view (main / detail) keeps its own state:
    //   scale  - pixels per mm
    //   cx, cy - model coordinates (mm) shown at the centre of the viewport
    //   auto   - true: the view is fitted automatically (parameter changes,
    //            resize). false: the user zoomed/panned; scale and centre are kept.
    // The draw helpers below read the "current transform" variables
    // (mainScale / mainOffsetX ... ), which are derived from the view state
    // right before a view is drawn.
    // ---------------------------------------------------------------------

    function createView() {
        return {
            svg: null, container: null,
            w: 0, h: 0,
            scale: 1, cx: 0, cy: 0,
            auto: true,
            anchorY: 0,
            pending: false
        };
    }

    const views = { main: createView(), detail: createView() };

    // Current transform used by modelToScreen() and the draw helpers
    let mainSvg = null;
    let mainScale = 1;
    let mainOffsetX = 0;
    let mainOffsetY = 0;
    let detailSvg = null;
    let detailScale = 1;
    let detailOffsetX = 0;
    let detailOffsetY = 0;

    // Most recent geometry (kept so views can be redrawn without regenerating it)
    let lastGeometry = null;
    let lastParams = null;
    let lastBoundaryMap = null;

    const MARGIN = 40;          // Margin around geometry in pixels
    const MIN_ZOOM = 0.2;       // Relative to the automatic scale
    const MAX_ZOOM = 50;
    const KEY_ZOOM = 1.25;
    const KEY_PAN_PX = 40;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    function getView(isDetail) {
        return isDetail ? views.detail : views.main;
    }

    /**
     * Initialize renderer with SVG elements
     * @param {SVGElement} mainSvgElement - Main view SVG element
     * @param {HTMLElement} mainContainerElement - Main view container element
     * @param {SVGElement} detailSvgElement - Detail view SVG element
     * @param {HTMLElement} detailContainerElement - Detail view container element
     */
    function initialize(mainSvgElement, mainContainerElement, detailSvgElement, detailContainerElement) {
        mainSvg = mainSvgElement;
        detailSvg = detailSvgElement;
        views.main.svg = mainSvgElement;
        views.main.container = mainContainerElement;
        views.detail.svg = detailSvgElement;
        views.detail.container = detailContainerElement;

        [false, true].forEach(function(isDetail) {
            const v = getView(isDetail);
            if (!v.container) return;
            setupInteraction(v, isDetail);
            if (typeof ResizeObserver !== 'undefined') {
                new ResizeObserver(function() { requestRender(isDetail); }).observe(v.container);
            } else {
                window.addEventListener('resize', function() { requestRender(isDetail); });
            }
        });
    }

    /**
     * Apply a view's state to the transform variables used by the draw helpers
     */
    function applyTransform(isDetail) {
        const v = getView(isDetail);
        const offsetX = v.w / 2 - v.cx * v.scale;
        const offsetY = v.h / 2 + v.cy * v.scale;
        if (isDetail) {
            detailScale = v.scale; detailOffsetX = offsetX; detailOffsetY = offsetY;
        } else {
            mainScale = v.scale; mainOffsetX = offsetX; mainOffsetY = offsetY;
        }
    }

    /**
     * Convert model coordinates (mm) to screen coordinates (pixels)
     * @param {number} x - X coordinate in mm
     * @param {number} y - Y coordinate in mm
     * @param {boolean} isDetail - Whether to use detail view coordinates
     * @returns {Object} Screen coordinates {x, y}
     */
    function modelToScreen(x, y, isDetail = false) {
        const scale = isDetail ? detailScale : mainScale;
        const offsetX = isDetail ? detailOffsetX : mainOffsetX;
        const offsetY = isDetail ? detailOffsetY : mainOffsetY;

        // In screen coordinates: positive Y is down
        // In model coordinates: positive Y is up (dorsal)
        // So we need to flip Y axis
        return {
            x: offsetX + x * scale,
            y: offsetY - y * scale  // Note the minus sign to flip Y
        };
    }

    function getDefaultFingerSize() {
        try {
            const d = Geometry.getDefaultParameters();
            return { w: d.fingerWidth, h: d.fingerHeight };
        } catch (e) {
            return { w: 20, h: 14 };
        }
    }

    /**
     * Automatic ("fit") view for the given parameters and viewport size.
     * Main view: whole cross section; the extent is never smaller than the default
     *   finger so that shrinking the finger is visible, but a larger finger zooms out.
     * Detail view: region around the palmar apex (palmar surface 30% above the bottom).
     * @returns {{scale:number, cx:number, cy:number}|null}
     */
    function computeAutoView(v, isDetail, params) {
        if (!(v.w > 0 && v.h > 0) || !params) return null;

        if (isDetail) {
            // Guard against invalid (zero/negative) sizes while the user is typing
            const focusW = Math.max(Math.min(params.fingerWidth * 0.6, 8), 0.5);
            const focusH = Math.max(Math.min(params.fingerHeight * 0.3, 4), 0.5);
            const scale = Math.min((v.w - 2 * MARGIN) / focusW, (v.h - 2 * MARGIN) / focusH);
            const apexY = -params.fingerHeight / 2;
            return { scale: scale, cx: 0, cy: apexY + 0.2 * v.h / scale };
        }

        const def = getDefaultFingerSize();
        const ridge = Math.max(params.fingerprintRidgeHeight || 0, 0);
        const halfW = Math.max(params.fingerWidth, def.w) / 2 + 1 + ridge;
        const halfH = Math.max(params.fingerHeight, def.h) / 2 + 1 + ridge;
        const scale = Math.min((v.w - 2 * MARGIN) / (2 * halfW), (v.h - 2 * MARGIN) / (2 * halfH));
        return { scale: scale, cx: 0, cy: 0 };
    }

    /**
     * Sync viewport size and (in automatic mode) the fitted view for a given view.
     * @returns {boolean} false if the view cannot be drawn (no size / no data)
     */
    function updateViewState(v, isDetail) {
        const w = v.container ? v.container.clientWidth : 0;
        const h = v.container ? v.container.clientHeight : 0;
        if (!(w > 0 && h > 0) || !lastParams) return false;
        v.w = w;
        v.h = h;

        const auto = computeAutoView(v, isDetail, lastParams);
        if (!auto) return false;

        const apexY = -lastParams.fingerHeight / 2;
        if (v.auto) {
            v.scale = auto.scale; v.cx = auto.cx; v.cy = auto.cy;
        } else if (isDetail) {
            // Keep the palmar apex at the same place on screen when the finger height changes
            v.cy += apexY - v.anchorY;
        }
        v.anchorY = apexY;
        return true;
    }

    // ---------------------------------------------------------------------
    // Zoom / pan interaction
    // ---------------------------------------------------------------------

    function requestRender(isDetail) {
        const v = getView(isDetail);
        if (v.pending) return;
        v.pending = true;
        requestAnimationFrame(function() {
            v.pending = false;
            renderView(isDetail);
        });
    }

    function zoomAt(v, isDetail, px, py, factor) {
        const auto = computeAutoView(v, isDetail, lastParams);
        if (!auto) return;
        const newScale = Math.min(Math.max(v.scale * factor, auto.scale * MIN_ZOOM), auto.scale * MAX_ZOOM);
        if (newScale === v.scale) return;

        // Keep the model point under (px, py) fixed on screen
        const mx = (px - (v.w / 2 - v.cx * v.scale)) / v.scale;
        const my = ((v.h / 2 + v.cy * v.scale) - py) / v.scale;
        v.cx = (v.w / 2 - (px - mx * newScale)) / newScale;
        v.cy = ((py + my * newScale) - v.h / 2) / newScale;
        v.scale = newScale;
        v.auto = false;
        requestRender(isDetail);
    }

    function panBy(v, isDetail, dxPx, dyPx) {
        v.cx -= dxPx / v.scale;
        v.cy += dyPx / v.scale;
        v.auto = false;
        requestRender(isDetail);
    }

    function resetView(isDetail) {
        getView(isDetail).auto = true;
        requestRender(isDetail);
    }

    function setupInteraction(v, isDetail) {
        const el = v.container;
        const pointers = new Map();
        let lastMid = null;
        let lastDist = 0;

        function local(e) {
            const r = el.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        }

        function centreOfPointers() {
            const pts = Array.from(pointers.values());
            if (pts.length === 1) return { mid: pts[0], dist: 0 };
            const a = pts[0], b = pts[1];
            return {
                mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
                dist: Math.hypot(a.x - b.x, a.y - b.y)
            };
        }

        el.addEventListener('wheel', function(e) {
            e.preventDefault();
            const unit = e.deltaMode === 1 ? 33 : 1;
            const p = local(e);
            zoomAt(v, isDetail, p.x, p.y, Math.exp(-e.deltaY * unit * 0.0015));
        }, { passive: false });

        el.addEventListener('pointerdown', function(e) {
            if (e.target.closest('.view-tools')) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            pointers.set(e.pointerId, local(e));
            try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            const c = centreOfPointers();
            lastMid = c.mid;
            lastDist = c.dist;
            el.classList.add('dragging');
        });

        el.addEventListener('pointermove', function(e) {
            if (!pointers.has(e.pointerId)) return;
            pointers.set(e.pointerId, local(e));
            const c = centreOfPointers();
            panBy(v, isDetail, c.mid.x - lastMid.x, c.mid.y - lastMid.y);
            if (pointers.size >= 2 && lastDist > 0 && c.dist > 0) {
                zoomAt(v, isDetail, c.mid.x, c.mid.y, c.dist / lastDist);
            }
            lastMid = c.mid;
            lastDist = c.dist;
        });

        function endPointer(e) {
            if (!pointers.delete(e.pointerId)) return;
            if (pointers.size === 0) {
                el.classList.remove('dragging');
            } else {
                const c = centreOfPointers();
                lastMid = c.mid;
                lastDist = c.dist;
            }
        }
        el.addEventListener('pointerup', endPointer);
        el.addEventListener('pointercancel', endPointer);

        el.addEventListener('dblclick', function(e) {
            if (e.target.closest('.view-tools')) return;
            resetView(isDetail);
        });

        el.addEventListener('keydown', function(e) {
            if (e.target.closest('.view-tools') || e.ctrlKey || e.metaKey || e.altKey) return;
            const cx = v.w / 2, cy = v.h / 2;
            let handled = true;
            switch (e.key) {
                case '+': case '=': zoomAt(v, isDetail, cx, cy, KEY_ZOOM); break;
                case '-': case '_': zoomAt(v, isDetail, cx, cy, 1 / KEY_ZOOM); break;
                case '0': resetView(isDetail); break;
                case 'ArrowLeft':  panBy(v, isDetail,  KEY_PAN_PX, 0); break;
                case 'ArrowRight': panBy(v, isDetail, -KEY_PAN_PX, 0); break;
                case 'ArrowUp':    panBy(v, isDetail, 0,  KEY_PAN_PX); break;
                case 'ArrowDown':  panBy(v, isDetail, 0, -KEY_PAN_PX); break;
                default: handled = false;
            }
            if (handled) e.preventDefault();
        });
    }

    /**
     * Clear SVG content
     * @param {boolean} isDetail - Whether to clear detail view
     */
    function clear(isDetail = false) {
        const svg = isDetail ? detailSvg : mainSvg;
        if (svg) {
            svg.innerHTML = '';
        }
    }

    /**
     * Create SVG ellipse element
     * @param {number} cx - Center X (screen coords)
     * @param {number} cy - Center Y (screen coords)
     * @param {number} rx - Radius X (screen coords)
     * @param {number} ry - Radius Y (screen coords)
     * @param {string} fillColor - Fill color
     * @param {string} strokeColor - Stroke color
     * @param {number} strokeWidth - Stroke width
     * @param {boolean} isDetail - Whether this is for detail view
     * @returns {SVGElement} Ellipse element
     */
    function createEllipse(cx, cy, rx, ry, fillColor, strokeColor, strokeWidth, isDetail = false) {
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.setAttribute('cx', cx);
        ellipse.setAttribute('cy', cy);
        ellipse.setAttribute('rx', rx);
        ellipse.setAttribute('ry', ry);
        ellipse.setAttribute('fill', fillColor);
        ellipse.setAttribute('stroke', strokeColor);
        ellipse.setAttribute('stroke-width', strokeWidth * (isDetail ? 0.3 : 1));
        return ellipse;
    }

    /**
     * Create SVG path for elliptical arc region (nail)
     * @param {Object} boundary - Boundary definition
     * @param {string} fillColor - Fill color
     * @param {boolean} isDetail - Whether this is for detail view
     * @returns {SVGElement} Path element
     */
    function createEllipticalArcPath(boundary, fillColor, isDetail = false) {
        const scale = isDetail ? detailScale : mainScale;
        const center = modelToScreen(boundary.center[0], boundary.center[1], isDetail);
        const outerRx = boundary.baseEllipseWidth / 2 * scale;
        const outerRy = boundary.baseEllipseHeight / 2 * scale;
        const innerRx = (boundary.baseEllipseWidth / 2 - boundary.thickness) * scale;
        const innerRy = (boundary.baseEllipseHeight / 2 - boundary.thickness) * scale;

        // Convert angles to radians
        // Model coordinate: 0° = right, 90° = dorsal (up)
        // Screen coordinate has Y-axis flipped (modelToScreen negates Y)
        // So we negate the Y-component (sin) to account for the flip
        const startAngleRad = boundary.startAngle * Math.PI / 180;
        const endAngleRad = boundary.endAngle * Math.PI / 180;

        // Calculate points on outer ellipse
        // X uses cos as-is, Y uses -sin to account for Y-axis flip
        const outerX1 = center.x + outerRx * Math.cos(startAngleRad);
        const outerY1 = center.y - outerRy * Math.sin(startAngleRad);
        const outerX2 = center.x + outerRx * Math.cos(endAngleRad);
        const outerY2 = center.y - outerRy * Math.sin(endAngleRad);

        // Calculate points on inner ellipse
        const innerX1 = center.x + innerRx * Math.cos(endAngleRad);
        const innerY1 = center.y - innerRy * Math.sin(endAngleRad);
        const innerX2 = center.x + innerRx * Math.cos(startAngleRad);
        const innerY2 = center.y - innerRy * Math.sin(startAngleRad);

        // Determine if arc is large (> 180 degrees)
        const largeArcFlag = (boundary.endAngle - boundary.startAngle) > 180 ? 1 : 0;

        // Create path: outer arc, line to inner arc, inner arc back, close
        // Due to Y-axis flip, arc direction flags are reversed: 0 for outer, 1 for inner
        const pathData = [
            `M ${outerX1} ${outerY1}`,
            `A ${outerRx} ${outerRy} 0 ${largeArcFlag} 0 ${outerX2} ${outerY2}`,
            `L ${innerX1} ${innerY1}`,
            `A ${innerRx} ${innerRy} 0 ${largeArcFlag} 1 ${innerX2} ${innerY2}`,
            'Z'
        ].join(' ');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', fillColor);
        path.setAttribute('stroke', '#333');
        path.setAttribute('stroke-width', 0.5 * (isDetail ? 0.3 : 1));
        return path;
    }

    /**
     * Create SVG path from parametric curve (point array)
     * @param {Array} points - Array of {x, y} points in model coordinates
     * @param {string} fillColor - Fill color
     * @param {string} strokeColor - Stroke color
     * @param {number} strokeWidth - Stroke width
     * @param {boolean} isDetail - Whether this is for detail view
     * @returns {SVGElement} Path element
     */
    function drawParametricCurve(points, fillColor, strokeColor, strokeWidth, isDetail = false) {
        if (!points || points.length === 0) return null;
        
        // Convert all points to screen coordinates
        const screenPoints = points.map(p => modelToScreen(p.x, p.y, isDetail));
        
        // Build SVG path data using smooth curve
        let pathData = `M ${screenPoints[0].x} ${screenPoints[0].y}`;
        
        // Use line segments for simplicity (could use Catmull-Rom spline for smoother curves)
        for (let i = 1; i < screenPoints.length; i++) {
            pathData += ` L ${screenPoints[i].x} ${screenPoints[i].y}`;
        }
        
        // Close the path
        pathData += ' Z';
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        if (fillColor) path.setAttribute('fill', fillColor);
        if (strokeColor) path.setAttribute('stroke', strokeColor);
        if (strokeWidth) path.setAttribute('stroke-width', strokeWidth * (isDetail ? 0.3 : 1));
        
        return path;
    }

    /**
     * Draw a region
     * @param {Object} region - Region definition
     * @param {Object} boundaryMap - Map of boundary ID to boundary object
     * @param {boolean} isDetail - Whether this is for detail view
     */
    function drawRegion(region, boundaryMap, isDetail = false) {
        const svg = isDetail ? detailSvg : mainSvg;
        const scale = isDetail ? detailScale : mainScale;
        const outerBoundary = boundaryMap[region.outerBoundary];
        
        if (!outerBoundary || !svg) return;

        if (outerBoundary.type === 'parametric-curve') {
            // For parametric curve regions (fingerprint)
            if (region.innerBoundary) {
                const innerBoundary = boundaryMap[region.innerBoundary];
                
                if (innerBoundary && innerBoundary.type === 'parametric-curve') {
                    // Ring region with both boundaries as parametric curves (e.g., stratum corneum with fingerprint)
                    const outerScreenPoints = outerBoundary.points.map(p => modelToScreen(p.x, p.y, isDetail));
                    const innerScreenPoints = innerBoundary.points.map(p => modelToScreen(p.x, p.y, isDetail));
                    
                    // Build path: outer curve (clockwise) + inner curve (counter-clockwise for hole)
                    let pathData = `M ${outerScreenPoints[0].x} ${outerScreenPoints[0].y}`;
                    for (let i = 1; i < outerScreenPoints.length; i++) {
                        pathData += ` L ${outerScreenPoints[i].x} ${outerScreenPoints[i].y}`;
                    }
                    pathData += ' Z';
                    
                    // Inner curve (reversed for hole)
                    pathData += ` M ${innerScreenPoints[0].x} ${innerScreenPoints[0].y}`;
                    for (let i = innerScreenPoints.length - 1; i > 0; i--) {
                        pathData += ` L ${innerScreenPoints[i].x} ${innerScreenPoints[i].y}`;
                    }
                    pathData += ' Z';
                    
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', pathData);
                    path.setAttribute('fill', region.color);
                    path.setAttribute('fill-rule', 'evenodd');
                    path.setAttribute('stroke', '#333');
                    path.setAttribute('stroke-width', 0.5 * (isDetail ? 0.3 : 1));
                    
                    svg.appendChild(path);
                } else if (innerBoundary) {
                    // Ring region with outer parametric curve and inner ellipse (e.g., epidermis with fingerprint,
                    // dermal papillae off). Also covers the case of a plain-ellipse inner boundary in general.
                    const outerScreenPoints = outerBoundary.points.map(p => modelToScreen(p.x, p.y, isDetail));
                    
                    const innerCenter = modelToScreen(innerBoundary.center[0], innerBoundary.center[1], isDetail);
                    const innerRx = innerBoundary.width / 2 * scale;
                    const innerRy = innerBoundary.height / 2 * scale;
                    
                    // Build path: outer parametric curve + inner ellipse
                    let pathData = `M ${outerScreenPoints[0].x} ${outerScreenPoints[0].y}`;
                    for (let i = 1; i < outerScreenPoints.length; i++) {
                        pathData += ` L ${outerScreenPoints[i].x} ${outerScreenPoints[i].y}`;
                    }
                    pathData += ' Z';
                    
                    // Inner ellipse (counter-clockwise for hole)
                    pathData += ` M ${innerCenter.x - innerRx} ${innerCenter.y}`;
                    pathData += ` A ${innerRx} ${innerRy} 0 0 1 ${innerCenter.x + innerRx} ${innerCenter.y}`;
                    pathData += ` A ${innerRx} ${innerRy} 0 0 1 ${innerCenter.x - innerRx} ${innerCenter.y}`;
                    pathData += ' Z';
                    
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', pathData);
                    path.setAttribute('fill', region.color);
                    path.setAttribute('fill-rule', 'evenodd');
                    path.setAttribute('stroke', '#333');
                    path.setAttribute('stroke-width', 0.5 * (isDetail ? 0.3 : 1));
                    
                    svg.appendChild(path);
                }
            } else {
                // Simple filled parametric curve
                const path = drawParametricCurve(outerBoundary.points, region.color, '#333', 1, isDetail);
                if (path) svg.appendChild(path);
            }
        } else if (outerBoundary.type === 'ellipse') {
            // For ellipse regions
            const outerCenter = modelToScreen(outerBoundary.center[0], outerBoundary.center[1], isDetail);
            const outerRx = outerBoundary.width / 2 * scale;
            const outerRy = outerBoundary.height / 2 * scale;

            if (region.innerBoundary) {
                // Ring region (outer - inner)
                const innerBoundary = boundaryMap[region.innerBoundary];
                if (innerBoundary && innerBoundary.type === 'parametric-curve') {
                    // Ellipse outer + parametric-curve inner (e.g. epidermis region when
                    // fingerprint is off but dermal papillae is on: stratum-corneum-inner
                    // is a plain ellipse while epidermis-inner carries displaced points)
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

                    // Outer ellipse: two 180-degree arcs (clockwise)
                    const outerPath = `
                        M ${outerCenter.x - outerRx} ${outerCenter.y}
                        A ${outerRx} ${outerRy} 0 0 0 ${outerCenter.x + outerRx} ${outerCenter.y}
                        A ${outerRx} ${outerRy} 0 0 0 ${outerCenter.x - outerRx} ${outerCenter.y}
                        Z
                    `;

                    // Inner parametric curve (reversed for hole)
                    const innerScreenPoints = innerBoundary.points.map(p => modelToScreen(p.x, p.y, isDetail));
                    let innerPath = ` M ${innerScreenPoints[0].x} ${innerScreenPoints[0].y}`;
                    for (let i = innerScreenPoints.length - 1; i > 0; i--) {
                        innerPath += ` L ${innerScreenPoints[i].x} ${innerScreenPoints[i].y}`;
                    }
                    innerPath += ' Z';

                    path.setAttribute('d', outerPath + ' ' + innerPath);
                    path.setAttribute('fill', region.color);
                    path.setAttribute('fill-rule', 'evenodd');
                    path.setAttribute('stroke', '#333');
                    path.setAttribute('stroke-width', 0.5 * (isDetail ? 0.3 : 1));

                    svg.appendChild(path);
                } else if (innerBoundary) {
                    const innerCenter = modelToScreen(innerBoundary.center[0], innerBoundary.center[1], isDetail);
                    const innerRx = innerBoundary.width / 2 * scale;
                    const innerRy = innerBoundary.height / 2 * scale;

                    // Create ring using SVG path with fill-rule evenodd
                    // Use two 180-degree arcs for smooth ellipses (not 4x90-degree arcs)
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    
                    // Outer ellipse: two 180-degree arcs (clockwise)
                    const outerPath = `
                        M ${outerCenter.x - outerRx} ${outerCenter.y}
                        A ${outerRx} ${outerRy} 0 0 0 ${outerCenter.x + outerRx} ${outerCenter.y}
                        A ${outerRx} ${outerRy} 0 0 0 ${outerCenter.x - outerRx} ${outerCenter.y}
                        Z
                    `;
                    
                    // Inner ellipse: two 180-degree arcs (counter-clockwise for hole)
                    const innerPath = `
                        M ${innerCenter.x - innerRx} ${innerCenter.y}
                        A ${innerRx} ${innerRy} 0 0 1 ${innerCenter.x + innerRx} ${innerCenter.y}
                        A ${innerRx} ${innerRy} 0 0 1 ${innerCenter.x - innerRx} ${innerCenter.y}
                        Z
                    `;
                    
                    path.setAttribute('d', outerPath + ' ' + innerPath);
                    path.setAttribute('fill', region.color);
                    path.setAttribute('fill-rule', 'evenodd');
                    path.setAttribute('stroke', '#333');
                    path.setAttribute('stroke-width', 0.5 * (isDetail ? 0.3 : 1));
                    
                    svg.appendChild(path);
                }
            } else if (region.excludeBoundaries) {
                // Fill region, but exclude certain boundaries (e.g., subcutaneous excluding bone)
                // For subcutaneous, draw the dermis-inner ellipse
                const ellipse = createEllipse(outerCenter.x, outerCenter.y, outerRx, outerRy, region.color, '#333', 0.5, isDetail);
                svg.appendChild(ellipse);
                
                // The excluded regions (bone) will be drawn on top later
            } else {
                // Simple filled ellipse (e.g., bone)
                const ellipse = createEllipse(outerCenter.x, outerCenter.y, outerRx, outerRy, region.color, '#333', 1, isDetail);
                svg.appendChild(ellipse);
            }
        } else if (outerBoundary.type === 'elliptical-arc') {
            // For nail (elliptical arc)
            const path = createEllipticalArcPath(outerBoundary, region.color, isDetail);
            svg.appendChild(path);
        }
    }

    /**
     * Pick a "nice" (1-2-5) scale bar length in mm so the bar is roughly 60-150 px long
     * @param {number} scale - Pixels per mm
     * @returns {number} Length in mm
     */
    function niceScaleLength(scale) {
        const maxMm = 150 / scale;
        const pow = Math.pow(10, Math.floor(Math.log10(maxMm)));
        const candidates = [10, 5, 2, 1];
        for (let i = 0; i < candidates.length; i++) {
            if (candidates[i] * pow <= maxMm) return candidates[i] * pow;
        }
        return pow;
    }

    function formatMm(value) {
        return parseFloat(value.toPrecision(6)) + ' mm';
    }

    function svgEl(name, attrs) {
        const el = document.createElementNS(SVG_NS, name);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    }

    /**
     * Draw coordinate axes (spanning the whole viewport) and a scale bar
     * @param {Object} params - Parameters
     * @param {boolean} isDetail - Whether this is for detail view
     */
    function drawAxes(params, isDetail = false) {
        const v = getView(isDetail);
        const svg = v.svg;
        if (!svg) return;

        const W = v.w, H = v.h;
        const origin = modelToScreen(0, 0, isDetail);
        const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'axes');
        const lineAttrs = { stroke: '#666', 'stroke-width': 1, 'stroke-dasharray': '4,2' };

        g.appendChild(svgEl('line', Object.assign({ x1: 0, y1: origin.y, x2: W, y2: origin.y }, lineAttrs)));
        g.appendChild(svgEl('line', Object.assign({ x1: origin.x, y1: 0, x2: origin.x, y2: H }, lineAttrs)));

        const xLabel = svgEl('text', {
            x: W - 16, y: clamp(origin.y - 6, 48, H - 8), fill: '#666', 'font-size': 12
        });
        xLabel.textContent = 'X';
        g.appendChild(xLabel);

        const yLabel = svgEl('text', {
            x: clamp(origin.x + 5, 5, W - 290), y: 16, fill: '#666', 'font-size': 12
        });
        yLabel.textContent = 'Y (dorsal)';
        g.appendChild(yLabel);

        svg.appendChild(g);

        // Scale bar - fixed position at bottom-center, length adapts to the zoom level
        const scaleGroup = document.createElementNS(SVG_NS, 'g');
        scaleGroup.setAttribute('class', 'scale-indicator');

        const lengthMm = niceScaleLength(v.scale);
        const lengthPx = lengthMm * v.scale;
        const x1 = (W - lengthPx) / 2;
        const x2 = x1 + lengthPx;
        const y = H - 30;

        scaleGroup.appendChild(svgEl('line', { x1: x1, y1: y, x2: x2, y2: y, stroke: '#000', 'stroke-width': 2 }));

        const scaleText = svgEl('text', {
            x: (x1 + x2) / 2, y: y - 8, fill: '#000',
            'font-size': 12, 'font-weight': 500, 'text-anchor': 'middle'
        });
        scaleText.textContent = formatMm(lengthMm);
        scaleGroup.appendChild(scaleText);

        svg.appendChild(scaleGroup);
    }

    /**
     * Draw one view from the most recent geometry
     * @param {boolean} isDetail - Whether to draw the detail view
     */
    function renderView(isDetail) {
        if (!lastGeometry) return;
        const v = getView(isDetail);
        if (!v.svg || !updateViewState(v, isDetail)) return;

        applyTransform(isDetail);
        clear(isDetail);
        v.svg.setAttribute('width', v.w);
        v.svg.setAttribute('height', v.h);
        v.svg.setAttribute('viewBox', `0 0 ${v.w} ${v.h}`);

        let regions = lastGeometry.regions;
        if (isDetail) {
            // Fingerprint-related regions: include all tissue layers to show complete structure
            const ids = ['subcutaneous-region', 'bone-region', 'dermis-region',
                'epidermis-region', 'stratum-corneum-region'];
            regions = regions.filter(r => ids.indexOf(r.id) !== -1);
        }
        regions.forEach(region => drawRegion(region, lastBoundaryMap, isDetail));

        drawAxes(lastParams, isDetail);
    }

    /**
     * Render complete geometry
     * @param {Object} geometry - Geometry model
     * @param {Object} params - Parameters
     */
    function render(geometry, params) {
        lastGeometry = geometry;
        lastParams = params;
        lastBoundaryMap = {};
        geometry.boundaries.forEach(b => {
            lastBoundaryMap[b.id] = b;
        });

        renderView(false);
        renderView(true);
    }

    /**
     * Update legend with tissue information
     * @param {Object} geometry - Geometry model
     * @param {HTMLElement} legendElement - Legend container element
     */
    function updateLegend(geometry, legendElement) {
        if (!legendElement) return;

        legendElement.innerHTML = '<h3>Tissues</h3>';
        
        const list = document.createElement('ul');
        list.className = 'legend-list';
        
        // Show regions in reverse order (same as visual stacking)
        const displayRegions = [...geometry.regions].reverse();
        
        displayRegions.forEach(region => {
            const item = document.createElement('li');
            
            const colorBox = document.createElement('span');
            colorBox.className = 'legend-color';
            colorBox.style.backgroundColor = region.color;
            
            const label = document.createElement('span');
            label.textContent = region.name;
            
            item.appendChild(colorBox);
            item.appendChild(label);
            list.appendChild(item);
        });
        
        legendElement.appendChild(list);
    }

    /**
     * Serialize a view as a standalone SVG document (what is currently shown,
     * including axes and scale bar, on a white background).
     * @param {boolean} isDetail - Whether to export the detail view
     * @returns {{markup: string, width: number, height: number}|null}
     */
    function getSvgMarkup(isDetail) {
        const v = getView(isDetail);
        if (!lastGeometry || !v.svg) return null;
        renderView(isDetail);   // make sure pending changes are drawn
        if (!(v.w > 0 && v.h > 0)) return null;

        const clone = v.svg.cloneNode(true);
        clone.setAttribute('xmlns', SVG_NS);
        clone.setAttribute('width', v.w);
        clone.setAttribute('height', v.h);
        clone.setAttribute('viewBox', `0 0 ${v.w} ${v.h}`);
        clone.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
        clone.insertBefore(
            svgEl('rect', { x: 0, y: 0, width: v.w, height: v.h, fill: '#ffffff' }),
            clone.firstChild
        );
        const markup = '<?xml version="1.0" encoding="UTF-8"?>\n' +
            new XMLSerializer().serializeToString(clone);
        return { markup: markup, width: v.w, height: v.h };
    }

    // Public API
    return {
        initialize,
        render,
        updateLegend,
        resetView,
        getSvgMarkup
    };
})();
