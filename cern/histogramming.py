# -*- coding: utf-8 -*-

"""
Histogram handling classes.
"""

import rivet
import yoda


class UnsupportedHistogramError(Exception):
    """
    Exception raised for unsupported yoda histogram types.
    """

    def __init__(self, type):
        self.type = type

    def __str__(self):
        return repr(self.type)


class Histogram(object):
    """
    Class handling the conversion of yoda histogram objects
    to Python dicts.
    """

    def __init__(self, histogram, normalize=False):
        # The yoda histogram object
        self.histogram = histogram
        self.normalize = normalize

        # Rivet plot parser retrieves histogram options from
        # Rivet's .plot files (title, labels, log axis...)
        self.plotparser = rivet.PlotParser()

    def toDict(self):
        """
        Convert yoda histogram object to Python dict.

        The correct function is called according to
        the type of the yoda histogram.
        """

        if isinstance(self.histogram, yoda.core.Histo1D):
            return self._histo1DtoDict()
        if isinstance(self.histogram, yoda.core.Scatter2D):
            return self._scatter2DtoDict()

        raise UnsupportedHistogramError(type(self.histogram))

    def _histo1DtoDict(self):
        """
        Histo1D to dict conversion.
        """

        if self.normalize:
            # Try to normalize the histogram for a good comparison
            # with the reference histogram
            try:
                self.histogram.normalize()
            except:
                pass

        bins = []
        for bin in self.histogram.bins():
            mean = 0
            rms = 0
            stdDev = 0
            stdErr = 0
            # These values may not be well defined
            try:
                mean = bin.mean
                rms = bin.rms
                stdDev = bin.stdDev
                stdErr = bin.stdErr
            except:
                pass

            bins.append({
                '_type': 'Histo1D',
                '_yRangeLow': bin.height - bin.heightErr,
                '_yRangeHigh': bin.height + bin.heightErr,
                'area': bin.area,
                'areaErr': bin.areaErr,
                'edgeLow': bin.edges.low,
                'edgeHigh': bin.edges.high,
                'effNumEntries': bin.effNumEntries,
                'focus': bin.focus,
                'height': bin.height,
                'heightErr': bin.heightErr,
                'mean': mean,
                'midpoint': bin.midpoint,
                'numEntries': bin.numEntries,
                'relErr': bin.relErr,
                'rms': rms,
                'stdDev': stdDev,
                'stdErr': stdErr,
                'sumW': bin.sumW,
                'sumW2': bin.sumW2,
                'sumWX': bin.sumWX,
                'sumWX2': bin.sumWX2,
                'width': bin.width
                })

        mean = 0
        rms = 0
        stdDev = 0
        stdErr = 0
        variance = 0
        # These values may not be well defined
        try:
            mean = self.histogram.totalDbn.mean
            rms = self.histogram.totalDbn.rms
            stdDev = self.histogram.totalDbn.stdDev
            stdErr = self.histogram.totalDbn.stdErr
            variance = self.histogram.totalDbn.variance
        except:
            pass

        totalDbn = {
            'effNumEntries': self.histogram.totalDbn.effNumEntries,
            'mean': mean,
            'numEntries': self.histogram.totalDbn.numEntries,
            'rms': rms,
            'stdDev': stdDev,
            'stdErr': stdErr,
            'sumW': self.histogram.totalDbn.sumW,
            'sumW2': self.histogram.totalDbn.sumW2,
            'sumWX': self.histogram.totalDbn.sumWX,
            'sumWX2': self.histogram.totalDbn.sumWX2,
            'variance': variance
            }

        return {
            'type': 'Histo1D',
            'plotHeaders': self.plotparser.getHeaders(self.histogram.annotations()['Path']),
            'annotations': self.histogram.annotations(),
            'bins': bins,
            'edgeLow': self.histogram.edges.low,
            'edgeHigh': self.histogram.edges.high,
            'totalDbn': totalDbn
            }

    def _scatter2DtoDict(self):
        """
        Scatter2D to dict conversion.
        """

        points = []
        for point in self.histogram.points():
            points.append({
                '_type': 'Scatter2D',
                'x': point.x,
                'y': point.y,
                'xErrMinus': point.xErrs.minus,
                'xErrPlus': point.xErrs.plus,
                'yErrMinus': point.yErrs.minus,
                'yErrPlus': point.yErrs.plus,
                'xRangeLow': point.xRange.low,
                'xRangeHigh': point.xRange.high,
                'yRangeLow': point.yRange.low,
                'yRangeHigh': point.yRange.high
                })

        return {
            'type': 'Scatter2D',
            'plotHeaders': self.plotparser.getHeaders(self.histogram.annotations()['Path']),
            'annotations': self.histogram.annotations(),
            'points': points,
            }

