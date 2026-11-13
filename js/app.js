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
 * - Out-of-range slider indication, inline parameter help
 * - Export file naming, SVG/PNG image export, drag & drop project loading
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
    const FILENAME_KEY = 'parafin.fileName';
    const MAX_PROJECT_FILE_BYTES = 5 * 1024 * 1024;

    // Short explanations shown by the "?" button next to each parameter
    const HELP = {
        fingerWidth: 'Horizontal width of the outer finger cross-section (the outer ellipse).',
        fingerHeight: 'Vertical (dorsal\u2013palmar) height of the outer finger cross-section.',
        stratumCorneumThickness: 'Thickness of the outermost skin layer. It follows the local normal, also across fingerprint ridges. The nail thickness is set to stratum corneum + epidermis thickness.',
        epidermisThickness: 'Thickness of the epidermis, just below the stratum corneum. Dermal papillae height must be smaller than this.',
        dermisThickness: 'Thickness of the dermis, below the epidermis. Everything inside it is subcutaneous tissue.',
        boneWidth: 'Width of the elliptical bone cross-section. The bone is centred horizontally and must fit inside the finger.',
        boneHeight: 'Height of the elliptical bone cross-section.',
        boneOffsetY: 'Vertical position of the bone centre relative to the finger centre. Positive values move the bone toward the dorsal (nail) side.',
        nailAngularExtent: 'Angular range of the nail on the dorsal side, symmetric about the dorsal apex (90\u00B0).',
        fingerprintAngularExtent: 'Requested angular range of the fingerprint ridges, centred on the palmar apex (270\u00B0). The ridge count is rounded up to an odd number of wavelengths, so the actual range can be slightly larger.',
        fingerprintWavelength: 'Distance between neighbouring fingerprint ridges.',
        fingerprintRidgeHeight: 'Height of the fingerprint ridges. Set to 0 for a smooth outer boundary.',
        epidermisDermisAngularExtent: 'Angular range of the dermal papillae at the epidermis\u2013dermis interface, centred on the palmar apex (270\u00B0). Independent of the fingerprint range.',
        epidermisDermisWavelength: 'Distance between neighbouring dermal papillae.',
        epidermisDermisHeight: 'Height of the dermal papillae. Set to 0 for a smooth interface; a nonzero value must be smaller than the epidermis thickness.',
        meshFineSize: 'Target element size in the fine region near the fingerprint curves. Must not exceed the bulk size.',
        meshBulkSize: 'Target element size away from the fingerprint curves. Without fingerprint ridges the whole mesh uses this size.',
        meshFineDistance: 'Distance from the fingerprint curves within which the fine size applies.',
        meshTransitionDistance: 'Distance from the fingerprint curves at which the size reaches the bulk size. Must be greater than the fine-region distance.',
        meshDistanceSampling: 'Number of sample points per curve used by Gmsh to measure distance. Larger values are more accurate but slower (integer, at least 10).'
    };
    const SAVE_DELAY_MS = 300;
    let saveTimer = null;
    let summaryOpen = false;

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
        elements.exportFileName = document.getElementById('exportFileName');
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
     * Copy an input's value to its slider and flag the slider when the value is
     * outside the slider's range (the number field still accepts it).
     * @param {string} param - Parameter name
     */
    function syncSlider(param) {
        const input = elements[param];
        const slider = elements[param + 'Slider'];
        const value = parseFloat(input.value);
        if (!isNaN(value)) slider.value = value;
        const outOfRange = !isNaN(value) && (value < parseFloat(slider.min) || value > parseFloat(slider.max));
        slider.classList.toggle('out-of-range', outOfRange);
        if (outOfRange) {
            slider.title = 'The value is outside the slider range (' + slider.min + ' to ' + slider.max +
                '). The number field still accepts it.';
        } else {
            slider.removeAttribute('title');
        }
    }

    /**
     * Set parameter values in input fields and sliders
     * @param {Object} params - Parameter object
     */
    function setParameters(params) {
        PARAM_DEFINITIONS.forEach(param => {
            if (params.hasOwnProperty(param)) {
                elements[param].value = params[param];
                syncSlider(param);
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
        elements.errorSummary.style.display = 'none';
        setSummaryOpen(false);

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
        document.querySelectorAll('.view-tools [data-action^="save-"]').forEach(btn => {
            btn.disabled = !enabled;
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
     * Build the error summary once: a chip that floats over the panel (it takes no
     * layout space, so nothing below it moves) and a popover with the details.
     */
    function setupErrorSummary() {
        const box = elements.errorSummary;
        box.textContent = '';

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'error-chip';
        chip.setAttribute('aria-expanded', 'false');
        chip.setAttribute('aria-controls', 'errorPopover');
        chip.addEventListener('click', () => setSummaryOpen(!summaryOpen));

        const popover = document.createElement('div');
        popover.className = 'error-popover';
        popover.id = 'errorPopover';
        popover.hidden = true;

        box.appendChild(chip);
        box.appendChild(popover);
        elements.errorChip = chip;
        elements.errorPopover = popover;

        document.addEventListener('click', function(e) {
            if (summaryOpen && !box.contains(e.target)) setSummaryOpen(false);
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && summaryOpen) {
                setSummaryOpen(false);
                elements.errorChip.focus();
            }
        });
    }

    function setSummaryOpen(open) {
        summaryOpen = open;
        elements.errorPopover.hidden = !open;
        elements.errorChip.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    /**
     * Show a plain message in the error summary (e.g. project load failure)
     */
    function showSummaryMessage(message) {
        clearErrors();
        elements.errorChip.textContent = '\u26A0 Error';
        elements.errorPopover.textContent = '';
        const p = document.createElement('p');
        p.textContent = message;
        elements.errorPopover.appendChild(p);
        elements.errorSummary.style.display = 'block';
        setSummaryOpen(true);
    }

    /**
     * Display validation errors
     * @param {Object} errors - Error messages keyed by parameter name
     */
    function displayErrors(errors) {
        const wasOpen = summaryOpen;   // keep the popover open while the user edits
        clearErrors();

        const names = allErrorFieldNames().filter(name => errors[name]);
        if (names.length === 0) return;

        // Summary chip + popover: one jump link per error, in form order
        const keepOpen = wasOpen;
        elements.errorChip.textContent =
            `\u26A0 ${names.length} error${names.length > 1 ? 's' : ''}`;
        const popover = elements.errorPopover;
        popover.textContent = '';
        const list = document.createElement('ul');
        list.className = 'error-summary-list';
        names.forEach(name => {
            const li = document.createElement('li');
            const link = document.createElement('button');
            link.type = 'button';
            link.className = 'error-link';
            link.textContent = labelFor(name);
            link.addEventListener('click', () => {
                setSummaryOpen(false);
                focusField(name);
            });
            li.appendChild(link);
            li.appendChild(document.createTextNode(': ' + errors[name]));
            list.appendChild(li);
        });
        popover.appendChild(list);
        elements.errorSummary.style.display = 'block';
        setSummaryOpen(keepOpen);

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
     * Read a project JSON file and apply it
     * @param {File} file
     */
    function loadProjectFile(file) {
        if (file.size > MAX_PROJECT_FILE_BYTES) {
            showSummaryMessage('Failed to load project: the file is too large to be a ParaFin project.');
            return;
        }
        const reader = new FileReader();
        reader.addEventListener('load', function() {
            try {
                setParameters(Exporter.importProjectFromText(reader.result));
                updateGeometry();
            } catch (err) {
                showSummaryMessage('Failed to load project: ' + err.message);
            }
        });
        reader.addEventListener('error', function() {
            showSummaryMessage('Failed to load project: the file could not be read.');
        });
        reader.readAsText(file);
    }

    /**
     * Accept a project file dropped anywhere on the page
     */
    function setupDropZone() {
        let depth = 0;
        const hasFiles = e => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') !== -1;

        window.addEventListener('dragenter', function(e) {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth++;
            document.body.classList.add('drag-active');
        });
        window.addEventListener('dragover', function(e) {
            if (!hasFiles(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        window.addEventListener('dragleave', function(e) {
            if (!hasFiles(e)) return;
            depth = Math.max(0, depth - 1);
            if (depth === 0) document.body.classList.remove('drag-active');
        });
        window.addEventListener('drop', function(e) {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth = 0;
            document.body.classList.remove('drag-active');
            if (e.dataTransfer.files.length > 0) loadProjectFile(e.dataTransfer.files[0]);
        });
    }

    /**
     * User-entered base file name with unsafe characters removed ('' if none)
     */
    function exportBaseName() {
        return (elements.exportFileName.value || '')
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
            .trim()
            .replace(/^\.+/, '')
            .replace(/\.(geo|json|svg|png)$/i, '')
            .trim();
    }

    /**
     * Output file name for a given kind. With no base name the original default
     * names are kept (parafin-model.geo, parafin-project.json, ...).
     * @param {'geo'|'json'|'svg'|'png'} ext
     * @param {string} [view] - 'main' or 'detail' (images only)
     */
    function exportFileName(ext, view) {
        const base = exportBaseName();
        const viewPart = view === 'detail' ? 'fingerprint-detail' : 'cross-section';
        if (ext === 'geo') return (base || 'parafin-model') + '.geo';
        if (ext === 'json') return (base || 'parafin-project') + '.json';
        return (base || 'parafin') + '-' + viewPart + '.' + ext;
    }

    /**
     * Save a preview view as SVG or PNG
     */
    function saveViewImage(isDetail, format) {
        const svg = Renderer.getSvgMarkup(isDetail);
        if (!svg) return;
        const filename = exportFileName(format, isDetail ? 'detail' : 'main');
        if (format === 'svg') {
            Exporter.downloadSVG(svg.markup, filename);
        } else {
            Exporter.downloadPNG(svg.markup, svg.width, svg.height, filename).catch(function(err) {
                console.error(err);
                window.alert('Could not create the PNG image. Try saving as SVG instead.');
            });
        }
    }

    /**
     * Add a "?" button with an inline explanation to each parameter
     */
    function setupHelp() {
        Object.keys(HELP).forEach(name => {
            const label = document.querySelector('label[for="' + name + '"]');
            if (!label) return;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'help-btn';
            button.textContent = '?';
            button.title = 'What is this?';
            button.setAttribute('aria-label', 'About ' + labelFor(name));
            button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-controls', 'help-' + name);

            const text = document.createElement('div');
            text.className = 'help-text';
            text.id = 'help-' + name;
            text.hidden = true;
            text.textContent = HELP[name];

            button.addEventListener('click', function() {
                text.hidden = !text.hidden;
                button.setAttribute('aria-expanded', text.hidden ? 'false' : 'true');
            });

            label.appendChild(button);
            label.insertAdjacentElement('afterend', text);
        });
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
                syncSlider(param);
                updateGeometry();
            });

            // Slider -> Input sync
            slider.addEventListener('input', function() {
                input.value = this.value;
                syncSlider(param);
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
                if (this.files[0]) loadProjectFile(this.files[0]);
            });
            fileInput.click();
        });

        setupDropZone();

        // Download JSON button
        elements.downloadButton.addEventListener('click', function() {
            if (this.disabled) return;

            const params = getCurrentParameters();
            const validation = Geometry.validateParameters(params);

            if (validation.valid) {
                Exporter.downloadJSON(params, exportFileName('json'));
            }
        });

        // Download GEO button
        elements.downloadGeoButton.addEventListener('click', function() {
            if (this.disabled) return;

            const params = getCurrentParameters();
            const validation = Geometry.validateParameters(params);

            if (validation.valid) {
                const geometry = Geometry.generateGeometry(params);
                Exporter.downloadGEO(params, geometry, exportFileName('geo'));
            }
        });

        // Image export buttons in the preview views
        document.querySelectorAll('.view-tools [data-action="save-svg"], .view-tools [data-action="save-png"]').forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.disabled) return;
                saveViewImage(this.getAttribute('data-view') === 'detail',
                    this.getAttribute('data-action') === 'save-png' ? 'png' : 'svg');
            });
        });

        // Export file name (remembered between visits)
        try { elements.exportFileName.value = localStorage.getItem(FILENAME_KEY) || ''; } catch (e) { /* ignore */ }
        elements.exportFileName.addEventListener('input', function() {
            try { localStorage.setItem(FILENAME_KEY, this.value); } catch (e) { /* ignore */ }
        });

        setupHelp();

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
        setupErrorSummary();
        
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
