/**
 * geometry-core.js - Geometric model generation for ParaFin (ES Module)
 *
 * This is the DOM/browser-independent, ES Module version of the shape
 * generation logic. It is the npm/Node.js entry point for the underlying
 * geometry algorithms and is consumed by js/parafin-api.esm.js.
 *
 * IMPORTANT: This file mirrors js/geometry.js (the classic-script version
 * used by the browser UI) function-for-function and formula-for-formula.
 * The two files exist side by side (rather than one importing the other)
 * because js/geometry.js is loaded via a plain <script> tag so that
 * index.html keeps working when opened directly from the filesystem
 * (file://), where native ES module loading is unreliable/blocked by
 * browsers' CORS rules. Do not change the algorithms here without making
 * the same change in js/geometry.js, and vice versa.
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
 * - α_r: fingerprint angular extent
 * - λ_r: fingerprint wavelength
 * - h_r: fingerprint ridge height
 * - α_ed: epidermis-dermis interface angular extent (dermal papillae)
 * - λ_ed: epidermis-dermis interface wavelength
 * - h_ed: epidermis-dermis interface height
 *
 * IMPORTANT: Uses simplified ellipse scaling approximation rather than true normal offset.
 * Each tissue layer boundary is calculated by reducing the width and height of the outer
 * boundary by 2 × thickness. This is an approximation that simplifies calculations but
 * may have accuracy limitations, especially for highly eccentric ellipses.
 */

// Small epsilon for floating-point comparisons (e.g. ridgeHeight === 0)
const EPS = 1e-10;

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
    nailAngularExtent: 108,  // Symmetric around dorsal apex (90°)
    fingerprintAngularExtent: 140,  // Palmar region extent (minimum)
    fingerprintWavelength: 0.5,     // Ridge wavelength in mm
    fingerprintRidgeHeight: 0.1,    // Ridge height in mm
    epidermisDermisAngularExtent: 140,  // Dermal papillae angular extent (minimum), independent of fingerprint
    epidermisDermisWavelength: 1.0,     // Dermal papillae wavelength (λ_ed) in mm
    epidermisDermisHeight: 0.2,         // Dermal papillae height (h_ed) in mm; 0 = smooth ellipse
    mesh: {
        fineSize: 0.05,
        bulkSize: 0.30,
        fineDistance: 0.10,
        transitionDistance: 0.60,
        distanceSampling: 200
    }
};

