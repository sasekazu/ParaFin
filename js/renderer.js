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

    let svgElement = null;
    let containerElement = null;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let scaleInitialized = false; // Flag to prevent scale recalculation
    let viewBoxWidth = 0;
    let viewBoxHeight = 0;

    const MARGIN = 40; // Margin around geometry in pixels
    const AXIS_LENGTH = 10; // Length of axis lines in mm

    /**
     * Initialize renderer with SVG element
     * @param {SVGElement} svg - SVG element
     * @param {HTMLElement} container - Container element
     */
    function initialize(svg, container) {
        svgElement = svg;
        containerElement = container;
    }

    /**
     * Convert model coordinates (mm) to screen coordinates (pixels)
     * @param {number} x - X coordinate in mm
     * @param {number} y - Y coordinate in mm
     * @returns {Object} Screen coordinates {x, y}
     */
    function modelToScreen(x, y) {
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
     */
    function calculateTransform(geometry, params) {
        if (!containerElement) return;

        const containerWidth = containerElement.clientWidth;
        const containerHeight = containerElement.clientHeight;

        // Calculate scale, offset, and viewBox only once (on first render with valid container size)
        if (!scaleInitialized && containerWidth > 0 && containerHeight > 0) {
            // Calculate bounding box in model coordinates (mm)
            const modelWidth = params.fingerWidth + AXIS_LENGTH * 2;
            const modelHeight = params.fingerHeight + AXIS_LENGTH * 2;
            
            // Calculate scale to fit in container with margins
            const scaleX = (containerWidth - 2 * MARGIN) / modelWidth;
            const scaleY = (containerHeight - 2 * MARGIN) / modelHeight;
            scale = Math.min(scaleX, scaleY);
            
            // Fix center position
            offsetX = containerWidth / 2;
            offsetY = containerHeight / 2;
            
            // Fix viewBox dimensions
            viewBoxWidth = containerWidth;
            viewBoxHeight = containerHeight;
            
            scaleInitialized = true;
        }

        // Use fixed viewBox dimensions
        svgElement.setAttribute('width', viewBoxWidth);
        svgElement.setAttribute('height', viewBoxHeight);
        svgElement.setAttribute('viewBox', `0 0 ${viewBoxWidth} ${viewBoxHeight}`);
    }

    /**
     * Clear SVG content
     */
    function clear() {
        if (svgElement) {
            svgElement.innerHTML = '';
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
     * @returns {SVGElement} Ellipse element
     */
    function createEllipse(cx, cy, rx, ry, fillColor, strokeColor, strokeWidth) {
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.setAttribute('cx', cx);
        ellipse.setAttribute('cy', cy);
        ellipse.setAttribute('rx', rx);
        ellipse.setAttribute('ry', ry);
        ellipse.setAttribute('fill', fillColor);
        ellipse.setAttribute('stroke', strokeColor);
        ellipse.setAttribute('stroke-width', strokeWidth);
        return ellipse;
    }

    /**
     * Create SVG path for elliptical arc region (nail)
     * @param {Object} boundary - Boundary definition
     * @param {string} fillColor - Fill color
     * @returns {SVGElement} Path element
     */
    function createEllipticalArcPath(boundary, fillColor) {
        const center = modelToScreen(boundary.center[0], boundary.center[1]);
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
        path.setAttribute('stroke-width', 0.5);
        return path;
    }

    /**
     * Create SVG path from parametric curve (point array)
     * @param {Array} points - Array of {x, y} points in model coordinates
     * @param {string} fillColor - Fill color
     * @param {string} strokeColor - Stroke color
     * @param {number} strokeWidth - Stroke width
     * @returns {SVGElement} Path element
     */
    function drawParametricCurve(points, fillColor, strokeColor, strokeWidth) {
        if (!points || points.length === 0) return null;
        
        // Convert all points to screen coordinates
        const screenPoints = points.map(p => modelToScreen(p.x, p.y));
        
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
        if (strokeWidth) path.setAttribute('stroke-width', strokeWidth);
        
        return path;
    }

    /**
     * Draw a region
     * @param {Object} region - Region definition
     * @param {Object} boundaryMap - Map of boundary ID to boundary object
     */
    function drawRegion(region, boundaryMap) {
        const outerBoundary = boundaryMap[region.outerBoundary];
        
        if (!outerBoundary) return;

        if (outerBoundary.type === 'parametric-curve') {
            // For parametric curve regions (fingerprint)
            if (region.innerBoundary) {
                const innerBoundary = boundaryMap[region.innerBoundary];
                
                if (innerBoundary && innerBoundary.type === 'parametric-curve') {
                    // Ring region with both boundaries as parametric curves (e.g., stratum corneum with fingerprint)
                    const outerScreenPoints = outerBoundary.points.map(p => modelToScreen(p.x, p.y));
                    const innerScreenPoints = innerBoundary.points.map(p => modelToScreen(p.x, p.y));
                    
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
                    path.setAttribute('stroke-width', 0.5);
                    
                    svgElement.appendChild(path);
                } else if (innerBoundary && innerBoundary.type === 'ellipse') {
                    // Ring region with outer parametric curve and inner ellipse (e.g., epidermis with fingerprint)
                    const outerScreenPoints = outerBoundary.points.map(p => modelToScreen(p.x, p.y));
                    
                    const innerCenter = modelToScreen(innerBoundary.center[0], innerBoundary.center[1]);
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
                    path.setAttribute('stroke-width', 0.5);
                    
                    svgElement.appendChild(path);
                }
            } else {
                // Simple filled parametric curve
                const path = drawParametricCurve(outerBoundary.points, region.color, '#333', 1);
                if (path) svgElement.appendChild(path);
            }
        } else if (outerBoundary.type === 'ellipse') {
            // For ellipse regions
            const outerCenter = modelToScreen(outerBoundary.center[0], outerBoundary.center[1]);
            const outerRx = outerBoundary.width / 2 * scale;
            const outerRy = outerBoundary.height / 2 * scale;

            if (region.innerBoundary) {
                // Ring region (outer - inner)
                const innerBoundary = boundaryMap[region.innerBoundary];
                if (innerBoundary) {
                    const innerCenter = modelToScreen(innerBoundary.center[0], innerBoundary.center[1]);
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
                    path.setAttribute('stroke-width', 0.5);
                    
                    svgElement.appendChild(path);
                }
            } else if (region.excludeBoundaries) {
                // Fill region, but exclude certain boundaries (e.g., subcutaneous excluding bone)
                // For subcutaneous, draw the dermis-inner ellipse
                const ellipse = createEllipse(outerCenter.x, outerCenter.y, outerRx, outerRy, region.color, '#333', 0.5);
                svgElement.appendChild(ellipse);
                
                // The excluded regions (bone) will be drawn on top later
            } else {
                // Simple filled ellipse (e.g., bone)
                const ellipse = createEllipse(outerCenter.x, outerCenter.y, outerRx, outerRy, region.color, '#333', 1);
                svgElement.appendChild(ellipse);
            }
        } else if (outerBoundary.type === 'elliptical-arc') {
            // For nail (elliptical arc)
            const path = createEllipticalArcPath(outerBoundary, region.color);
            svgElement.appendChild(path);
        }
    }

    /**
     * Draw coordinate axes
     * @param {Object} params - Parameters
     */
    function drawAxes(params) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'axes');

        // X axis
        const xStart = modelToScreen(-AXIS_LENGTH, 0);
        const xEnd = modelToScreen(AXIS_LENGTH, 0);
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
        const yStart = modelToScreen(0, -AXIS_LENGTH);
        const yEnd = modelToScreen(0, AXIS_LENGTH);
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

        // Scale indicator (10mm reference)
        const scaleStart = modelToScreen(-params.fingerWidth / 2 - 5, -params.fingerHeight / 2 - 5);
        const scaleEnd = modelToScreen(-params.fingerWidth / 2 - 5 + 10, -params.fingerHeight / 2 - 5);
        
        const scaleLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        scaleLine.setAttribute('x1', scaleStart.x);
        scaleLine.setAttribute('y1', scaleStart.y);
        scaleLine.setAttribute('x2', scaleEnd.x);
        scaleLine.setAttribute('y2', scaleEnd.y);
        scaleLine.setAttribute('stroke', '#000');
        scaleLine.setAttribute('stroke-width', 2);
        g.appendChild(scaleLine);

        const scaleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        scaleText.setAttribute('x', (scaleStart.x + scaleEnd.x) / 2);
        scaleText.setAttribute('y', scaleStart.y - 5);
        scaleText.setAttribute('fill', '#000');
        scaleText.setAttribute('font-size', '10');
        scaleText.setAttribute('text-anchor', 'middle');
        scaleText.textContent = '10mm';
        g.appendChild(scaleText);

        svgElement.appendChild(g);
    }

    /**
     * Render complete geometry
     * @param {Object} geometry - Geometry model
     * @param {Object} params - Parameters
     */
    function render(geometry, params) {
        clear();
        calculateTransform(geometry, params);

        // Create boundary lookup map
        const boundaryMap = {};
        geometry.boundaries.forEach(b => {
            boundaryMap[b.id] = b;
        });

        // Draw regions in order (reverse order so that first regions are on bottom)
        geometry.regions.forEach(region => {
            drawRegion(region, boundaryMap);
        });

        // Draw axes
        drawAxes(params);
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
