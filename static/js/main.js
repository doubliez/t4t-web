/* Main script for the control of the UI */

var Simulation = function(ws, generator, params, fifo) {
    /*
     * `ws` the web socket object
     * `generator` the PYTHIA program to run (e.g. `main42.exe`)
     * `params` the PYTHIA cmnd file (e.g. `main42.cmnd`)
     * `fifo` the FIFO file name
     */

    this.ws = ws;
    this.generator = generator;
    this.params = params;
    this.fifo = fifo;
};

Simulation.prototype = {
    init: function() {
        var message = {
            action: 'init',
            generator: this.generator,
            params: this.params,
            fifo: this.fifo
            };
        this.ws.send(JSON.stringify(message));
    },
    loadParams: function(params) {
        var message = {action: 'load_params', params: params};
        this.ws.send(JSON.stringify(message));
    },
    run: function() {
        var message = {
            action: 'run',
            analysis: this.analysis,
            histointerval: this.histointerval
            };
        this.ws.send(JSON.stringify(message));
    },
    pause: function() {
        var message = {action: 'pause'};
        this.ws.send(JSON.stringify(message));
    },
    resume: function() {
        var message = {action: 'resume'};
        this.ws.send(JSON.stringify(message));
    },
    stop: function() {
        var message = {action: 'stop'};
        this.ws.send(JSON.stringify(message));
    },
    compare: function(yodaFiles) {
        var message = {action: 'compare', yoda_files: yodaFiles};
        this.ws.send(JSON.stringify(message));
    },
    setAnalysis: function(analysis) {
        this.analysis = analysis;
    },
    setHistoInterval: function(histointerval) {
        this.histointerval = histointerval;
    },
    requiredBeams: function(analysis) {
        var message = {action: 'required_beams', analysis: analysis};
        this.ws.send(JSON.stringify(message));
    },
    analysisDetails: function(analysis) {
        var message = {action: 'analysis_details', analysis: analysis};
        this.ws.send(JSON.stringify(message));
    }
};

var SimulationControl = function(simulation, analysisSelector, histoIntervalSlider, pythiaFullOutput, rivetFullOutput, analysesTable, histograms, parameters) {
    /*
     * Control the workflow of the simulation.
     *
     * Several DOM elements are used and updated to reflect
     * the current state of the simulation and interact with it.
     */

    // Javascript "classes"
    this.simulation = simulation;
    this.histograms = histograms;
    this.parameters = parameters;

    // DOM elements (which do not depend on a specific analysis)
    this.analysisSelector = analysisSelector;
    this.histoIntervalSlider = histoIntervalSlider;
    this.pythiaFullOutput = pythiaFullOutput;
    this.rivetFullOutput = rivetFullOutput;
    this.analysesTable = analysesTable;
};

