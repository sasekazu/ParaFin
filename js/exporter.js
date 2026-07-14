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
                nailAngularExtent: params.nailAngularExtent
            },
            derivedValues: {
                boneOffsetX: 0,
                nailThickness: params.stratumCorneumThickness + params.epidermisThickness,
                nailStartAngle: 90 - params.nailAngularExtent / 2,
                nailEndAngle: 90 + params.nailAngularExtent / 2
            },
            geometry: {
                boundaries: geometry.boundaries,
                regions: geometry.regions
            },
            notes: {
                approximation: 'Tissue layer boundaries use simplified ellipse scaling (width/height reduction) rather than true normal offset',
                assumptions: 'No fingerprint ridges, smooth epidermal-dermal junction',
                nailModel: 'Nail thickness equals stratum corneum + epidermis (nail replaces these layers). Nail arc is symmetric around dorsal apex (90°).'
            },
            extensionReserved: {
                fingerprint: null,
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

    // Public API
    return {
        generateJSON,
        downloadJSON
    };
})();
