/**
 * renderer.js - SVG rendering for ParaFin
 * 
 * This module handles:
 * - SVG element initialization
 * - Coordinate transformation (model coordinates in mm to screen coordinates)
 * - Automatic scaling to fit viewport
 * - Drawing ellipses, elliptical arcs, regions
 * - Axes and legend rendering
 */

const Renderer = (function() {
    'use strict';

    // Main view (full cross section)
    let mainSvg = null;
    let mainContainer = null;
    let mainScale = 1;
    let mainOffsetX = 0;
    let mainOffsetY = 0;
    let mainScaleInitialized = false;
    let mainViewBoxWidth = 0;
    let mainViewBoxHeight = 0;

    // Detail view (fingerprint magnified)
    let detailSvg = null;
    let detailContainer = null;
    let detailScale = 1;
    let detailOffsetX = 0;
    let detailOffsetY = 0;
    let detailScaleInitialized = false;
    let detailViewBoxWidth = 0;
    let detailViewBoxHeight = 0;

    const MARGIN = 40; // Margin around geometry in pixels
    const AXIS_LENGTH = 10; // Length of axis lines in mm

    /**
     * Initialize renderer with SVG elements
     * @param {SVGElement} mainSvgElement - Main view SVG element
     * @param {HTMLElement} mainContainerElement - Main view container element
     * @param {SVGElement} detailSvgElement - Detail view SVG element
     * @param {HTMLElement} detailContainerElement - Detail view container element
     */
    function initialize(mainSvgElement, mainContainerElement, detailSvgElement, detailContainerElement) {
        mainSvg = mainSvgElement;
        mainContainer = mainContainerElement;
        detailSvg = detailSvgElement;
        detailContainer = detailContainerElement;
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

    /**
     * Calculate scale and offset to fit geometry in viewport
     * @param {Object} geometry - Geometry model
     * @param {Object} params - Parameters
     * @param {boolean} isDetail - Whether to calculate for detail view
     */
    function calculateTransform(geometry, params, isDetail = false) {
        const container = isDetail ? detailContainer : mainContainer;
        const svg = isDetail ? detailSvg : mainSvg;
        
        if (!container || !svg) return;

        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        if (isDetail) {
            // Detail view: focus on fingerprint region (palmar surface at bottom of finger)
            if (!detailScaleInitialized && containerWidth > 0 && containerHeight > 0) {
                // Focus on a small region around the palmar surface
                // Palmar surface is at Y = -fingerHeight/2 in model coordinates
                // We want to show approximately ±2mm around the surface for detail
                const focusRegionWidth = Math.min(params.fingerWidth * 0.6, 8); // ~6-8mm width
                const focusRegionHeight = Math.min(params.fingerHeight * 0.3, 4); // ~3-4mm height
                
                // Calculate scale to fit focus region in container
                const scaleX = (containerWidth - 2 * MARGIN) / focusRegionWidth;
                const scaleY = (containerHeight - 2 * MARGIN) / focusRegionHeight;
                detailScale = Math.min(scaleX, scaleY);
                
                // Center the view horizontally (X = 0 at center)
                detailOffsetX = containerWidth / 2;
                
                // Position the view with palmar surface in upper part (30% from top)
                // This moves the entire finger structure down in the view
                // Screen Y = offsetY - modelY * scale
                // We want palmar surface at 30% down, so:
                // containerHeight * 0.3 = offsetY - (-fingerHeight/2) * scale
                // offsetY = containerHeight * 0.3 - fingerHeight/2 * scale
                detailOffsetY = containerHeight * 0.7 - (params.fingerHeight / 2) * detailScale;
                
                detailViewBoxWidth = containerWidth;
                detailViewBoxHeight = containerHeight;
                
                detailScaleInitialized = true;
            }

            svg.setAttribute('width', detailViewBoxWidth);
            svg.setAttribute('height', detailViewBoxHeight);
            svg.setAttribute('viewBox', `0 0 ${detailViewBoxWidth} ${detailViewBoxHeight}`);
        } else {
            // Main view: full cross section
            if (!mainScaleInitialized && containerWidth > 0 && containerHeight > 0) {
                // Calculate bounding box in model coordinates (mm)
                // Add minimal margins (3mm each side) for maximum zoom
                const modelWidth = params.fingerWidth + 2;
                const modelHeight = params.fingerHeight + 2;
                
                // Calculate scale to fit in container with margins
                const scaleX = (containerWidth - 2 * MARGIN) / modelWidth;
                const scaleY = (containerHeight - 2 * MARGIN) / modelHeight;
                mainScale = Math.min(scaleX, scaleY);
                
                // Fix center position
                mainOffsetX = containerWidth / 2;
                mainOffsetY = containerHeight / 2;
                
                // Fix viewBox dimensions
                mainViewBoxWidth = containerWidth;
                mainViewBoxHeight = containerHeight;
                
                mainScaleInitialized = true;
            }

            // Use fixed viewBox dimensions
            svg.setAttribute('width', mainViewBoxWidth);
            svg.setAttribute('height', mainViewBoxHeight);
            svg.setAttribute('viewBox', `0 0 ${mainViewBoxWidth} ${mainViewBoxHeight}`);
        }
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
                } else if (innerBoundary && innerBoundary.type === 'ellipse') {
                    // Ring region with outer parametric curve and inner ellipse (e.g., epidermis with fingerprint)
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
                if (innerBoundary) {
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
     * Draw coordinate axes
     * @param {Object} params - Parameters
     * @param {boolean} isDetail - Whether this is for detail view
     */
    function drawAxes(params, isDetail = false) {
        const svg = isDetail ? detailSvg : mainSvg;
        if (!svg) return;
        
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'axes');

        // Axis length adjusted for tighter view
        const axisLength = isDetail ? AXIS_LENGTH : 10; // 10mm for main view, 10mm for detail
        
        // X axis
        const xStart = modelToScreen(-axisLength, 0, isDetail);
        const xEnd = modelToScreen(axisLength, 0, isDetail);
        const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        xAxis.setAttribute('x1', xStart.x);
        xAxis.setAttribute('y1', xStart.y);
        xAxis.setAttribute('x2', xEnd.x);
        xAxis.setAttribute('y2', xEnd.y);
        xAxis.setAttribute('stroke', '#666');
        xAxis.setAttribute('stroke-width', 1);
        xAxis.setAttribute('stroke-dasharray', '4,2');
        g.appendChild(xAxis);

        // Y axis
        const yStart = modelToScreen(0, -axisLength, isDetail);
        const yEnd = modelToScreen(0, axisLength, isDetail);
        const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        yAxis.setAttribute('x1', yStart.x);
        yAxis.setAttribute('y1', yStart.y);
        yAxis.setAttribute('x2', yEnd.x);
        yAxis.setAttribute('y2', yEnd.y);
        yAxis.setAttribute('stroke', '#666');
        yAxis.setAttribute('stroke-width', 1);
        yAxis.setAttribute('stroke-dasharray', '4,2');
        g.appendChild(yAxis);

        // Axis labels
        const xLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        xLabel.setAttribute('x', xEnd.x + 10);
        xLabel.setAttribute('y', xEnd.y + 5);
        xLabel.setAttribute('fill', '#666');
        xLabel.setAttribute('font-size', '12');
        xLabel.textContent = 'X';
        g.appendChild(xLabel);

        const yLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        yLabel.setAttribute('x', yEnd.x + 5);
        yLabel.setAttribute('y', yEnd.y - 5);
        yLabel.setAttribute('fill', '#666');
        yLabel.setAttribute('font-size', '12');
        yLabel.textContent = 'Y (dorsal)';
        g.appendChild(yLabel);

        svg.appendChild(g);
        
        // Scale indicator - fixed position at bottom-center of screen
        const scaleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        scaleGroup.setAttribute('class', 'scale-indicator');
        
        const scaleLength = isDetail ? 1 : 10; // 1mm for detail, 10mm for main
        const scale = isDetail ? detailScale : mainScale;
        const scaleLengthPixels = scaleLength * scale;
        
        // Fixed position: centered horizontally, 30px from bottom
        const viewBoxWidth = isDetail ? detailViewBoxWidth : mainViewBoxWidth;
        const viewBoxHeight = isDetail ? detailViewBoxHeight : mainViewBoxHeight;
        const scaleStartX = (viewBoxWidth - scaleLengthPixels) / 2;
        const scaleStartY = viewBoxHeight - 30;
        const scaleEndX = scaleStartX + scaleLengthPixels;
        const scaleEndY = scaleStartY;
        
        const scaleLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        scaleLine.setAttribute('x1', scaleStartX);
        scaleLine.setAttribute('y1', scaleStartY);
        scaleLine.setAttribute('x2', scaleEndX);
        scaleLine.setAttribute('y2', scaleEndY);
        scaleLine.setAttribute('stroke', '#000');
        scaleLine.setAttribute('stroke-width', 2);
        scaleGroup.appendChild(scaleLine);

        const scaleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        scaleText.setAttribute('x', (scaleStartX + scaleEndX) / 2);
        scaleText.setAttribute('y', scaleStartY - 8);
        scaleText.setAttribute('fill', '#000');
        scaleText.setAttribute('font-size', '12');
        scaleText.setAttribute('font-weight', '500');
        scaleText.setAttribute('text-anchor', 'middle');
        scaleText.textContent = isDetail ? '1 mm' : '10 mm';
        scaleGroup.appendChild(scaleText);

        svg.appendChild(scaleGroup);
    }

    /**
     * Render complete geometry
     * @param {Object} geometry - Geometry model
     * @param {Object} params - Parameters
     */
    function render(geometry, params) {
        // Render main view
        clear(false);
        calculateTransform(geometry, params, false);

        // Create boundary lookup map
        const boundaryMap = {};
        geometry.boundaries.forEach(b => {
            boundaryMap[b.id] = b;
        });

        // Draw regions in main view
        geometry.regions.forEach(region => {
            drawRegion(region, boundaryMap, false);
        });

        // Draw axes in main view
        drawAxes(params, false);

        // Render detail view
        clear(true);
        calculateTransform(geometry, params, true);

        // Draw fingerprint-related regions in detail view
        // Include all tissue layers to show complete structure
        const fingerprintRegions = geometry.regions.filter(r => 
            r.id === 'subcutaneous-region' ||
            r.id === 'bone-region' ||
            r.id === 'dermis-region' ||
            r.id === 'epidermis-region' ||
            r.id === 'stratum-corneum-region'
        );

        fingerprintRegions.forEach(region => {
            drawRegion(region, boundaryMap, true);
        });

        // Draw axes in detail view
        drawAxes(params, true);
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

    // Public API
    return {
        initialize,
        render,
        updateLegend
    };
})();