SimulationControl.prototype = {
    runAction: function() {
        /*
         * When the user clicks on the "Run" button.
         */

        // If the parameters have been modified but not saved, a modal window warns the user
        if (this.parameters.changed) {
            $('#params-changed-modal').modal('show');
        } else {
            // Get the analysis and histo interval chosen by the user
            var analysis = this.analysisSelector.val();
            var histoInterval = this.histoIntervalSlider.slider('value');

            // DOM elements (depending on the chosen analysis)
            var analysesTableEntry = $('#' + analysis);
            var analysesTableStatus = $('#' + analysis + ' .status');
            var runNumber = $('#' + analysis + ' .run-number');
            var histogramsDiv = $('#histograms-' + analysis);

            this.simulation.setAnalysis(analysis);
            this.simulation.setHistoInterval(histoInterval);

            // Empty the "consoles" from precedent runs
            this.pythiaFullOutput.empty();
            this.rivetFullOutput.empty();

            // Create or update table entry corresponding to the analysis
            if (analysesTableEntry.length) {
                analysesTableEntry.attr('class', 'warning');
                analysesTableStatus.text('Started');
                runNumber.text(parseInt(runNumber.text()) + 1);
                $('#' + analysis + ' .delete').prop('disabled', true);

                this._updateModal();
            } else {
                var tableEntry = '<tr id="' + analysis + '" class="warning">';
                tableEntry += '<td><strong>' + analysis + '</strong></td>';
                tableEntry += '<td class="run-number">1</td>';
                tableEntry += '<td class="status">Started</td>';
                tableEntry += '<td>';
                tableEntry += '<button type="button" class="params btn">Compare runs</button>';
                tableEntry += '<button type="button" class="delete btn btn-danger" disabled="disabled">Delete</button>';
                tableEntry += '</td>';
                tableEntry += '</tr>';

                this.analysesTable.append(tableEntry);

                // Need a closure to access `histograms` for the event handler
                (function(histograms) {
                    $('#' + analysis + ' .delete').click(function() {
                        histograms.remove(analysis);
                        if ($('#histograms-' + analysis).length) {
                            $('#histograms-' + analysis).remove();
                        }
                        $(this).parent().parent().remove();
                        $('#' + analysis + '-modal').remove();
                    });
                })(this.histograms);

                this._createModal();

                $('#' + analysis + ' .params').click(function() {
                    $('#' + analysis + '-modal').modal('show');
                });
            }

            // Create the div for the histograms of this analysis if it doesn't exist
            if (!histogramsDiv.length) {
                var histogramContainer = $(document.createElement('div')).appendTo('#histograms')
                    .attr('id', 'histograms-' + analysis)
                    .attr('class', 'histogram-container')
                    .attr('data-analysis', analysis);

                $(document.createElement('h2')).appendTo(histogramContainer)
                    .text(analysis);

                var rowFluid = $(document.createElement('div')).appendTo(histogramContainer)
                    .attr('class', 'row-fluid');

                $(document.createElement('div')).appendTo(rowFluid)
                    .attr('class', 'first-histogram span7')
                    .append('<svg class="histogram"></svg>');

                $(document.createElement('div')).appendTo(rowFluid)
                    .attr('class', 'histogram-selector span5');
            }

            this.simulation.init();
            this.simulation.run();
        }
    },
    pauseAction: function() {
        /*
         * When the user clicks on the "Pause" button.
         */

        this.simulation.pause();

        // Typeset LaTeX maths with MathJax
        MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
    },
    resumeAction: function() {
        /*
         * When the user clicks on the "Resume" button.
         */

        this.simulation.resume();
    },
    stopAction: function() {
        /*
         * When the user clicks on the "Stop" button.
         */

        this.simulation.stop();

        // Typeset LaTeX maths with MathJax
        MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
    },
    compareAction: function(analysis, yodaFiles) {
        /*
         * When the user clicks on the "Compare selected runs" button
         * inside the modal window "Compare runs" of an analysis.
         */

        if (yodaFiles.length === 0) {
            alert('Please select at least one run!');
        } else {
            this.histograms.reset(analysis);
            this.simulation.compare(yodaFiles);
        }
    },
    updateAnalysesTable: function(state, status) {
        /*
         * Update the status and color of the row corresponding
         * to the currently running analysis.
         */

        var analysesTableEntry = $('#' + this.simulation.analysis);
        var analysesTableStatus = $('#' + this.simulation.analysis + ' .status');

        if (analysesTableEntry.length) {
            analysesTableEntry.attr('class', state);
            analysesTableStatus.text(status);
        }

        if (state === 'error' || state === 'success') {
            $('#' + this.simulation.analysis + ' .delete').prop('disabled', false);
        }
    },
    _createModal: function() {
        /*
         * Create the modal window "Compare runs" for the selected analysis.
         */

        var analysis = this.simulation.analysis;
        var analyses = $('#analyses');

        var modal = '<div id="' + analysis + '-modal" class="modal hide fade" tabindex="-1" role="dialog" aria-labelledby="' + analysis + '-modal-title" aria-hidden="true">';
        modal += '<div class="modal-header">';
        modal += '<button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>';
        modal += '<h3 id="' + analysis + '-modal-title">' + analysis + '</h3>';
        modal += '</div>';
        modal += '<div class="modal-body">';
        modal += '<table class="table table-striped">';
        modal += '<thead><tr id="' + analysis + '-modal-th">';
        modal += '<th>&nbsp;</th>';
        modal += '<th>No. 1</th>';
        modal += '</tr></thead>';
        modal += '<tbody>';
        modal += '<tr id="' + analysis + '-compare">';
        modal += '<th class="red">Compare runs</th>';
        modal += '<td><label class="checkbox"><input type="checkbox" id="current-simulation-checkbox" disabled="disabled"><span id="current-simulation-label" class="label">Running</span></label></td>';
        modal += '</tr>';
        for (var i = 0; i < this.parameters.params.length; i++) {
            modal += '<tr id="' + analysis + '-' + this.parameters.params[i].name + '">';
            modal += '<th>' + this.parameters.params[i].name.replace('-', ':') + '</th>';
            modal += '<td>' + this.parameters.params[i].currentValue + '</td>';
            modal += '</tr>';
        }
        modal += '</tbody>';
        modal += '</table>';
        modal += '</div>';
        modal += '<div class="modal-footer">';
        modal += '<button class="btn" data-dismiss="modal" aria-hidden="true">Close</button>';
        modal += '<button id="' + analysis + '-compare-runs" class="btn btn-info" aria-hidden="true" data-dismiss="modal" data-analysis="' + analysis + '">Compare selected runs</button>';
        modal += '</div>';
        modal += '</div>';

        analyses.append(modal);

        // Need a closure to access `compareAction` for the event handler
        (function(context) {
            $('#' + analysis + '-compare-runs').click(function() {
                var yodaFiles = [];
                $('#' + analysis + '-compare input').each(function() {
                    if ($(this).prop('checked')) {
                        yodaFiles.push($(this).attr('id') + '.yoda');
                    }
                });
                context.compareAction($(this).attr('data-analysis'), yodaFiles);
            });
        })(this);
    },
    _updateModal: function() {
        /*
         * Update the modal window "Compare runs" for the selected analysis (new run params).
         */

        var analysis = this.simulation.analysis;
        var modalTH = $('#' + analysis + '-modal-th');
        var runNumber = $('#' + analysis + ' .run-number');
        var modalCompare = $('#' + analysis + '-compare');

        modalCompare.append('<td><label class="checkbox"><input type="checkbox" id="current-simulation-checkbox" disabled="disabled"><span id="current-simulation-label" class="label">Running</span></label></td>');
        modalTH.append('<th>No. ' + runNumber.text() + '</th>');

        for (var i = 0; i < this.parameters.params.length; i++) {
            var modalParamLine = $('#' + analysis + '-' + this.parameters.params[i].name);
            modalParamLine.append('<td>' + this.parameters.params[i].currentValue + '</td>');
        }
    },
    retrieveRequiredBeams: function() {
        /*
         * When the user selects another analysis.
         *
         * Get the required beams for this analysis (if they are different
         * from the current beams, this will result in the params form to
         * be updated accordingly).
         */

        var analysis = this.analysisSelector.val();

        this.simulation.requiredBeams(analysis);
    },
    retrieveAnalysisDetails: function() {
        /*
         * When the user selects another analysis.
         *
         * Get the details (description...) of this analysis to display
         * in the modal dialog "Analysis details".
         */

        var analysis = this.analysisSelector.val();

        this.simulation.analysisDetails(analysis);
    }
};

