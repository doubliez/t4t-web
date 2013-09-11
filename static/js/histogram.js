$(function() {
    var svg = d3.select("#histograms").append("svg")
        .attr("id", "markers");

    for (var i = 0; i < 10; i++) {
        svg.append("marker")
            .attr("id", "bin-edge-" + i)
            .attr("viewBox", "0 0 6 6")
            .attr("refY", "3")
            .attr("markerWidth", "6")
            .attr("markerHeight", "6")
            .attr("orient", "auto")
          .append("line")
            .attr("class", "bin-edge bin-edge-" + i)
            .attr("x1", "0")
            .attr("y1", "0")
            .attr("x2", "0")
            .attr("y2", "6");

        svg.append("marker")
            .attr("id", "bin-mid-" + i)
            .attr("viewBox", "0 0 5 5")
            .attr("refX", "3")
            .attr("refY", "3")
            .attr("markerWidth", "5")
            .attr("markerHeight", "5")
          .append("circle")
            .attr("class", "bin-mid bin-mid-" + i)
            .attr("cx", "3")
            .attr("cy", "3")
            .attr("r", "2");
    }

    svg.append("marker")
        .attr("id", "ref-bin-edge")
        .attr("viewBox", "0 0 6 6")
        .attr("refY", "3")
        .attr("markerWidth", "6")
        .attr("markerHeight", "6")
        .attr("orient", "auto")
      .append("line")
        .attr("class", "ref-bin-edge")
        .attr("x1", "0")
        .attr("y1", "0")
        .attr("x2", "0")
        .attr("y2", "6");

    svg.append("marker")
        .attr("id", "ref-bin-mid")
        .attr("viewBox", "0 0 4 4")
        .attr("refX", "2")
        .attr("refY", "2")
        .attr("markerWidth", "5")
        .attr("markerHeight", "5")
      .append("rect")
        .attr("class", "ref-bin-mid")
        .attr("x", "0")
        .attr("y", "0")
        .attr("width", "4")
        .attr("height", "4");
});

// Corresponding coordinates for the different types of histograms
var cc = {
    Histo1D: {
        el: 'bins',
        x: 'midpoint',
        y: 'height',
        x1: 'edgeLow',
        x2: 'edgeHigh',
        y1: '_yRangeLow',
        y2: '_yRangeHigh',
        yErrMinus: 'heightErr',
        yErrPlus: 'heightErr'
        },
    Scatter2D: {
        el: 'points',
        x: 'x',
        y: 'y',
        x1: 'xRangeLow',
        x2: 'xRangeHigh',
        y1: 'yRangeLow',
        y2: 'yRangeHigh',
        yErrMinus: 'yErrMinus',
        yErrPlus: 'yErrPlus'
        }
    };

var Histogram = function(analysis, path, headers, type) {
    this.analysis = analysis;
    this.path = path;
    this.headers = headers;
    this.type = type;

    this.viewBoxWidth = 600;
    this.viewBoxHeight = 400;
    this.margin = {top: 60, right: 80, bottom: 50, left: 70};
    this.width = this.viewBoxWidth - this.margin.left - this.margin.right;
    this.height = this.viewBoxHeight - this.margin.top - this.margin.bottom;
    this.firstDraw = true;
    this.simHistos = [];
    this.refHisto = null;

    this.init();
};

