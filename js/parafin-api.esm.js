/**
 * parafin-api.esm.js - npm / ES Modules entry point for ParaFin's shape generation
 *
 * This is the Node.js / ES Modules counterpart of js/parafin-api.js (the
 * classic-script version consumed by index.html). It wraps the DOM-independent
 * geometry logic in js/geometry-core.js and exposes the exact same behavior
 * as the browser's window.ParaFin.generate():
 *
 *   - Merges `parameters` on top of the default parameters (mesh merged separately)
 *   - Validates the merged parameters and mesh settings
 *   - Throws a descriptive Error instead of returning a partial shape when invalid
 *   - Returns { parameters, boundaries, regions, fingerprintMetadata, epidermisDermisMetadata }
 *
 * Usage:
 *   import ParaFin from 'parafin';
 *   const result = ParaFin.generate({ fingerWidth: 18, fingerHeight: 14 });
 *
 * Or with named imports:
 *   import { generate, getDefaultParameters, validateParameters,
 *            validateMeshSettings, generateGeometry } from 'parafin';
 */

import {
    getDefaultParameters,
    validateParameters,
    validateMeshSettings,
    generateGeometry
} from './geometry-core.js';

/**
 * Deep-ish merge of user-supplied parameters on top of the default
 * parameters. Only the 'mesh' sub-object requires special handling
 * since it is the only nested object in the parameter set.
 * @param {Object} params - User-supplied parameters (may be partial or empty)
 * @returns {Object} Merged parameter object (defaults are not mutated)
 */
function mergeWithDefaults(params) {
    const defaults = getDefaultParameters();
    const input = params || {};

    const merged = Object.assign({}, defaults, input);
    merged.mesh = Object.assign({}, defaults.mesh, input.mesh || {});

    return merged;
}

/**
 * Build a single human-readable message from a validation errors object.
 * @param {Object} errors - Map of parameter name -> error message
 * @returns {string}
 */
function formatErrors(errors) {
    return Object.keys(errors)
        .map(function(key) { return key + ': ' + errors[key]; })
        .join('; ');
}

/**
 * Validate and generate geometry in a single call.
 *
 * Merges `parameters` on top of the default parameters, validates the
 * merged result (including mesh settings), and generates geometry.
 * Throws an Error describing the problem instead of returning an
 * incomplete/partial shape when validation fails.
 *
 * @param {Object} [parameters] - Partial or full parameter overrides
 * @returns {{
 *   parameters: Object,
 *   boundaries: Array,
 *   regions: Array,
 *   fingerprintMetadata: Object,
 *   epidermisDermisMetadata: Object
 * }}
 */
export function generate(parameters) {
    const merged = mergeWithDefaults(parameters);

    const validation = validateParameters(merged);
    const meshValidation = validateMeshSettings(merged.mesh);

    const allErrors = Object.assign({}, validation.errors, meshValidation.errors);
    const isValid = validation.valid && meshValidation.valid;

    if (!isValid) {
        throw new Error('ParaFin.generate: invalid parameters (' + formatErrors(allErrors) + ')');
    }

    const geometryResult = generateGeometry(merged);

    return {
        parameters: merged,
        boundaries: geometryResult.boundaries,
        regions: geometryResult.regions,
        fingerprintMetadata: geometryResult.fingerprintMetadata,
        epidermisDermisMetadata: geometryResult.epidermisDermisMetadata
    };
}

// Re-export the lower-level building blocks for convenience.
export { getDefaultParameters, validateParameters, validateMeshSettings, generateGeometry };

// Default export mirrors the shape of the browser's window.ParaFin object.
const ParaFin = {
    getDefaultParameters,
    validateParameters,
    validateMeshSettings,
    generateGeometry,
    generate
};

export default ParaFin;