var Parameters = function(ws) {
    /*
     * The parameters the user can modify through the interface.
     *
     * They are defined here with their default and min/max values.
     *
     * `ws` the web socket object
     */

    this.ws = ws;

    this.changed = false;

    this.params = paramsJSON;
};

Parameters.prototype = {
    createForm: function() {
        /*
         * Create the form elements for the parameters.
         *
         * Note that the divs containing these elements must already
         * exist in the html template (see `templates/home.html`).
         */

        for (var i = 0; i < this.params.length; i++) {
            (function(context, i) {
                var paramValue = $('#' + context.params[i].name + ' .value');
                var containingDiv = $('#' + context.params[i].name);

                switch(context.params[i].type) {
                case 'slider':
                    $('<div id="' + context.params[i].name + '-slider"></div>').appendTo(containingDiv).slider({
                        min: context.params[i].minValue,
                        max: context.params[i].maxValue,
                        step: context.params[i].step,
                        range: 'min',
                        value: context.params[i].currentValue,
                        slide: function(event, ui) {
                            paramValue.text(ui.value);
                            context.params[i].currentValue = ui.value;
                            $('#save-params').prop('disabled', false);
                            context.changed = true;
                        }
                    });
                    break;
                case 'select':
                    var select = '<select id="' + context.params[i].name + '-select">';

                    for (var j = 0; j < context.params[i].values.length; j++) {
                        select += '<option value="' + context.params[i].values[j][0] + '">' + context.params[i].values[j][1] + '</option>';
                    }
                    select += '</select>';

                    $(select).appendTo(containingDiv).change(function() {
                        var newVal = $(this).val();
                        paramValue.text(newVal);
                        context.params[i].currentValue = newVal;
                        $('#save-params').prop('disabled', false);
                        context.changed = true;
                    });
                    break;
                case 'number':
                    var number = '<input type="number" id="' + context.params[i].name + '-number"';

                    if (context.params[i].hasOwnProperty('minValue')) {
                        number += ' min="' + context.params[i].minValue + '"';
                    }
                    if (context.params[i].hasOwnProperty('maxValue')) {
                        number += ' max="' + context.params[i].maxValue + '"';
                    }
                    if (context.params[i].hasOwnProperty('step')) {
                        number += ' step="' + context.params[i].step + '"';
                    }
                    number += '>';

                    $(number).appendTo(containingDiv).change(function() {
                        var newVal = $(this).val();
                        paramValue.text(newVal);
                        context.params[i].currentValue = newVal;
                        $('#save-params').prop('disabled', false);
                        context.changed = true;
                    });
                    break;
                }

                var tooltip = 'Default: ' + context.params[i].defaultValue;

                if (context.params[i].hasOwnProperty('minValue')) {
                    tooltip += ', Min: ' + context.params[i].minValue;
                }
                if (context.params[i].hasOwnProperty('maxValue')) {
                    tooltip += ', Max: ' + context.params[i].maxValue;
                }

                $('#' + context.params[i].name + ' label').tooltip({
                    title: tooltip,
                    container: '#parameters'
                });

                if (context.params[i].hasOwnProperty('description')) {
                    var modal = '<div id="' + context.params[i].name + '-modal" class="modal hide fade" tabindex="-1" role="dialog" aria-labelledby="' + context.params[i].name + '-modal-title" aria-hidden="true">';
                    modal += '<div class="modal-header">';
                    modal += '<button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>';
                    modal += '<h3 id="' + context.params[i].name + '-modal-title">' + context.params[i].name.replace('-', ':') + '</h3>';
                    modal += '</div>';
                    modal += '<div class="modal-body">';
                    modal += context.params[i].description;
                    modal += '</div>';
                    modal += '<div class="modal-footer">';
                    modal += '<button class="btn" data-dismiss="modal" aria-hidden="true">Close</button>';
                    modal += '</div>';
                    modal += '</div>';

                    $('#param-descriptions').append(modal);

                    $('#' + context.params[i].name + ' > .clearfix').click(function() {
                        $('#' + context.params[i].name + '-modal').modal('show');
                    });

                    $('#' + context.params[i].name + ' > .clearfix').hover(function() {
                        $('#' + context.params[i].name + ' .more').show();
                    }, function() {
                        $('#' + context.params[i].name + ' .more').hide();
                    });
                }

                paramValue.text(context.params[i].currentValue);
            })(this, i);
        }
    },
    updateForm: function(changed) {
        /*
         * Update the form elements with the current parameters values.
         */

        for (var i = 0; i < this.params.length; i++) {
            var paramValue = $('#' + this.params[i].name + ' .value');

            switch(this.params[i].type) {
            case 'slider':
                var slider = $('#' + this.params[i].name + '-slider');
                slider.slider('value', this.params[i].currentValue);
                break;
            case 'select':
                var select = $('#' + this.params[i].name + '-select');
                select.val(this.params[i].currentValue);
                break;
            case 'number':
                var number = $('#' + this.params[i].name + '-number');
                number.val(this.params[i].currentValue);
                break;
            }

            paramValue.text(this.params[i].currentValue);
        }

        if (changed) {
            $('#save-params').prop('disabled', false);
            this.changed = true;
        } else {
            $('#save-params').prop('disabled', true);
            this.changed = false;
        }
    },
    save: function() {
        /*
         * Save the parameters to the PYTHIA cmnd file.
         */

        var message = {action: 'save_params', params: this.params};
        this.ws.send(JSON.stringify(message));
    },
    reset: function() {
        /*
         * Reset the parameters to their default values.
         */

        for (var i = 0; i < this.params.length; i++) {
            this.params[i].currentValue = this.params[i].defaultValue;
        }
        this.updateForm(true);
    },
    updateParam: function(paramName, paramValue) {
        /*
         * Set `paramName` value to `paramValue`.
         */

        var changed = false;

        for (var i = 0; i < this.params.length; i++) {
            if (this.params[i].name === paramName && this.params[i].currentValue != paramValue) {
                this.params[i].currentValue = paramValue;
                changed = true;
            }
        }
        if (changed) {
            this.updateForm(true);
        }
        return changed;
    }
};

