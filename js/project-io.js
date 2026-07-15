/**
 * project-io.js - JSON import/export for ParaFin projects
 *
 * This module handles:
 * - Saving the current input settings as a minimal project JSON file
 * - Loading a project JSON file and restoring application settings
 */

const _ProjectIO = (function() {
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
            dermalPapillae: {
                epidermisDermisAngularExtent: params.epidermisDermisAngularExtent,
                epidermisDermisWavelength: params.epidermisDermisWavelength,
                epidermisDermisHeight: params.epidermisDermisHeight
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

        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;

        document.body.appendChild(a);
        a.click();

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
     * @param {Object} dp   - dermalPapillae section
     */
    function validateVersion1Fields(geom, fp, dp) {
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

        // Optional dermal papillae (epidermis-dermis interface) fields (only validate if present)
        if (dp.epidermisDermisAngularExtent !== undefined) {
            requireInRange(dp.epidermisDermisAngularExtent, 'dermalPapillae.epidermisDermisAngularExtent', 0, 180);
        }
        if (dp.epidermisDermisWavelength !== undefined) {
            requireFinite(dp.epidermisDermisWavelength, 'dermalPapillae.epidermisDermisWavelength');
            if (dp.epidermisDermisWavelength < 0.1) {
                throw new Error(
                    'Field "dermalPapillae.epidermisDermisWavelength" must be >= 0.1 mm ' +
                    '(got ' + dp.epidermisDermisWavelength + ').'
                );
            }
        }
        if (dp.epidermisDermisHeight !== undefined) {
            requireNonNegative(dp.epidermisDermisHeight, 'dermalPapillae.epidermisDermisHeight');
            const epidermisThickness = geom.epidermisThickness;
            if (dp.epidermisDermisHeight > 1e-10 &&
                    typeof epidermisThickness === 'number' &&
                    dp.epidermisDermisHeight >= epidermisThickness) {
                throw new Error(
                    'Field "dermalPapillae.epidermisDermisHeight" must be less than ' +
                    'geometry.epidermisThickness (got ' + dp.epidermisDermisHeight +
                    ' >= ' + epidermisThickness + ').'
                );
            }
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
        const dp = (typeof data.dermalPapillae === 'object' && data.dermalPapillae !== null)
            ? data.dermalPapillae : {};

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

        // Merge optional fingerprint / dermal papillae fields with defaults
        // (old project files without these sections get default values, per spec)
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
                                            : defaults.fingerprintRidgeHeight,
            epidermisDermisAngularExtent: dp.epidermisDermisAngularExtent !== undefined
                                            ? dp.epidermisDermisAngularExtent
                                            : defaults.epidermisDermisAngularExtent,
            epidermisDermisWavelength:    dp.epidermisDermisWavelength    !== undefined
                                            ? dp.epidermisDermisWavelength
                                            : defaults.epidermisDermisWavelength,
            epidermisDermisHeight:        dp.epidermisDermisHeight        !== undefined
                                            ? dp.epidermisDermisHeight
                                            : defaults.epidermisDermisHeight
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

        validateVersion1Fields(geom, fp, dp);

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
        importProjectFromText,
    };
})();
