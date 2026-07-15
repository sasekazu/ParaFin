/**
 * parafin-api.js - Public, DOM/UI-independent API for ParaFin's shape generation
 *
 * This module exposes a small, stable surface on top of the existing
 * `Geometry` module (see geometry.js) so that other projects/scripts can
 * generate ParaFin fingertip geometry without touching any DOM/UI code.
 *
 * It intentionally does NOT modify geometry.js. It only wraps it.
 *
 * Public API (window.ParaFin):
 *   - getDefaultParameters()      -> same as Geometry.getDefaultParameters()
 *   - validateParameters(params)  -> same as Geometry.validateParameters()
 *   - validateMeshSettings(mesh)  -> same as Geometry.validateMeshSettings()
 *   - generateGeometry(params)    -> same as Geometry.generateGeometry()
 *   - generate(parameters)        -> merges defaults + input, validates, and
 *                                    generates geometry in a single call.
 *
 * generate() throws a descriptive Error (instead of returning a partial
 * shape) when the merged parameters are invalid.
 */

const ParaFin = (function() {
    'use strict';

    /**
     * Deep-ish merge of user-supplied parameters on top of the default
     * parameters. Only the 'mesh' sub-object requires special handling
     * since it is the only nested object in the parameter set.
     * @param {Object} params - User-supplied parameters (may be partial or empty)
     * @returns {Object} Merged parameter object (defaults are not mutated)
     */
    function mergeWithDefaults(params) {
        const defaults = Geometry.getDefaultParameters();
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
    function generate(parameters) {
        const merged = mergeWithDefaults(parameters);

        const validation = Geometry.validateParameters(merged);
        const meshValidation = Geometry.validateMeshSettings(merged.mesh);

        const allErrors = Object.assign({}, validation.errors, meshValidation.errors);
        const isValid = validation.valid && meshValidation.valid;

        if (!isValid) {
            throw new Error('ParaFin.generate: invalid parameters (' + formatErrors(allErrors) + ')');
        }

        const geometryResult = Geometry.generateGeometry(merged);

        return {
            parameters: merged,
            boundaries: geometryResult.boundaries,
            regions: geometryResult.regions,
            fingerprintMetadata: geometryResult.fingerprintMetadata,
            epidermisDermisMetadata: geometryResult.epidermisDermisMetadata
        };
    }

    // Public API
    return {
        getDefaultParameters: Geometry.getDefaultParameters,
        validateParameters: Geometry.validateParameters,
        validateMeshSettings: Geometry.validateMeshSettings,
        generateGeometry: Geometry.generateGeometry,
        generate: generate
    };
})();

// Explicit global exposure for use from other scripts/projects in the browser.
if (typeof window !== 'undefined') {
    window.ParaFin = ParaFin;
}
