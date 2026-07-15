/**
 * app.js - Main application controller for ParaFin
 * 
 * This module handles:
 * - DOM element references
 * - Input event management
 * - Parameter synchronization between inputs and sliders
 * - Validation error display
 * - Geometry regeneration and rendering
 * - Reset and export functionality
 */

(function() {
    'use strict';

    // Current parameters
    let currentParams = {};

    // DOM element references
    const elements = {};

    // Parameter definitions
    const PARAM_DEFINITIONS = [
        'fingerWidth', 'fingerHeight',
        'stratumCorneumThickness', 'epidermisThickness', 'dermisThickness',
        'boneWidth', 'boneHeight', 'boneOffsetY',
        'nailAngularExtent',
        'fingerprintAngularExtent', 'fingerprintWavelength', 'fingerprintRidgeHeight'
    ];

    /**
     * Initialize DOM element references
     */
    function initializeElements() {
        // Parameter inputs and sliders
        PARAM_DEFINITIONS.forEach(param => {
            elements[param] = document.getElementById(param);
            elements[param + 'Slider'] = document.getElementById(param + 'Slider');
            elements['error' + param.charAt(0).toUpperCase() + param.slice(1)] = 
                document.getElementById('error' + param.charAt(0).toUpperCase() + param.slice(1));
        });

        // Other elements
        elements.errorSummary = document.getElementById('errorSummary');
        elements.resetButton = document.getElementById('resetButton');
        elements.loadProjectButton = document.getElementById('loadProjectButton');
        elements.downloadButton = document.getElementById('downloadButton');
        elements.downloadGeoButton = document.getElementById('downloadGeoButton');
        elements.legend = document.getElementById('legend');
    }

    /**
     * Get current parameters from input fields
     * @returns {Object} Current parameter values
     */
    function getCurrentParameters() {
        const params = {};
        PARAM_DEFINITIONS.forEach(param => {
            const value = parseFloat(elements[param].value);
            params[param] = isNaN(value) ? 0 : value;
        });
        return params;
    }

    /**
     * Set parameter values in input fields and sliders
     * @param {Object} params - Parameter object
     */
    function setParameters(params) {
        PARAM_DEFINITIONS.forEach(param => {
            if (params.hasOwnProperty(param)) {
                elements[param].value = params[param];
                elements[param + 'Slider'].value = params[param];
            }
        });
        currentParams = { ...params };
    }

    /**
     * Clear all error messages
     */
    function clearErrors() {
        elements.errorSummary.textContent = '';
        elements.errorSummary.style.display = 'none';
        
        PARAM_DEFINITIONS.forEach(param => {
            const errorElement = elements['error' + param.charAt(0).toUpperCase() + param.slice(1)];
            if (errorElement) {
                errorElement.textContent = '';
                errorElement.style.display = 'none';
            }
        });
    }

    /**
     * Display validation errors
     * @param {Object} errors - Error messages keyed by parameter name
     */
    function displayErrors(errors) {
        clearErrors();

        const errorCount = Object.keys(errors).length;
        if (errorCount === 0) return;

        // Show summary
        elements.errorSummary.textContent = `${errorCount} validation error${errorCount > 1 ? 's' : ''} found`;
        elements.errorSummary.style.display = 'block';

        // Show individual errors
        for (const param in errors) {
            const errorElement = elements['error' + param.charAt(0).toUpperCase() + param.slice(1)];
            if (errorElement) {
                errorElement.textContent = errors[param];
                errorElement.style.display = 'block';
            }
        }

        // Disable download buttons
        elements.downloadButton.disabled = true;
        elements.downloadGeoButton.disabled = true;
    }

    /**
     * Update geometry and rendering
     */
    function updateGeometry() {
        currentParams = getCurrentParameters();

        // Validate parameters
        const validation = Geometry.validateParameters(currentParams);

        if (validation.valid) {
            clearErrors();
            elements.downloadButton.disabled = false;
            elements.downloadGeoButton.disabled = false;

            // Generate geometry
            const geometry = Geometry.generateGeometry(currentParams);

            // Render
            Renderer.render(geometry, currentParams);
            Renderer.updateLegend(geometry, elements.legend);
        } else {
            displayErrors(validation.errors);

            // Still try to render if possible (with best effort)
            try {
                const geometry = Geometry.generateGeometry(currentParams);
                Renderer.render(geometry, currentParams);
                Renderer.updateLegend(geometry, elements.legend);
            } catch (e) {
                console.error('Failed to render geometry:', e);
            }
        }
    }

    /**
     * Setup event listeners for input synchronization
     */
    function setupEventListeners() {
        PARAM_DEFINITIONS.forEach(param => {
            const input = elements[param];
            const slider = elements[param + 'Slider'];

            // Input -> Slider sync
            input.addEventListener('input', function() {
                const value = parseFloat(this.value);
                if (!isNaN(value)) {
                    slider.value = value;
                }
                updateGeometry();
            });

            // Slider -> Input sync
            slider.addEventListener('input', function() {
                input.value = this.value;
                updateGeometry();
            });
        });

        // Reset button
        elements.resetButton.addEventListener('click', function() {
            const defaultParams = Geometry.getDefaultParameters();
            setParameters(defaultParams);
            updateGeometry();
        });

        // Load Project button
        elements.loadProjectButton.addEventListener('click', function() {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.addEventListener('change', function() {
                const file = this.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.addEventListener('load', function() {
                    try {
                        const importedParams = Exporter.importProjectFromText(reader.result);
                        setParameters(importedParams);
                        updateGeometry();
                    } catch (err) {
                        clearErrors();
                        elements.errorSummary.textContent = 'Failed to load project: ' + err.message;
                        elements.errorSummary.style.display = 'block';
                    }
                });
                reader.readAsText(file);
            });
            fileInput.click();
        });

        // Download JSON button
        elements.downloadButton.addEventListener('click', function() {
            if (this.disabled) return;

            const params = getCurrentParameters();
            const validation = Geometry.validateParameters(params);

            if (validation.valid) {
                Exporter.downloadJSON(params);
            }
        });

        // Download GEO button
        elements.downloadGeoButton.addEventListener('click', function() {
            if (this.disabled) return;

            const params = getCurrentParameters();
            const validation = Geometry.validateParameters(params);

            if (validation.valid) {
                const geometry = Geometry.generateGeometry(params);
                Exporter.downloadGEO(params, geometry);
            }
        });

        // Window resize
        window.addEventListener('resize', function() {
            updateGeometry();
        });
    }

    /**
     * Initialize application
     */
    function initialize() {
        initializeElements();
        
        // Initialize renderer with both SVG elements
        const mainSvg = document.getElementById('mainSvg');
        const mainContainer = document.getElementById('mainViewContainer');
        const detailSvg = document.getElementById('detailSvg');
        const detailContainer = document.getElementById('detailViewContainer');
        
        Renderer.initialize(mainSvg, mainContainer, detailSvg, detailContainer);

        // Set default parameters
        const defaultParams = Geometry.getDefaultParameters();
        setParameters(defaultParams);

        // Setup event listeners
        setupEventListeners();

        // Initial render
        updateGeometry();
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
