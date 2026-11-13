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
 * - Auto-saving the inputs to localStorage and restoring them on start
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
        'fingerprintAngularExtent', 'fingerprintWavelength', 'fingerprintRidgeHeight',
        'epidermisDermisAngularExtent', 'epidermisDermisWavelength', 'epidermisDermisHeight'
    ];


    const STORAGE_KEY = 'parafin.project.v1';
    const SAVE_DELAY_MS = 300;
    let saveTimer = null;

    // Mesh setting parameter names (numeric inputs; checkbox handled separately)
    const MESH_PARAM_NAMES = [
        'meshFineSize', 'meshBulkSize', 'meshFineDistance', 'meshTransitionDistance', 'meshDistanceSampling'
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

        // Mesh settings elements
        MESH_PARAM_NAMES.forEach(name => {
            elements[name] = document.getElementById(name);
            elements['error' + name.charAt(0).toUpperCase() + name.slice(1)] =
                document.getElementById('error' + name.charAt(0).toUpperCase() + name.slice(1));
        });

        // Other elements
        elements.errorSummary = document.getElementById('errorSummary');
        elements.resetButton = document.getElementById('resetButton');
        elements.loadProjectButton = document.getElementById('loadProjectButton');
        elements.downloadButton = document.getElementById('downloadButton');
        elements.downloadGeoButton = document.getElementById('downloadGeoButton');
        elements.legend = document.getElementById('legend');
        elements.actionsHint = document.getElementById('actionsHint');
    }

    /**
     * Save valid parameters to localStorage (debounced). Storage may be unavailable
     * (private mode, blocked site data), so every access is wrapped in try/catch.
     * The stored text is the same project JSON used by "Download JSON".
     * @param {Object} params - Valid parameter object
     */
    function scheduleSave(params) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(Exporter.generateJSON(params)));
            } catch (e) { /* ignore: persistence is a convenience only */ }
        }, SAVE_DELAY_MS);
    }

    /**
     * Load previously saved parameters.
     * @returns {Object|null} Validated parameters, or null if none/invalid
     */
    function loadSavedParameters() {
        try {
            const text = localStorage.getItem(STORAGE_KEY);
            return text ? Exporter.importProjectFromText(text) : null;
        } catch (e) {
            return null;
        }
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
        params.mesh = getMeshSettings();
        return params;
    }

    /**
     * Get current mesh settings from input fields
     * @returns {Object} Current mesh settings
     */
    function getMeshSettings() {
        return {
            fineSize: parseFloat(elements.meshFineSize.value),
            bulkSize: parseFloat(elements.meshBulkSize.value),
            fineDistance: parseFloat(elements.meshFineDistance.value),
            transitionDistance: parseFloat(elements.meshTransitionDistance.value),
            distanceSampling: parseInt(elements.meshDistanceSampling.value, 10)
        };
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
        if (params.mesh) {
            const m = params.mesh;
            if (m.fineSize !== undefined)           elements.meshFineSize.value = m.fineSize;
            if (m.bulkSize !== undefined)           elements.meshBulkSize.value = m.bulkSize;
            if (m.fineDistance !== undefined)       elements.meshFineDistance.value = m.fineDistance;
            if (m.transitionDistance !== undefined) elements.meshTransitionDistance.value = m.transitionDistance;
            if (m.distanceSampling !== undefined)   elements.meshDistanceSampling.value = m.distanceSampling;
        }
        currentParams = { ...params };
    }

    /**
     * All input ids that can carry a validation error
     */
    function allErrorFieldNames() {
        return PARAM_DEFINITIONS.concat(MESH_PARAM_NAMES);
    }

    function errorElementFor(name) {
        return elements['error' + name.charAt(0).toUpperCase() + name.slice(1)];
    }

    /**
     * Clear all error messages and invalid markers; re-enable the download buttons
     */
    function clearErrors() {
        elements.errorSummary.textContent = '';
        elements.errorSummary.style.display = 'none';

        allErrorFieldNames().forEach(name => {
            const errorElement = errorElementFor(name);
            if (errorElement) {
                errorElement.textContent = '';
                errorElement.style.display = 'none';
            }
            const input = elements[name];
            if (input) {
                input.classList.remove('invalid');
                input.removeAttribute('aria-invalid');
                input.removeAttribute('aria-describedby');
            }
        });

        setDownloadsEnabled(true, 0);
    }

    /**
     * Enable/disable the download buttons and explain why when disabled
     * @param {boolean} enabled
     * @param {number} errorCount
     */
    function setDownloadsEnabled(enabled, errorCount) {
        const reason = 'Fix the ' + errorCount + ' input error' + (errorCount > 1 ? 's' : '') +
            ' shown in the left panel to enable downloads.';
        [elements.downloadButton, elements.downloadGeoButton].forEach(btn => {
            btn.disabled = !enabled;
            if (enabled) btn.removeAttribute('title');
            else btn.title = reason;
        });
        elements.actionsHint.textContent = enabled ? '' : reason;
        elements.actionsHint.style.display = enabled ? 'none' : 'block';
    }

    /**
     * Human-readable name of a parameter, taken from its <label>
     */
    function labelFor(name) {
        const el = document.querySelector('label[for="' + name + '"] .parameter-name');
        return el ? el.textContent : name;
    }

    /**
     * Move focus to an input, expanding its collapsible section if needed
     */
    function focusField(name) {
        const input = elements[name];
        if (!input) return;
        const section = input.closest('.param-section.collapsible');
        if (section && section.classList.contains('collapsed')) {
            section.classList.remove('collapsed');
            const toggle = section.querySelector('.section-toggle');
            if (toggle) toggle.setAttribute('aria-expanded', 'true');
        }
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        input.focus({ preventScroll: true });
        input.select();
    }

    /**
     * Show a plain message in the error summary (e.g. project load failure)
     */
    function showSummaryMessage(message) {
        clearErrors();
        elements.errorSummary.textContent = message;
        elements.errorSummary.style.display = 'block';
    }

    /**
     * Display validation errors
     * @param {Object} errors - Error messages keyed by parameter name
     */
    function displayErrors(errors) {
        clearErrors();

        const names = allErrorFieldNames().filter(name => errors[name]);
        if (names.length === 0) return;

        // Summary: count plus one jump link per error, in form order
        const summary = elements.errorSummary;
        summary.textContent = '';
        const heading = document.createElement('div');
        heading.textContent = `${names.length} validation error${names.length > 1 ? 's' : ''} found`;
        summary.appendChild(heading);

        const list = document.createElement('ul');
        list.className = 'error-summary-list';
        names.forEach(name => {
            const li = document.createElement('li');
            const link = document.createElement('button');
            link.type = 'button';
            link.className = 'error-link';
            link.textContent = labelFor(name);
            link.addEventListener('click', () => focusField(name));
            li.appendChild(link);
            li.appendChild(document.createTextNode(': ' + errors[name]));
            list.appendChild(li);
        });
        summary.appendChild(list);
        summary.style.display = 'block';

        // Per-field messages and markers
        names.forEach(name => {
            const errorElement = errorElementFor(name);
            if (errorElement) {
                errorElement.textContent = errors[name];
                errorElement.style.display = 'block';
            }
            const input = elements[name];
            input.classList.add('invalid');
            input.setAttribute('aria-invalid', 'true');
            if (errorElement && errorElement.id) input.setAttribute('aria-describedby', errorElement.id);
        });

        setDownloadsEnabled(false, names.length);
    }

    /**
     * Update geometry and rendering
     */
    function updateGeometry() {
        currentParams = getCurrentParameters();

        // Validate parameters
        const validation = Geometry.validateParameters(currentParams);
        const meshValidation = Geometry.validateMeshSettings(currentParams.mesh);

        // Merge all errors
        const allErrors = { ...validation.errors, ...meshValidation.errors };
        const allValid = validation.valid && meshValidation.valid;

        if (allValid) {
            clearErrors();
            scheduleSave(currentParams);

            // Generate geometry
            const geometry = Geometry.generateGeometry(currentParams);

            // Render
            Renderer.render(geometry, currentParams);
            Renderer.updateLegend(geometry, elements.legend);
        } else {
            displayErrors(allErrors);

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
        // Collapsible section toggles
        document.querySelectorAll('.param-section.collapsible .section-toggle').forEach(function(toggle) {
            function doToggle() {
                const section = toggle.parentElement;
                const isCollapsed = section.classList.toggle('collapsed');
                toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
            }
            toggle.addEventListener('click', doToggle);
            toggle.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    doToggle();
                }
            });
        });

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
                        showSummaryMessage('Failed to load project: ' + err.message);
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

        // Mesh settings inputs
        MESH_PARAM_NAMES.forEach(name => {
            elements[name].addEventListener('input', updateGeometry);
        });

        // Viewport resizes are handled by Renderer (ResizeObserver), which redraws
        // the views without regenerating the geometry.
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
        // Restore the last valid inputs from the previous session, else defaults
        setParameters(loadSavedParameters() || Geometry.getDefaultParameters());

        // Setup event listeners
        setupEventListeners();

        // Initial render — deferred so the browser completes layout first
        // (container.clientWidth/Height are 0 during synchronous DOMContentLoaded)
        requestAnimationFrame(function() {
            updateGeometry();
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