Histogram.prototype = {
    init: function() {
        this.svg = d3.select("#histograms-" + this.analysis + " .histogram-selector").append("div")
            .attr("data-path", this.path)
            .attr("data-type", this.type)
          .append("svg")
            .attr("class", "histogram")
            .attr("width", this.width + this.margin.left + this.margin.right)
            .attr("height", this.height + this.margin.top + this.margin.bottom)
            .attr("viewBox", "0 0 " + this.viewBoxWidth + " " + this.viewBoxHeight);

        this._appendHeaders();

        this.graphContainer = this.svg.append("g")
            .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        this._appendFocus();

        this.svgXAxis = this.graphContainer.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + this.height + ")");

        this.svgYAxis = this.graphContainer.append("g")
            .attr("class", "y axis");
    },
    addSimHisto: function(histo) {
        this.simHistos.push(histo);
        return this;
    },
    setSimHisto: function(histo) {
        this.simHistos = [histo];
        return this;
    },
    resetSimHisto: function() {
        this.simHistos = [];
        return this;
    },
    setRefHisto: function(histo) {
        this.refHisto = histo;
        return this;
    },
    draw: function() {
        var x = d3.scale.linear()
            .range([0, this.width])
            .domain(this._findXDomain());

        var y = this._yMode()
            .range([this.height, 0])
            .domain(this._findYDomain());

        var xAxis = d3.svg.axis()
            .scale(x)
            .orient("bottom");

        var yAxis = d3.svg.axis()
            .scale(y)
            .orient("left");

        var line = d3.svg.line()
            .x(function(d) { return x(d[cc[d._type].x]); })
            .y(function(d) { return y(d[cc[d._type].y]); });

        var area = d3.svg.area()
            .x(function(d) { return x(d[cc[d._type].x]); })
            .y0(function(d) { return y(d[cc[d._type].y1]); })
            .y1(function(d) { return y(d[cc[d._type].y2]); });

        var binParams = {
            y: function(d) { return y(d[cc[d._type].y]); },
            x1: function(d) { return x(d[cc[d._type].x1]); },
            x2: function(d) { return x(d[cc[d._type].x2]); }
            };

        this.svgXAxis.call(xAxis);
        this.svgYAxis.call(yAxis);

        if (this.simHistos.length > 0) {
            var histosData = this.simHistos.map(function(h) { return h[cc[h.type].el]; });
            this._draw(histosData, line, area, binParams);
        } else {
            this._draw([], line, area, binParams);
        }

        if (this.refHisto) {
            var refHistoData = this.refHisto[cc[this.refHisto.type].el];
            this._drawRef(refHistoData, line, area, binParams);
            this._chi2();
        }

        this.x = x;
        this.y = y;
    },
    _draw: function(histosData, line, area, binParams) {
        var color = d3.scale.category10().domain(d3.range(10));

        var linePath = this.graphContainer.selectAll(".line").data(histosData);
        var areaPath = this.graphContainer.selectAll(".area").data(histosData);

        var binsContainer = this.graphContainer.selectAll(".bins").data(histosData);

        var bins;

        linePath.enter().append("path")
            .attr("class", "line")
            .attr("d", line)
            .attr("stroke", function(d, i) { return color(i); })
            .attr("marker-start", function(d, i) { return "url(#bin-mid-" + i + ")"; })
            .attr("marker-mid", function(d, i) { return "url(#bin-mid-" + i + ")"; })
            .attr("marker-end", function(d, i) { return "url(#bin-mid-" + i + ")"; });

        linePath.attr("d", line);

        linePath.exit().remove();

        areaPath.enter().append("path")
            .attr("class", "area")
            .attr("d", area)
            .attr("fill", function(d, i) { return color(i); });

        areaPath.attr("d", area);

        areaPath.exit().remove();

        binsContainer.enter().append("g")
            .attr("class", "bins");

        binsContainer.exit().remove();

        binsContainer.each(function(d, i) {
            bins = d3.select(this).selectAll(".bin").data(d);

            bins.enter().append("line")
                .attr("class", "bin bin-" + i)
                .attr("x1", binParams.x1)
                .attr("y1", binParams.y)
                .attr("x2", binParams.x2)
                .attr("y2", binParams.y)
                .attr("marker-start", "url(#bin-edge-" + i + ")")
                .attr("marker-end", "url(#bin-edge-" + i + ")");

            bins.attr("x1", binParams.x1)
                .attr("y1", binParams.y)
                .attr("x2", binParams.x2)
                .attr("y2", binParams.y);

            bins.exit().remove();
        });
    },
    _drawRef: function(data, line, area, binParams) {
        var linePath = this.graphContainer.select(".ref-line");
        var areaPath = this.graphContainer.select(".ref-area");
        var bins = this.graphContainer.selectAll(".ref-bin").data(data);

        if (linePath.empty()) {
            this.graphContainer.append("path")
                .datum(data)
                .attr("class", "ref-line")
                .attr("d", line)
                .attr("marker-start", "url(#ref-bin-mid)")
                .attr("marker-mid", "url(#ref-bin-mid)")
                .attr("marker-end", "url(#ref-bin-mid)");
        } else {
            linePath.datum(data)
                .attr("d", line);
        }

        if (areaPath.empty()) {
            this.graphContainer.append("path")
                .datum(data)
                .attr("class", "ref-area")
                .attr("d", area);
        } else {
            areaPath.datum(data)
                .attr("d", area);
        }

        bins.enter().append("line")
            .attr("class", "ref-bin")
            .attr("x1", binParams.x1)
            .attr("y1", binParams.y)
            .attr("x2", binParams.x2)
            .attr("y2", binParams.y)
            .attr("marker-start", "url(#ref-bin-edge)")
            .attr("marker-end", "url(#ref-bin-edge)");

        bins.attr("x1", binParams.x1)
            .attr("y1", binParams.y)
            .attr("x2", binParams.x2)
            .attr("y2", binParams.y);

        bins.exit().remove();
    },
    _appendFocus: function() {
        for (var i = 0; i < 10; i++) {
            var focus = this.svg.append("g")
                .attr("class", "focus focus-" + i)
                .style("display", "none");

            focus.append("circle")
                .attr("cx", "0")
                .attr("cy", "0")
                .attr("r", "3");

            focus.append("text")
                .attr("text-anchor", "end")
                .attr("x", this.viewBoxWidth - 10)
                .attr("y", 40 + 20 * i);
        }

        var refFocus = this.svg.append("g")
            .attr("class", "ref-focus")
            .style("display", "none");

        refFocus.append("rect")
            .attr("x", "-3")
            .attr("y", "-3")
            .attr("width", "6")
            .attr("height", "6");

        refFocus.append("text")
            .attr("text-anchor", "end")
            .attr("x", this.viewBoxWidth - 10)
            .attr("y", 20);
    },
    _appendHeaders: function() {
        if (this.headers.hasOwnProperty('Title')) {
            this.svg.append("foreignObject")
                .attr("class", "histo-title")
                .attr("x", this.margin.left)
                .attr("y", 20)
                .attr("width", this.width)
                .attr("height", this.margin.top)
                .text(this.headers.Title);
        } else {
            this.svg.append("text")
                .attr("class", "histo-title")
                .attr("x", this.margin.left)
                .attr("y", this.margin.top / 2)
                .text(this.path);
        }

        if (this.headers.hasOwnProperty('XLabel')) {
            this.svg.append("foreignObject")
                .attr("class", "xLabel")
                .attr("x", this.width + this.margin.left + 20)
                .attr("y", this.height + this.margin.top - 10)
                .attr("width", 60)
                .attr("height", 50)
                .text(this.headers.XLabel);
        }
        if (this.headers.hasOwnProperty('YLabel')) {
            this.svg.append("foreignObject")
                .attr("class", "yLabel")
                .attr("transform", "rotate(-90)")
                .attr("x", - this.margin.top - this.height / 2)
                .attr("y", 8)
                .attr("width", 200)
                .attr("height", 50)
                .text(this.headers.YLabel);
        }
    },
    _yMode: function() {
        this.logScale = false;
        var headers = this.headers;
        if ((!headers.hasOwnProperty('LogY') && !headers.hasOwnProperty('FullRange'))
            || headers.LogY == 1 || headers.FullRange == 1) {
            this.logScale = true;
            return d3.scale.log().clamp(true);
        } else {
            return d3.scale.linear().clamp(true);
        }
    },
    _findDomain: function(axis) {
        var min = Infinity;
        var max = -Infinity;
        var newMin;
        var newMax;
        var histo;
        var el;
        if (this.simHistos.length > 0) {
            for (var i = 0; i < this.simHistos.length; i++) {
                histo = this.simHistos[i];
                el = histo[cc[histo.type].el];
                if (axis === 'y' && this.logScale) {
                    el = el.filter(function(d) { return d[cc[d._type][axis]] > 0; });
                }
                if (axis === 'x') {
                    newMin = Math.min(min, d3.min(el, function(d) { return d[cc[d._type][axis+'1']]; }));
                } else {
                    newMin = Math.min(min, d3.min(el, function(d) { return d[cc[d._type][axis]]; }));
                }
                newMax = Math.max(max, d3.max(el, function(d) { return d[cc[d._type][axis+'2']]; }));
                if (!isNaN(newMin)) {
                    min = newMin;
                }
                if (!isNaN(newMax)) {
                    max = newMax;
                }
            }
        }
        if (this.refHisto) {
            histo = this.refHisto;
            el = histo[cc[histo.type].el];
            if (axis === 'y' && this.logScale) {
                el = el.filter(function(d) { return d[cc[d._type][axis]] > 0; });
            }
            if (axis === 'x') {
                newMin = Math.min(min, d3.min(el, function(d) { return d[cc[d._type][axis+'1']]; }));
            } else {
                newMin = Math.min(min, d3.min(el, function(d) { return d[cc[d._type][axis]]; }));
            }
            newMax = Math.max(max, d3.max(el, function(d) { return d[cc[d._type][axis+'2']]; }));
            if (!isNaN(newMin)) {
                min = newMin;
            }
            if (!isNaN(newMax)) {
                max = newMax;
            }
        }
        return [min, max];
    },
    _findYDomain: function() {
        return this._findDomain('y');
    },
    _findXDomain: function() {
        return this._findDomain('x');
    },
    _chi2: function() {
        for (var i = this.simHistos.length; i < 10; i++) {
            var c = d3.select('#histograms-' + this.analysis + ' .histogram-selector [data-path="' + this.path + '"] .histogram .chi2-' + i);
            if (!c.empty()) {
                c.remove();
            }
        }
        if (this.simHistos.length > 0 && this.refHisto) {
            var refEl = this.refHisto[cc[this.refHisto.type].el];
            var uncertainty = 0.05;
            for (var i = 0; i < this.simHistos.length; i++) {
                var simEl = this.simHistos[i][cc[this.simHistos[i].type].el];
                if (simEl.length === refEl.length) {
                    var chi2 = 0;
                    for (var j = 0; j < simEl.length; j++) {
                        var simulation = simEl[j][cc[simEl[j]._type].y];
                        var reference = refEl[j][cc[refEl[j]._type].y];
                        var sigma_simulation = (simulation > reference) ? simEl[j][cc[simEl[j]._type].yErrMinus] : simEl[j][cc[simEl[j]._type].yErrPlus];
                        var sigma_reference = (simulation > reference) ? refEl[j][cc[refEl[j]._type].yErrPlus] : refEl[j][cc[refEl[j]._type].yErrMinus];
                        var num = (simulation - reference) * (simulation - reference);
                        var den = sigma_reference * sigma_reference + sigma_simulation * sigma_simulation + (uncertainty*simulation) * (uncertainty*simulation);
                        if (den !== 0) {
                            chi2 += num / den;
                        }
                    }
                    var c = d3.select('#histograms-' + this.analysis + ' .histogram-selector [data-path="' + this.path + '"] .histogram .chi2-' + i);
                    if (c.empty()) {
                        d3.select('#histograms-' + this.analysis + ' .histogram-selector [data-path="' + this.path + '"] .histogram').append("text")
                            .attr("class", "chi2 chi2-" + i)
                            .attr("x", 10 + 70*i)
                            .attr("y", this.viewBoxHeight - 10)
                            .text("X² = " + (chi2 / simEl.length).toPrecision(3));
                    } else {
                        c.text("X² = " + (chi2 / simEl.length).toPrecision(3));
                    }
                }
            }
        }
    },
    handleSelectedHisto: function() {
        var marginLeft = this.margin.left;
        var marginTop = this.margin.top;
        var bisect = d3.bisector(function(d) { return d[cc[d._type].x]; }).left;
        var x = this.x;
        var y = this.y;
        var X = function(d) { return d[cc[d._type].x]; };
        var Y = function(d) { return d[cc[d._type].y]; };
        var refEl = null;
        var currentHisto = $('#histograms-' + this.analysis + ' .first-histogram .histogram');
        var newHisto = $('#histograms-' + this.analysis + ' .histogram-selector [data-path="' + this.path + '"] .histogram');
        currentHisto.parent().attr('data-path', this.path);
        currentHisto.replaceWith(newHisto.clone());
        var focus = [];
        var simEl = [];
        for (var i = 0; i < this.simHistos.length; i++) {
            focus.push(d3.select('#histograms-' + this.analysis + ' .first-histogram .focus-'+i));
            simEl.push(this.simHistos[i][cc[this.simHistos[i].type].el]);
        }
        var refFocus = d3.select('#histograms-' + this.analysis + ' .first-histogram .ref-focus');
        if (this.refHisto) {
            refEl = this.refHisto[cc[this.refHisto.type].el];
        }
        d3.select('#histograms-' + this.analysis + ' .first-histogram .histogram')
            .on('mouseover', function() {
                for (var i = 0; i < focus.length; i++) {
                    focus[i].style("display", null);
                }
                if (refEl) {
                    refFocus.style("display", null);
                }
            })
            .on('mouseout', function() {
                for (var i = 0; i < focus.length; i++) {
                    focus[i].style("display", "none");
                }
                if (refEl) {
                    refFocus.style("display", "none");
                }
            })
            .on('mousemove', function() {
                var mx = d3.mouse(this)[0] - marginLeft;
                var i;
                for (var k = 0; k < simEl.length; k++) {
                    i = bisect(simEl[k], x.invert(mx));
                    if (simEl[k][i]) {
                        focus[k].select('circle')
                            .attr('transform', 'translate(' + (marginLeft + x(X(simEl[k][i]))) + ',' + (marginTop + y(Y(simEl[k][i]))) + ')');
                        focus[k].select('text')
                            .text(X(simEl[k][i]).toPrecision(3)+', ' + Y(simEl[k][i]).toPrecision(3));
                    }
                }
                if (refEl) {
                    i = bisect(refEl, x.invert(mx));
                    if (refEl[i]) {
                        refFocus.select('rect')
                            .attr('transform', 'translate(' + (marginLeft + x(X(refEl[i]))) + ',' + (marginTop + y(Y(refEl[i]))) + ')');
                        refFocus.select('text')
                            .text(X(refEl[i]).toPrecision(3)+', ' + Y(refEl[i]).toPrecision(3));
                    }
                }
            });
    }
};