var Histograms = function(simulation) {
    /*
     * The histograms generated by the `simulation`.
     *
     * They are stored as a Javascript object by analysis and path.
     */

    this.simulation = simulation;

    this.histograms = {};
};

Histograms.prototype = {
    add: function(analysis, path, histogram) {
        if (!this.contains(analysis)) {
            this.histograms[analysis] = {};
        }
        this.histograms[analysis][path] = histogram;
    },
    get: function(analysis, path) {
        if (path && this.contains(analysis, path)) {
            return this.histograms[analysis][path];
        } else if (!path && this.contains(analysis)) {
            return this.histograms[analysis];
        } else {
            return null;
        }
    },
    remove: function(analysis, path) {
        if (!path && this.contains(analysis)) {
            delete this.histograms[analysis];
        } else if (path && this.contains(analysis, path)) {
            delete this.histograms[analysis][path];
        }
    },
    contains: function(analysis, path) {
        if (!path) {
            return this.histograms.hasOwnProperty(analysis);
        } else {
            return this.histograms.hasOwnProperty(analysis) && this.histograms[analysis].hasOwnProperty(path);
        }
    },
    selected: function(analysis, path) {
        /*
         * Select a path or get a selected path.
         *
         * If only the analysis is specified, returns the path of
         * the histogram which is selected for this analysis (if any).
         *
         * With both arguments, select the histogram with path `path`
         * for the analysis `analysis`.
         */

        if (this.contains(analysis)) {
            if (path) {
                this.histograms[analysis].selected = path;
            } else {
                return this.histograms[analysis].selected;
            }
        } else {
            return null;
        }
    },
    histogramChooser: function(active) {
        /*
         * Bind an event handler to each "small" histogram.
         *
         * This allows the user to select which histogram they
         * want to display ("big" histogram).
         */

        $('.histogram-selector .histogram').unbind();

        if (active) {
            (function(context) {
                $('.histogram-selector .histogram').click(function() {
                    var analysis = $(this).parents('.histogram-container').attr('data-analysis');
                    var newPath = $(this).parent().attr('data-path');
                    var newHisto = context.get(analysis, newPath);

                    if (newHisto) {
                        newHisto.handleSelectedHisto();
                    }
                    context.selected(analysis, newPath);
                });
            })(this);
        }
    },
    drawAll: function(analysis, histos) {
        /*
         * Draw all `histos` for `analysis`.
         */

        var paused = false;

        for (var i = 0; i < histos.length; i++) {
            var ref = false;
            var path = histos[i].annotations.Path;
            var headers = histos[i].plotHeaders;
            var type = histos[i].type;

            // Reference histograms path begin with "/REF/"
            if (path.lastIndexOf('/REF/', 0) === 0) {
                ref = true;
                path = path.substring(4);
            }

            var histogram = this.get(analysis, path);

            if (!histogram && !ref) {
                // Pause the simulation on the first histogram to be drawn
                if (!paused) {
                    this.simulation.pause();
                    paused = true;
                }
                histogram = new Histogram(analysis, path, headers, type);

                this.add(analysis, path, histogram);

                // Select the first histogram to be drawn
                if (!this.selected(analysis)) {
                    this.selected(analysis, path);
                }
            }

            if (histogram) {
                if (ref) {
                    histogram.setRefHisto(histos[i]).draw();
                } else {
                    histogram.setSimHisto(histos[i]).draw();
                }
                if (this.selected(analysis) === path) {
                    histogram.handleSelectedHisto();
                }
            }
        }

        // Typeset LaTeX maths when the histograms have all been created, and resume simulation
        // Subsequent (updating) calls to `drawAll` won't trigger this code
        if (paused) {
            (function(simulation) {
                MathJax.Hub.Queue(["Typeset", MathJax.Hub], function() { simulation.resume(); });
            })(this.simulation);
        }
        this.histogramChooser(true);
    },
    reset: function(analysis) {
        /*
         * Remove all simulation data from the histograms of `analysis`.
         */

        var histos = this.get(analysis);

        if (histos) {
            for (var path in histos) {
                if (histos.hasOwnProperty(path) && histos[path] instanceof Histogram) {
                    histos[path].resetSimHisto().draw();
                }
            }
        }
    },
    compare: function(histos) {
        /*
         * Add `histos` to the histograms for comparison.
         */

        for (var i = 0; i < histos.length; i++) {
            var path = histos[i].annotations.Path;
            var analysis = path.split('/')[1];
            var selected = this.selected(analysis);
            var histogram = this.get(analysis, path);

            if (histogram) {
                histogram.addSimHisto(histos[i]).draw();
            }
            if (selected === path) {
                histogram.handleSelectedHisto();
            }
        }
    }
};

