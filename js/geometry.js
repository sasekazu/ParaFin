/**
 * geometry.js - Geometric model generation for ParaFin
 * 
 * This module handles:
 * - Parameter validation
 * - Boundary generation (ellipses and elliptical arcs)
 * - Region definition
 * - Coordinate system: origin at finger center, X: left-right, Y: dorsal-palmar (positive = dorsal)
 * 
 * Parameter notation follows Serhat et al. (2022), Fig. 5B:
 * - w_f: finger width
 * - h_f: finger height
 * - t_sc: stratum corneum thickness
 * - t_e: epidermis thickness
 * - t_d: dermis thickness
 * - w_b: bone width
 * - h_b: bone height
 * - e_b: bone vertical offset
 * - α_n: nail angular extent
 * 
 * Future fingerprint parameters (not yet implemented):
 * - α_r: fingerprint angular extent
 * - λ_r: fingerprint wavelength
 * - h_r: fingerprint ridge height
 * - λ_ed: epidermis-dermis interface wavelength
 * - h_ed: epidermis-dermis interface height
 * 
 * IMPORTANT: Uses simplified ellipse scaling approximation rather than true normal offset.
 * Each tissue layer boundary is calculated by reducing the width and height of the outer
 * boundary by 2 × thickness. This is an approximation that simplifies calculations but
 * may have accuracy limitations, especially for highly eccentric ellipses.
 */