// Tissue colors for visualization
export const TISSUE_COLORS = {
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
export function getDefaultParameters() {
    return { ...DEFAULT_PARAMS };
}

/**
 * Validate parameters and return errors
 * @param {Object} params - Parameter object
 * @returns {Object} Object with valid flag and errors array
 */
export function validateParameters(params) {
    const errors = {};
    let isValid = true;

    // Check if all values are numbers (skip 'mesh' sub-object)
    for (const key in params) {
        if (key === 'mesh') continue;
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

    // Fingerprint parameter validation
    if (params.fingerprintAngularExtent < 0) {
        errors.fingerprintAngularExtent = 'Cannot be negative';
        isValid = false;
    }
    if (params.fingerprintAngularExtent > 180) {
        errors.fingerprintAngularExtent = 'Cannot exceed 180°';
        isValid = false;
    }

    if (params.fingerprintWavelength <= 0) {
        errors.fingerprintWavelength = 'Must be greater than 0';
        isValid = false;
    }
    if (params.fingerprintWavelength < 0.1) {
        errors.fingerprintWavelength = 'Minimum wavelength is 0.1 mm (to avoid excessive point count)';
        isValid = false;
    }

    if (params.fingerprintRidgeHeight < 0) {
        errors.fingerprintRidgeHeight = 'Cannot be negative';
        isValid = false;
    }
    // Ridge height upper limit
    const maxRidgeHeight = 0.2;
    if (params.fingerprintRidgeHeight > maxRidgeHeight) {
        errors.fingerprintRidgeHeight = `Cannot exceed ${maxRidgeHeight.toFixed(1)} mm`;
        isValid = false;
    }

    // Epidermis-dermis interface (dermal papillae) parameter validation
    if (params.epidermisDermisAngularExtent < 0) {
        errors.epidermisDermisAngularExtent = 'Cannot be negative';
        isValid = false;
    }
    if (params.epidermisDermisAngularExtent > 180) {
        errors.epidermisDermisAngularExtent = 'Cannot exceed 180°';
        isValid = false;
    }

    if (params.epidermisDermisWavelength <= 0) {
        errors.epidermisDermisWavelength = 'Must be greater than 0';
        isValid = false;
    }
    if (params.epidermisDermisWavelength < 0.1) {
        errors.epidermisDermisWavelength = 'Minimum wavelength is 0.1 mm (to avoid excessive point count)';
        isValid = false;
    }

    if (params.epidermisDermisHeight < 0) {
        errors.epidermisDermisHeight = 'Cannot be negative';
        isValid = false;
    }
    if (params.epidermisDermisHeight > EPS && params.epidermisDermisHeight >= params.epidermisThickness) {
        errors.epidermisDermisHeight = 'Must be less than epidermis thickness';
        isValid = false;
    }

    return { valid: isValid, errors };
}

/**
 * Validate mesh settings and return errors.
 * Error keys use 'meshFineSize', 'meshBulkSize', etc. to match DOM error element IDs.
 * When mesh.enabled is false, numeric validation is skipped (settings are inactive).
 * @param {Object} mesh - Mesh settings object
 * @returns {Object} { valid, errors }
 */
export function validateMeshSettings(mesh) {
    if (!mesh || typeof mesh !== 'object') {
        return { valid: false, errors: { meshFineSize: 'Mesh settings missing' } };
    }

    const errors = {};
    let isValid = true;

    const fineSizeOk = typeof mesh.fineSize === 'number' && isFinite(mesh.fineSize) && mesh.fineSize > 0;
    const bulkSizeOk = typeof mesh.bulkSize === 'number' && isFinite(mesh.bulkSize) && mesh.bulkSize > 0;
    const fineDistanceOk = typeof mesh.fineDistance === 'number' && isFinite(mesh.fineDistance) && mesh.fineDistance >= 0;

    if (!fineSizeOk) {
        errors.meshFineSize = 'Must be greater than 0';
        isValid = false;
    }
    if (!bulkSizeOk) {
        errors.meshBulkSize = 'Must be greater than 0';
        isValid = false;
    }
    if (fineSizeOk && bulkSizeOk && mesh.fineSize > mesh.bulkSize) {
        errors.meshFineSize = 'Fine size must not exceed bulk size';
        isValid = false;
    }
    if (!fineDistanceOk) {
        errors.meshFineDistance = 'Must be 0 or greater';
        isValid = false;
    }
    if (typeof mesh.transitionDistance !== 'number' || !isFinite(mesh.transitionDistance)) {
        errors.meshTransitionDistance = 'Must be a valid number';
        isValid = false;
    } else if (fineDistanceOk && mesh.transitionDistance <= mesh.fineDistance) {
        errors.meshTransitionDistance = 'Must be greater than fine-region distance';
        isValid = false;
    }
    if (typeof mesh.distanceSampling !== 'number' || !isFinite(mesh.distanceSampling) ||
            !Number.isInteger(mesh.distanceSampling) || mesh.distanceSampling < 10) {
        errors.meshDistanceSampling = 'Must be an integer \u2265 10';
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

// Number of angular subdivisions used to numerically integrate the ellipse arc-length
// element ds/dθ = sqrt(a²sin²θ + b²cos²θ) via the trapezoidal rule (0.1° per step).
const ARC_LENGTH_TABLE_DIVISIONS = 3600;

/**
 * Build a cumulative arc-length table for the reference ellipse x = a cos θ, y = b sin θ,
 * θ ∈ [0, 2π], via trapezoidal-rule numerical integration of ds/dθ = sqrt(a²sin²θ + b²cos²θ).
 * @param {number} a - Semi-axis along x
 * @param {number} b - Semi-axis along y
 * @returns {{thetas: number[], cumulativeArcLength: number[], circumference: number}}
 */
function buildEllipseArcLengthTable(a, b) {
    const n = ARC_LENGTH_TABLE_DIVISIONS;
    const dTheta = (2 * Math.PI) / n;
    const thetas = new Array(n + 1);
    const cumulativeArcLength = new Array(n + 1);

    const dsdTheta = (theta) => {
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);
        return Math.sqrt(a * a * sinT * sinT + b * b * cosT * cosT);
    };

    thetas[0] = 0;
    cumulativeArcLength[0] = 0;
    let prevDeriv = dsdTheta(0);
    for (let i = 1; i <= n; i++) {
        const theta = i * dTheta;
        const deriv = dsdTheta(theta);
        cumulativeArcLength[i] = cumulativeArcLength[i - 1] + 0.5 * (prevDeriv + deriv) * dTheta;
        thetas[i] = theta;
        prevDeriv = deriv;
    }

    return { thetas, cumulativeArcLength, circumference: cumulativeArcLength[n] };
}

/**
 * Interpolate cumulative arc length at a given angle (degrees, normalized to [0, 360))
 * from a table built by buildEllipseArcLengthTable().
 */
function angleDegToArcLength(table, angleDeg) {
    let angle = angleDeg % 360;
    if (angle < 0) angle += 360;
    const n = ARC_LENGTH_TABLE_DIVISIONS;
    const dTheta = (2 * Math.PI) / n;
    const idxFloat = (angle * Math.PI / 180) / dTheta;
    const idx0 = Math.min(n - 1, Math.floor(idxFloat));
    const idx1 = idx0 + 1;
    const frac = idxFloat - idx0;
    const { cumulativeArcLength } = table;
    return cumulativeArcLength[idx0] + frac * (cumulativeArcLength[idx1] - cumulativeArcLength[idx0]);
}

/**
 * Same as angleDegToArcLength(), but accepts angles outside [0, 360) (negative, or beyond
 * 360°) by unwrapping through whole-circumference multiples, so arc length stays
 * monotonically increasing with angle across the 0°/360° period boundary.
 */
function angleDegToArcLengthUnwrapped(table, angleDeg) {
    const wraps = Math.floor(angleDeg / 360);
    const angleMod = angleDeg - wraps * 360;
    return wraps * table.circumference + angleDegToArcLength(table, angleMod);
}

/**
 * Inverse lookup: given a target cumulative arc length s (clamped to [0, circumference]),
 * find the corresponding angle (degrees) via binary search over the table plus linear
 * interpolation between the bracketing samples.
 */
function arcLengthToAngleDeg(table, s) {
    const arr = table.cumulativeArcLength;
    let lo = 0;
    let hi = arr.length - 1;
    const clamped = Math.min(Math.max(s, arr[0]), arr[hi]);
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] <= clamped) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    const s0 = arr[lo];
    const s1 = arr[hi];
    const frac = (s1 > s0) ? (clamped - s0) / (s1 - s0) : 0;
    const thetaRad = table.thetas[lo] + frac * (table.thetas[hi] - table.thetas[lo]);
    return thetaRad * 180 / Math.PI;
}

/**
 * Generate fingerprint boundary pair (outer surface and stratum corneum inner surface)
 * with phase-matched ridges to ensure constant thickness along normals.
 *
 * Ridges are defined with integer periods, smoothly transitioning at boundaries:
 * - d(s) = h_r / 2 * (1 + cos(2πs / λ_r))
 * - At palmar center (s=0): d = h_r (ridge peak)
 * - At period boundaries (s = ±nλ/2): d = 0 and dd/ds = 0 (smooth connection to ellipse)
 * - Ridge count is odd, with ridge peak at palmar center (270°)
 * - Angular extent is expanded to fit integer periods symmetrically
 *
 * @param {number} centerX - Center X coordinate
 * @param {number} centerY - Center Y coordinate
 * @param {number} outerWidth - Outer boundary width
 * @param {number} outerHeight - Outer boundary height
 * @param {number} stratumCorneumThickness - Stratum corneum thickness (t_sc)
 * @param {number} angularExtent - Minimum fingerprint angular extent (α_r, requested)
 * @param {number} wavelength - Fingerprint wavelength (λ_r)
 * @param {number} ridgeHeight - Fingerprint ridge height (h_r)
 * @returns {Object} Object with outerBoundary, innerBoundary, and metadata
 */
function generateFingerprintBoundariesPair(centerX, centerY, outerWidth, outerHeight, stratumCorneumThickness, angularExtent, wavelength, ridgeHeight) {
    const rx_outer = outerWidth / 2;
    const ry_outer = outerHeight / 2;

    // Build a cumulative arc-length table for the outer reference ellipse via numerical
    // integration of ds/dθ = sqrt(rx²sin²θ + ry²cos²θ) (trapezoidal rule, 0.1° steps).
    // Computed unconditionally so palmar layout metadata is always available.
    const arcTable = buildEllipseArcLengthTable(rx_outer, ry_outer);
    const circumference = arcTable.circumference;

    // Palmar region is centered at 270° (bottom of ellipse, -Y direction)
    const palmarCenter = 270; // degrees

    // Actual arc length spanned by the user-requested angular range (centered at 270°),
    // read from the numerically-integrated cumulative arc-length table.
    const requestedStartAngle = palmarCenter - angularExtent / 2;
    const requestedEndAngle = palmarCenter + angularExtent / 2;
    const requestedArcLength = angleDegToArcLengthUnwrapped(arcTable, requestedEndAngle) -
        angleDegToArcLengthUnwrapped(arcTable, requestedStartAngle);

    // Calculate minimum ridge count to satisfy requested extent
    const minRidgeCount = Math.ceil(requestedArcLength / wavelength);

    // Round up to nearest odd number (so ridge peak is at palmar center)
    const ridgeCount = (minRidgeCount % 2 === 0) ? minRidgeCount + 1 : minRidgeCount;

    // Actual arc length with integer periods
    const actualArcLength = ridgeCount * wavelength;
    const halfActualArcLength = actualArcLength / 2;

    // Arc length at palmar center (reference point for phase = 0, and for locating the
    // actual start/end angles below)
    const palmarCenterArcLength = angleDegToArcLength(arcTable, palmarCenter);

    // Locate the angles ±actualArcLength/2 away from the palmar center along the ellipse,
    // via inverse (arc length → angle) lookup on the same cumulative table. This correctly
    // accounts for arc length wrapping around the 0°/360° boundary near the palmar center.
    const sStart = palmarCenterArcLength - halfActualArcLength;
    const sEnd = palmarCenterArcLength + halfActualArcLength;

    const palmarStart = (sStart >= 0)
        ? arcLengthToAngleDeg(arcTable, sStart)
        : arcLengthToAngleDeg(arcTable, sStart + circumference) - 360;

    const palmarEnd = (sEnd <= circumference)
        ? arcLengthToAngleDeg(arcTable, sEnd)
        : arcLengthToAngleDeg(arcTable, sEnd - circumference) + 360;

    // Actual angular extent achieved, derived from the arc-length table (not a linear
    // angle/arc-length relation)
    const actualAngularExtent = palmarEnd - palmarStart;

    // If ridgeHeight is effectively 0, return standard ellipse boundaries.
    // Full layout metadata (palmarStart, palmarEnd) is included so the exporter
    // can use the same segmented-boundary topology regardless of ridge amplitude.
    if (ridgeHeight <= EPS) {
        return {
            outerBoundary: createEllipseBoundary('finger-outer', 'outer-boundary', centerX, centerY, outerWidth, outerHeight),
            innerBoundary: createEllipseBoundary('stratum-corneum-inner', 'stratum-corneum-inner', centerX, centerY,
                outerWidth - 2 * stratumCorneumThickness, outerHeight - 2 * stratumCorneumThickness),
            metadata: {
                requestedAngularExtent: angularExtent,
                actualAngularExtent: actualAngularExtent,
                ridgeCount: ridgeCount,
                palmarCenter: palmarCenter,
                palmarStart: palmarStart,
                palmarEnd: palmarEnd
            }
        };
    }

    // Use ~15 points per wavelength for smooth visualization
    const pointsPerWavelength = 15;
    const estimatedWavelengthCount = circumference / wavelength;
    const totalPoints = Math.max(100, Math.ceil(estimatedWavelengthCount * pointsPerWavelength));

    const outerPoints = [];
    const innerPoints = [];

    // Generate points around the ellipse
    for (let i = 0; i < totalPoints; i++) {
        const theta = (i / totalPoints) * 360; // degrees
        const thetaRad = theta * Math.PI / 180;

        // Base ellipse point on outer reference ellipse
        const x0_outer = rx_outer * Math.cos(thetaRad);
        const y0_outer = ry_outer * Math.sin(thetaRad);

        // Arc length up to this point, read from the numerically-integrated cumulative
        // arc-length table (not a uniform-parameter approximation)
        const s_outer = angleDegToArcLength(arcTable, theta);

        // Arc length relative to palmar center
        let s_relative = s_outer - palmarCenterArcLength;
        // Normalize to [-circumference/2, circumference/2]
        if (s_relative > circumference / 2) {
            s_relative -= circumference;
        } else if (s_relative < -circumference / 2) {
            s_relative += circumference;
        }

        // Calculate outward normal vector for outer ellipse
        // For ellipse (rx*cos(θ), ry*sin(θ)), the outward normal is proportional to (cos(θ)/rx, sin(θ)/ry)
        const nx = Math.cos(thetaRad) / rx_outer;
        const ny = Math.sin(thetaRad) / ry_outer;
        const nMag = Math.sqrt(nx * nx + ny * ny);
        const nxNorm = nx / nMag;
        const nyNorm = ny / nMag;

        // Check if this point is in the fingerprint region, using the signed arc length
        // from the palmar center (matches ±actualArcLength/2 exactly, and naturally
        // handles wrap-around across the 270° palmar center without a separate branch)
        const inFingerprintRegion = (s_relative >= -halfActualArcLength && s_relative <= halfActualArcLength);

        // Calculate displacement: d(s) = h_r / 2 * (1 - cos(2πs / λ_r))
        // At palmar center (s_relative = 0), we want a ridge peak (d = h_r)
        // Standard formula gives d(0) = 0 (valley), so shift phase by π:
        // d(s) = h_r / 2 * (1 - cos(2πs / λ_r + π)) = h_r / 2 * (1 + cos(2πs / λ_r))
        // This ensures d = 0 and dd/ds = 0 at period boundaries (s = ±nλ/2)
        let displacement = 0;
        if (inFingerprintRegion && ridgeHeight > 0) {
            const phase = 2 * Math.PI * s_relative / wavelength;
            displacement = (ridgeHeight / 2) * (1 + Math.cos(phase));
        }

        // Outer surface = base + displacement * n
        const x_outer = x0_outer + displacement * nxNorm;
        const y_outer = y0_outer + displacement * nyNorm;

        // Inner surface = outer surface - t_sc * n (constant thickness along normal)
        const x_inner = x_outer - stratumCorneumThickness * nxNorm;
        const y_inner = y_outer - stratumCorneumThickness * nyNorm;

        outerPoints.push({ x: centerX + x_outer, y: centerY + y_outer });
        innerPoints.push({ x: centerX + x_inner, y: centerY + y_inner });
    }

    return {
        outerBoundary: {
            id: 'finger-outer',
            type: 'parametric-curve',
            tissueType: 'outer-boundary',
            center: [centerX, centerY],
            width: outerWidth,
            height: outerHeight,
            points: outerPoints
        },
        innerBoundary: {
            id: 'stratum-corneum-inner',
            type: 'parametric-curve',
            tissueType: 'stratum-corneum-inner',
            center: [centerX, centerY],
            width: outerWidth - 2 * stratumCorneumThickness,
            height: outerHeight - 2 * stratumCorneumThickness,
            points: innerPoints
        },
        metadata: {
            requestedAngularExtent: angularExtent,
            actualAngularExtent: actualAngularExtent,
            ridgeCount: ridgeCount,
            palmarCenter: palmarCenter,
            palmarStart: palmarStart,
            palmarEnd: palmarEnd
        }
    };
}

/**
 * Generate epidermis-inner boundary with dermal papillae (epidermis-dermis interface ridges).
 *
 * Unlike generateFingerprintBoundariesPair() (which uses an always-non-negative waveform),
 * the dermal papillae here use a signed sinusoidal displacement around the base epidermis-inner
 * ellipse, driven by its own independent angular extent / wavelength / height parameters
 * (NOT the fingerprint parameters):
 * - epidermisDermisHeight (h_ed) is the peak-to-peak height: -h_ed/2 <= d(s) <= h_ed/2
 * - d(s) = h_ed / 2 * cos(2π s_relative / λ_ed), where s_relative is the signed arc length
 *   from the palmar center (s_relative = 0 at 270°)
 * - At palmar center (s_relative = 0): d = +h_ed/2 (positive peak, displaced along outward
 *   normal, i.e. dermis protrudes toward the epidermis side)
 * - At the two ends of the applied region: d = 0 (zero-crossing connection to the
 *   base ellipse)
 * - The applied region is built from an odd number of half-waves (each of length λ_ed/2) so
 *   that the center is always a positive peak and both ends are always zero-crossings.
 * - The requested angular extent is expanded as needed (in half-wave steps) so that the
 *   actual applied arc length ends exactly on a zero-crossing.
 *
 * When papillaHeight (h_ed) <= EPS, returns a plain ellipse boundary (no points, no BSpline).
 *
 * @param {number} centerX - Center X coordinate
 * @param {number} centerY - Center Y coordinate
 * @param {number} width - Epidermis-inner ellipse width (base, undisplaced)
 * @param {number} height - Epidermis-inner ellipse height (base, undisplaced)
 * @param {number} angularExtent - Minimum dermal papillae angular extent (α_ed, requested)
 * @param {number} wavelength - Dermal papillae wavelength (λ_ed)
 * @param {number} papillaHeight - Dermal papillae peak-to-peak height (h_ed)
 * @returns {Object} Object with boundary and metadata
 */
function generateEpidermisDermisBoundary(centerX, centerY, width, height, angularExtent, wavelength, papillaHeight) {
    const rx = width / 2;
    const ry = height / 2;

    // Build a cumulative arc-length table for the base epidermis-inner ellipse via numerical
    // integration of ds/dθ = sqrt(rx²sin²θ + ry²cos²θ) (trapezoidal rule, 0.1° steps).
    const arcTable = buildEllipseArcLengthTable(rx, ry);
    const circumference = arcTable.circumference;

    // Palmar region is centered at 270° (bottom of ellipse, -Y direction)
    const palmarCenter = 270; // degrees

    // Actual arc length spanned by the user-requested angular range (centered at 270°),
    // read from the numerically-integrated cumulative arc-length table.
    const requestedStartAngle = palmarCenter - angularExtent / 2;
    const requestedEndAngle = palmarCenter + angularExtent / 2;
    const requestedArcLength = angleDegToArcLengthUnwrapped(arcTable, requestedEndAngle) -
        angleDegToArcLengthUnwrapped(arcTable, requestedStartAngle);

    // Find the minimum number of half-waves (each of length wavelength/2) whose total
    // length reaches at least the requested arc length.
    const halfWavelength = wavelength / 2;
    const minHalfWaveCount = Math.ceil(requestedArcLength / halfWavelength);

    // Force an odd half-wave count: this guarantees a positive peak at the palmar center
    // (phase = 0) and a zero-crossing at both ends of the applied region (phase = ±nπ/2 with
    // n odd), so the waveform has a zero-crossing connection to the base ellipse.
    const halfWaveCount = (minHalfWaveCount % 2 === 0) ? minHalfWaveCount + 1 : Math.max(1, minHalfWaveCount);

    // Actual arc length spanned by the applied region (may be slightly larger than requested
    // so that it ends exactly on a zero-crossing)
    const actualArcLength = halfWaveCount * wavelength / 2;
    const halfActualArcLength = actualArcLength / 2;

    // Retain "ridgeCount" as the metadata field name for compatibility with existing
    // consumers (exporter, etc.); it now holds the (odd) half-wave count.
    const ridgeCount = halfWaveCount;

    // Arc length at palmar center (reference point for phase = 0, and for locating the
    // actual start/end angles below)
    const palmarCenterArcLength = angleDegToArcLength(arcTable, palmarCenter);

    // Locate the angles ±actualArcLength/2 away from the palmar center along the ellipse,
    // via inverse (arc length → angle) lookup on the same cumulative table. This correctly
    // accounts for arc length wrapping around the 0°/360° boundary near the palmar center.
    const sStart = palmarCenterArcLength - halfActualArcLength;
    const sEnd = palmarCenterArcLength + halfActualArcLength;

    const palmarStart = (sStart >= 0)
        ? arcLengthToAngleDeg(arcTable, sStart)
        : arcLengthToAngleDeg(arcTable, sStart + circumference) - 360;

    const palmarEnd = (sEnd <= circumference)
        ? arcLengthToAngleDeg(arcTable, sEnd)
        : arcLengthToAngleDeg(arcTable, sEnd - circumference) + 360;

    // Actual angular extent achieved, derived from the arc-length table (not a linear
    // angle/arc-length relation)
    const actualAngularExtent = palmarEnd - palmarStart;

    // If papillaHeight is effectively 0, return a standard ellipse boundary.
    // Full layout metadata (palmarStart, palmarEnd) is included so the exporter
    // can use the same segmented-boundary topology regardless of papilla amplitude.

    if (papillaHeight <= EPS) {
        return {
            boundary: createEllipseBoundary('epidermis-inner', 'epidermis-inner', centerX, centerY, width, height),
            metadata: {
                requestedAngularExtent: angularExtent,
                actualAngularExtent: actualAngularExtent,
                ridgeCount: ridgeCount,
                palmarCenter: palmarCenter,
                palmarStart: palmarStart,
                palmarEnd: palmarEnd
            }
        };
    }

    // Use ~15 points per wavelength for smooth visualization
    const pointsPerWavelength = 15;
    const estimatedWavelengthCount = circumference / wavelength;
    const totalPoints = Math.max(100, Math.ceil(estimatedWavelengthCount * pointsPerWavelength));

    const points = [];

    for (let i = 0; i < totalPoints; i++) {
        const theta = (i / totalPoints) * 360; // degrees
        const thetaRad = theta * Math.PI / 180;

        // Base ellipse point
        const x0 = rx * Math.cos(thetaRad);
        const y0 = ry * Math.sin(thetaRad);

        // Arc length up to this point, read from the numerically-integrated cumulative
        // arc-length table (not a uniform-parameter approximation)
        const s = angleDegToArcLength(arcTable, theta);

        // Arc length relative to palmar center
        let s_relative = s - palmarCenterArcLength;
        if (s_relative > circumference / 2) {
            s_relative -= circumference;
        } else if (s_relative < -circumference / 2) {
            s_relative += circumference;
        }

        // Outward normal vector for ellipse (rx*cos(θ), ry*sin(θ))
        const nx = Math.cos(thetaRad) / rx;
        const ny = Math.sin(thetaRad) / ry;
        const nMag = Math.sqrt(nx * nx + ny * ny);
        const nxNorm = nx / nMag;
        const nyNorm = ny / nMag;

        // Check if this point is within the applied papillae region, using the signed
        // arc length from the palmar center (s_relative) rather than the angle theta,
        // per requirement 9. The applied region spans [-actualArcLength/2, +actualArcLength/2].
        const inPapillaRegion = (s_relative >= -halfActualArcLength && s_relative <= halfActualArcLength);

        // Displacement: signed sine wave around the base ellipse.
        // d(s) = h_ed / 2 * cos(2π s_relative / λ_ed)
        // At s_relative = 0 (palmar center): d = +h_ed/2 (positive peak)
        // At s_relative = ±halfActualArcLength (region ends): d = 0 (zero-crossing, since
        // the region length is an odd number of half-wavelengths).
        // Displaced along the outward normal, i.e. dermis protrudes toward epidermis side
        // for positive displacement, and recedes toward dermis side for negative displacement.
        let displacement = 0;
        if (inPapillaRegion && papillaHeight > 0) {
            // Explicitly zero at the region boundary to avoid floating-point step artifacts.
            if (Math.abs(Math.abs(s_relative) - halfActualArcLength) < 1e-9) {
                displacement = 0;
            } else {
                const phase = 2 * Math.PI * s_relative / wavelength;
                displacement = (papillaHeight / 2) * Math.cos(phase);
            }
        }


        const x = x0 + displacement * nxNorm;
        const y = y0 + displacement * nyNorm;

        points.push({ x: centerX + x, y: centerY + y });
    }

    return {
        boundary: {
            id: 'epidermis-inner',
            type: 'parametric-curve',
            tissueType: 'epidermis-inner',
            center: [centerX, centerY],
            width: width,
            height: height,
            points: points
        },
        metadata: {
            requestedAngularExtent: angularExtent,
            actualAngularExtent: actualAngularExtent,
            ridgeCount: ridgeCount,
            palmarCenter: palmarCenter,
            palmarStart: palmarStart,
            palmarEnd: palmarEnd
        }
    };
}

/**
 * Generate complete geometric model from parameters
 * Uses simplified ellipse scaling: inner ellipse dimensions are reduced by 2 × thickness
 * @param {Object} params - Parameter object
 * @returns {Object} Geometric model with boundaries and regions
 */
export function generateGeometry(params) {
    const boundaries = [];
    const regions = [];

    // Calculate radii from outer boundary
    const outerRx = params.fingerWidth / 2;
    const outerRy = params.fingerHeight / 2;

    // 1 & 2. Generate finger outer boundary and stratum corneum inner boundary as a phase-matched pair
    // This ensures the fingerprint ridges and valleys are perfectly aligned with constant t_sc thickness
    const fingerprintPair = generateFingerprintBoundariesPair(
        0, 0,
        params.fingerWidth,
        params.fingerHeight,
        params.stratumCorneumThickness,
        params.fingerprintAngularExtent,
        params.fingerprintWavelength,
        params.fingerprintRidgeHeight
    );
    boundaries.push(fingerprintPair.outerBoundary);
    boundaries.push(fingerprintPair.innerBoundary);

    // 3. Epidermis inner boundary (cumulative thickness from outer radius), with optional
    // dermal papillae (epidermis-dermis interface ridges), driven by independent angular
    // extent / wavelength / height parameters (not the fingerprint parameters above).
    const epidermisInnerRx = outerRx - params.stratumCorneumThickness - params.epidermisThickness;
    const epidermisInnerRy = outerRy - params.stratumCorneumThickness - params.epidermisThickness;
    const epidermisDermisResult = generateEpidermisDermisBoundary(
        0, 0,
        epidermisInnerRx * 2,
        epidermisInnerRy * 2,
        params.epidermisDermisAngularExtent,
        params.epidermisDermisWavelength,
        params.epidermisDermisHeight
    );
    boundaries.push(epidermisDermisResult.boundary);

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
        regions,
        fingerprintMetadata: fingerprintPair.metadata,
        epidermisDermisMetadata: epidermisDermisResult.metadata
    };
}