$(function() {
    var ws = new WebSocket('ws://localhost:8888/ws');
    var simulation = new Simulation(ws, 'main42.exe', 'main42.cmnd', 'hepmc.fifo');
    var histograms = new Histograms(simulation);

    // DOM elements
    var simulationControlBtn = $('#simulation-control');
    var simulationStopBtn = $('#simulation-stop');
    var analysisLabel = $('#ana-label');
    var analysisSelector = $('#analysis');
    var wsStatus = $('#ws-status');
    var wsError = $('#ws-error');
    var pythiaOutput = $('#pythia-output');
    var rivetOutput = $('#rivet-output');
    var pythiaOutputCL = $('#pythia-output > .current-line');
    var rivetOutputCL = $('#rivet-output > .current-line');
    var pythiaFullOutput = $('#pythia-full-output');
    var rivetFullOutput = $('#rivet-full-output');
    var pythiaModal = $('#pythia-modal');
    var rivetModal = $('#rivet-modal');
    var analysisModal = $('#analysis-modal');
    var analysisDetails = $('#analysis-details');
    var paramsChangedModal = $('#params-changed-modal');
    var histoInterval = $('#histo-interval');
    var histoIntervalValue = $('#histo-interval .value');
    var histoIntervalSlider = $('<div id="histo-interval-slider"></div>').appendTo(histoInterval).slider({
        min: 10,
        max: 1000,
        step: 10,
        range: 'min',
        value: 500,
        slide: function(event, ui) {
            histoIntervalValue.text(ui.value);
        }
    });
    var analysesTable = $('#analyses-table');

    // Parameters and corresponding DOM elements
    var parameters = new Parameters(ws);
    var saveParamsBtn = $('#save-params');
    var reloadParamsBtn = $('#reload-params');
    var resetParamsBtn = $('#reset-params');
    var saveParamsModalBtn = $('#save-params-modal');

    var simulationControl = new SimulationControl(simulation, analysisSelector, histoIntervalSlider, pythiaFullOutput, rivetFullOutput, analysesTable, histograms, parameters);

    var typesetMathBtn = $('#typeset-math');

    parameters.createForm();

    analysisLabel.click(function() {
        analysisModal.modal('show');
    });

    analysisLabel.hover(function() {
        analysisLabel.children('.more').show();
    }, function() {
        analysisLabel.children('.more').hide();
    });

    analysisSelector.change(function() {
        simulationControl.retrieveAnalysisDetails();
    });

    simulationControlBtn.click(function() {
        simulationControl.runAction();
    });

    pythiaOutput.click(function() {
        pythiaModal.modal('show');
    });

    rivetOutput.click(function() {
        rivetModal.modal('show');
    });

    saveParamsBtn.click(function() {
        parameters.save();
    });

    reloadParamsBtn.tooltip({
        title: 'Reload stored values',
        container: '#parameters'
    });

    reloadParamsBtn.click(function() {
        simulation.loadParams(parameters.params);
    });

    resetParamsBtn.tooltip({
        title: 'Reset parameters to their default values (without saving)',
        container: '#parameters'
    });

    resetParamsBtn.click(function() {
        parameters.reset();
    });

    saveParamsModalBtn.click(function() {
        parameters.save();
        paramsChangedModal.modal('hide');
        paramsChangedModal.on('hidden', function() {
            simulationControl.runAction();
            paramsChangedModal.unbind('hidden');
        });
    });

    typesetMathBtn.click(function() {
        MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
    });

    function endAction() {
        simulationControlBtn.unbind();
        simulationControlBtn.text('Run');
        simulationControlBtn.prop('disabled', false);
        simulationControlBtn.click(function() {
            simulationControl.runAction();
        });
        simulationStopBtn.unbind();
        simulationStopBtn.prop('disabled', true);
        pythiaOutputCL.text('Not running');
        rivetOutputCL.text('Not running');
        $('#current-simulation-checkbox').removeAttr('id');
        MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
    }

    function writeAnalysisDetails(ana) {
        analysisDetails.empty();
        analysisDetails.append('<h4>Name</h4>');
        $('<p></p>').text(ana.name).appendTo(analysisDetails);
        analysisDetails.append('<h4>Summary</h4>');
        $('<p></p>').text(ana.summary).appendTo(analysisDetails);
        analysisDetails.append('<h4>Experiment (year)</h4>');
        $('<p></p>').text(ana.experiment + ' (' + ana.year + ')').appendTo(analysisDetails);
        analysisDetails.append('<h4>Collider</h4>');
        $('<p></p>').text(ana.collider).appendTo(analysisDetails);
        analysisDetails.append('<h4>Authors</h4>');
        var authors = $('<ul></ul>');
        $.each(ana.authors, function(i, a) {
            $('<li></li>').text(a).appendTo(authors);
        });
        authors.appendTo(analysisDetails);
        analysisDetails.append('<h4>Run Info</h4>');
        $('<p></p>').text(ana.runInfo).appendTo(analysisDetails);
        analysisDetails.append('<h4>Description</h4>');
        $('<p></p>').text(ana.description).appendTo(analysisDetails);
        MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
    }

    ws.onopen = function() {
        simulation.init();
        simulation.loadParams(parameters.params);
        simulationControl.retrieveAnalysisDetails();
        wsStatus.text('Connected to server');
    };

    ws.onmessage = function(evt) {
        var received_msg = JSON.parse(evt.data);
        switch(received_msg.type) {
        case 'error':
            wsError.text(received_msg.content);
            wsError.stop().fadeIn().delay(5000).fadeOut();
            break;
        case 'pythia':
            pythiaOutputCL.text(received_msg.content);
            pythiaFullOutput.append(document.createTextNode(received_msg.content));
            break;
        case 'rivet':
            rivetOutputCL.text(received_msg.content);
            break;
        case 'rivet_out':
            rivetFullOutput.append(document.createTextNode(received_msg.content));
            break;
        case 'rivet_err':
            $('<span style="color: red;"></span>').text(received_msg.content).appendTo(rivetFullOutput);
            break;
        case 'params':
            parameters.params = received_msg.content;
            parameters.updateForm();
            break;
        case 'param':
            if (parameters.updateParam(received_msg.content[0], received_msg.content[1])) {
                $('#beamParameters').collapse('show');
            }
            break;
        case 'yoda':
            $('#current-simulation-checkbox').attr('id', received_msg.content).prop('disabled', false);
            break;
        case 'histos':
            histograms.drawAll(simulation.analysis, received_msg.content);
            break;
        case 'compare_histos':
            histograms.compare(received_msg.content);
            break;
        case 'analysis_details':
            writeAnalysisDetails(received_msg.content);
            break;
        case 'signal':
            switch(received_msg.content) {
            // SIM_END (simulation finished)
            case 0:
                endAction();
                simulationControl.updateAnalysesTable('success', 'Success');
                $('#current-simulation-label').removeClass().addClass('label label-success').text('Success').removeAttr('id');
                break;
            // PYT_RUN (PYTHIA started)
            case 1:
                simulationControlBtn.unbind();
                simulationControlBtn.text('Pause');
                simulationControlBtn.prop('disabled', true);
                break;
            // PYT_STP (PYTHIA stopped)
            case 2:
                break;
            // RIV_RUN (Rivet started)
            case 3:
                simulationControlBtn.unbind();
                simulationControlBtn.text('Pause');
                simulationControlBtn.prop('disabled', false);
                simulationControlBtn.click(function() {
                    simulationControl.pauseAction();
                });
                simulationStopBtn.unbind();
                simulationStopBtn.prop('disabled', false);
                simulationStopBtn.click(function() {
                    simulationControl.stopAction();
                });
                simulationControl.updateAnalysesTable('warning', 'Running');
                $('#current-simulation-label').removeClass().addClass('label').text('Running');
                break;
            // RIV_STP (Rivet stopped)
            case 4:
                simulationControlBtn.unbind();
                simulationControlBtn.text('Resume');
                simulationControlBtn.prop('disabled', false);
                simulationControlBtn.click(function() {
                    simulationControl.resumeAction();
                });
                rivetOutputCL.text('Paused');
                simulationControl.updateAnalysesTable('info', 'Paused');
                $('#current-simulation-label').removeClass().addClass('label label-info').text('Paused');
                break;
            // SIM_ERR (error during simulation)
            case 5:
                endAction();
                simulationControl.updateAnalysesTable('error', 'Error');
                $('#current-simulation-label').removeClass().addClass('label label-important').text('Error').removeAttr('id');
                break;
            // PARAMS_SAVED
            case 6:
                parameters.changed = false;
                saveParamsBtn.prop('disabled', true);
                saveParamsBtn.addClass('btn-success');
                setTimeout(function() { saveParamsBtn.removeClass('btn-success'); }, 1000);
                break;
            // PARAMS_ERROR
            case 7:
                saveParamsBtn.addClass('btn-danger');
                setTimeout(function() { saveParamsBtn.removeClass('btn-danger'); }, 1000);
                break;
            // SIM_STP (simulation stopped by user)
            case 8:
                endAction();
                simulationControl.updateAnalysesTable('success', 'Stopped (unfinished)');
                $('#current-simulation-label').removeClass().addClass('label label-warning').text('Partial').removeAttr('id');
                break;
            }
            break;
        }
    };

    ws.onclose = function() {
        wsStatus.removeClass('label-info').addClass('label-warning');
        wsStatus.text('Connection to the server closed');
    };

    $('[data-clampedwidth]').each(function () {
        var elem = $(this);
        var parentPanel = elem.data('clampedwidth');
        var resizeFn = function () {
            var sideBarNavWidth = $(parentPanel).width() - parseInt(elem.css('paddingLeft')) - parseInt(elem.css('paddingRight')) - parseInt(elem.css('marginLeft')) - parseInt(elem.css('marginRight')) - parseInt(elem.css('borderLeftWidth')) - parseInt(elem.css('borderRightWidth'));
            elem.css('width', sideBarNavWidth);
        };

        resizeFn();
        $(window).resize(resizeFn);
    });
});