const Geometry = (function() {
    'use strict';

    // Default parameter values (based on Serhat et al. 2022, Fig. 5B)
    const DEFAULT_PARAMS = {
        fingerWidth: 20,
        fingerHeight: 14,
        stratumCorneumThickness: 0.1,
        epidermisThickness: 0.6,
        dermisThickness: 0.8,
        boneWidth: 6,
        boneHeight: 3,
        boneOffsetY: 2,
        nailAngularExtent: 108  // Symmetric around dorsal apex (90°)
    };

    // Tissue colors for visualization
    const TISSUE_COLORS = {
        'stratum-corneum': '#FF8C00',  // Orange
        'epidermis': '#8B4513',        // Brown (SaddleBrown)
        'dermis': '#DB7093',           // Dark pink (PaleVioletRed)
        'subcutaneous': '#FFB6C1',     // Light pink
        'bone': '#A9A9A9',             // Gray (DarkGray)
        'nail': '#DAA520'              // Goldenrod (ochre)
    };

    /**
     * Get default parameters
     */
    function getDefaultParameters() {
        return { ...DEFAULT_PARAMS };
    }

    /**
     * Validate parameters and return errors
     * @param {Object} params - Parameter object
     * @returns {Object} Object with valid flag and errors array
     */
    function validateParameters(params) {
        const errors = {};
        let isValid = true;

        // Check if all values are numbers
        for (const key in params) {
            if (typeof params[key] !== 'number' || isNaN(params[key])) {
                errors[key] = 'Must be a valid number';
                isValid = false;
            }
        }

        // If basic number validation fails, return early
        if (!isValid) {
            return { valid: false, errors };
        }

        // Positive value checks
        if (params.fingerWidth <= 0) {
            errors.fingerWidth = 'Must be greater than 0';
            isValid = false;
        }
        if (params.fingerHeight <= 0) {
            errors.fingerHeight = 'Must be greater than 0';
            isValid = false;
        }
        if (params.boneWidth <= 0) {
            errors.boneWidth = 'Must be greater than 0';
            isValid = false;
        }
        if (params.boneHeight <= 0) {
            errors.boneHeight = 'Must be greater than 0';
            isValid = false;
        }

        // Non-negative checks for tissue thicknesses
        if (params.stratumCorneumThickness < 0) {
            errors.stratumCorneumThickness = 'Cannot be negative';
            isValid = false;
        }
        if (params.epidermisThickness < 0) {
            errors.epidermisThickness = 'Cannot be negative';
            isValid = false;
        }
        if (params.dermisThickness < 0) {
            errors.dermisThickness = 'Cannot be negative';
            isValid = false;
        }

        // Layer thickness consistency
        const totalLayerThickness = params.stratumCorneumThickness + 
                                   params.epidermisThickness + 
                                   params.dermisThickness;
        const minDimension = Math.min(params.fingerWidth, params.fingerHeight);
        
        if (totalLayerThickness * 2 >= minDimension) {
            const msg = 'Total tissue layers too thick for finger size';
            errors.stratumCorneumThickness = msg;
            errors.epidermisThickness = msg;
            errors.dermisThickness = msg;
            isValid = false;
        }

        // Bone placement validation (X offset fixed at 0)
        const boneOffsetX = 0;
        const boneLeftEdge = boneOffsetX - params.boneWidth / 2;
        const boneRightEdge = boneOffsetX + params.boneWidth / 2;
        const boneTopEdge = params.boneOffsetY + params.boneHeight / 2;
        const boneBottomEdge = params.boneOffsetY - params.boneHeight / 2;

        if (Math.abs(boneLeftEdge) >= params.fingerWidth / 2 || 
            Math.abs(boneRightEdge) >= params.fingerWidth / 2) {
            errors.boneWidth = 'Bone extends outside finger width';
            isValid = false;
        }
        if (Math.abs(boneTopEdge) >= params.fingerHeight / 2 || 
            Math.abs(boneBottomEdge) >= params.fingerHeight / 2) {
            errors.boneHeight = 'Bone extends outside finger height';
            errors.boneOffsetY = 'Bone extends outside finger height';
            isValid = false;
        }

        // Nail angle range validation
        if (params.nailAngularExtent < 0) {
            errors.nailAngularExtent = 'Cannot be negative';
            isValid = false;
        }
        if (params.nailAngularExtent > 180) {
            errors.nailAngularExtent = 'Cannot exceed 180°';
            isValid = false;
        }

        return { valid: isValid, errors };
    }

    /**
     * Generate ellipse boundary
     * @param {string} id - Boundary ID
     * @param {string} tissueType - Tissue type
     * @param {number} centerX - Center X coordinate (mm)
     * @param {number} centerY - Center Y coordinate (mm)
     * @param {number} width - Ellipse width (mm)
     * @param {number} height - Ellipse height (mm)
     * @returns {Object} Boundary object
     */
    function createEllipseBoundary(id, tissueType, centerX, centerY, width, height) {
        return {
            id,
            type: 'ellipse',
            tissueType,
            center: [centerX, centerY],
            width,
            height
        };
    }

    /**
     * Generate elliptical arc boundary (for nail)
     * @param {string} id - Boundary ID
     * @param {string} tissueType - Tissue type
     * @param {number} centerX - Center X coordinate (mm)
     * @param {number} centerY - Center Y coordinate (mm)
     * @param {number} baseWidth - Base ellipse width (mm)
     * @param {number} baseHeight - Base ellipse height (mm)
     * @param {number} thickness - Arc thickness (mm)
     * @param {number} startAngle - Start angle (degrees)
     * @param {number} endAngle - End angle (degrees)
     * @returns {Object} Boundary object
     */
    function createEllipticalArcBoundary(id, tissueType, centerX, centerY, baseWidth, baseHeight, thickness, startAngle, endAngle) {
        return {
            id,
            type: 'elliptical-arc',
            tissueType,
            center: [centerX, centerY],
            baseEllipseWidth: baseWidth,
            baseEllipseHeight: baseHeight,
            thickness,
            startAngle,
            endAngle
        };
    }

    /**
     * Generate region definition
     * @param {string} id - Region ID
     * @param {string} name - Display name
     * @param {string} tissueType - Tissue type
     * @param {string} outerBoundary - Outer boundary ID
     * @param {string|null} innerBoundary - Inner boundary ID (null if none)
     * @param {Array|null} excludeBoundaries - Array of boundary IDs to exclude (null if none)
     * @returns {Object} Region object
     */
    function createRegion(id, name, tissueType, outerBoundary, innerBoundary = null, excludeBoundaries = null) {
        const region = {
            id,
            name,
            tissueType,
            outerBoundary,
            color: TISSUE_COLORS[tissueType]
        };
        
        if (innerBoundary) {
            region.innerBoundary = innerBoundary;
        }
        
        if (excludeBoundaries) {
            region.excludeBoundaries = excludeBoundaries;
        }
        
        return region;
    }

    /**
     * Generate complete geometric model from parameters
     * Uses simplified ellipse scaling: inner ellipse dimensions are reduced by 2 × thickness
     * @param {Object} params - Parameter object
     * @returns {Object} Geometric model with boundaries and regions
     */
    function generateGeometry(params) {
        const boundaries = [];
        const regions = [];

        // Calculate radii from outer boundary
        const outerRx = params.fingerWidth / 2;
        const outerRy = params.fingerHeight / 2;

        // 1. Finger outer boundary
        const fingerOuter = createEllipseBoundary(
            'finger-outer',
            'outer-boundary',
            0, 0,
            params.fingerWidth,
            params.fingerHeight
        );
        boundaries.push(fingerOuter);

        // 2. Stratum corneum inner boundary (cumulative thickness from outer radius)
        const scInnerRx = outerRx - params.stratumCorneumThickness;
        const scInnerRy = outerRy - params.stratumCorneumThickness;
        const stratumCorneumInner = createEllipseBoundary(
            'stratum-corneum-inner',
            'stratum-corneum-inner',
            0, 0,
            scInnerRx * 2,
            scInnerRy * 2
        );
        boundaries.push(stratumCorneumInner);

        // 3. Epidermis inner boundary (cumulative thickness from outer radius)
        const epidermisInnerRx = outerRx - params.stratumCorneumThickness - params.epidermisThickness;
        const epidermisInnerRy = outerRy - params.stratumCorneumThickness - params.epidermisThickness;
        const epidermisInner = createEllipseBoundary(
            'epidermis-inner',
            'epidermis-inner',
            0, 0,
            epidermisInnerRx * 2,
            epidermisInnerRy * 2
        );
        boundaries.push(epidermisInner);

        // 4. Dermis inner boundary (cumulative thickness from outer radius)
        const dermisInnerRx = outerRx - params.stratumCorneumThickness - params.epidermisThickness - params.dermisThickness;
        const dermisInnerRy = outerRy - params.stratumCorneumThickness - params.epidermisThickness - params.dermisThickness;
        const dermisInner = createEllipseBoundary(
            'dermis-inner',
            'dermis-inner',
            0, 0,
            dermisInnerRx * 2,
            dermisInnerRy * 2
        );
        boundaries.push(dermisInner);

        // 5. Bone boundary (independent ellipse with Y offset, X fixed at 0)
        const bone = createEllipseBoundary(
            'bone',
            'bone',
            0,  // boneOffsetX fixed at 0
            params.boneOffsetY,
            params.boneWidth,
            params.boneHeight
        );
        boundaries.push(bone);

        // 6. Nail boundary (elliptical arc)
        // Nail thickness = stratum corneum + epidermis (nail replaces these layers)
        const nailThickness = params.stratumCorneumThickness + params.epidermisThickness;
        // Nail angle is symmetric around dorsal apex (90°)
        const nailStartAngle = 90 - params.nailAngularExtent / 2;
        const nailEndAngle = 90 + params.nailAngularExtent / 2;
        const nail = createEllipticalArcBoundary(
            'nail',
            'nail',
            0, 0,
            params.fingerWidth,
            params.fingerHeight,
            nailThickness,
            nailStartAngle,
            nailEndAngle
        );
        boundaries.push(nail);

        // Create regions
        // Drawing order: innermost to outermost, then independent regions, then axes

        // 1. Subcutaneous tissue (dermis-inner interior, excluding bone)
        regions.push(createRegion(
            'subcutaneous-region',
            'Subcutaneous Tissue',
            'subcutaneous',
            'dermis-inner',
            null,
            ['bone']
        ));

        // 2. Dermis layer
        regions.push(createRegion(
            'dermis-region',
            'Dermis',
            'dermis',
            'epidermis-inner',
            'dermis-inner'
        ));

        // 3. Epidermis layer
        regions.push(createRegion(
            'epidermis-region',
            'Epidermis',
            'epidermis',
            'stratum-corneum-inner',
            'epidermis-inner'
        ));

        // 4. Stratum corneum layer
        regions.push(createRegion(
            'stratum-corneum-region',
            'Stratum Corneum',
            'stratum-corneum',
            'finger-outer',
            'stratum-corneum-inner'
        ));

        // 5. Bone (independent region)
        regions.push(createRegion(
            'bone-region',
            'Bone',
            'bone',
            'bone'
        ));

        // 6. Nail (independent region)
        regions.push(createRegion(
            'nail-region',
            'Nail',
            'nail',
            'nail'
        ));

        return {
            boundaries,
            regions
        };
    }

    // Public API
    return {
        getDefaultParameters,
        validateParameters,
        generateGeometry,
        TISSUE_COLORS
    };
})();
