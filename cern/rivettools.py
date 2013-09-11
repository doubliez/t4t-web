# -*- coding: utf-8 -*-

"""
Some useful functions for Rivet.
"""

from histogramming import Histogram, UnsupportedHistogramError

import rivet
import ConfigParser
import os
import sys

# Import configuration (paths to PYTHIA and Rivet...)
# See `config.ini` file
config = ConfigParser.RawConfigParser()
config.read(os.path.join(sys.path[0], 'config.ini'))


def get_all_analyses():
    rivet.addAnalysisLibPath(config.get('paths', 'analysis_lib'))
    return rivet.AnalysisLoader.analysisNames()


def get_lhc_analyses():
    rivet.addAnalysisLibPath(config.get('paths', 'analysis_lib'))
    analyses = rivet.AnalysisLoader.analysisNames()
    return [a for a in analyses if rivet.AnalysisLoader.getAnalysis(a).collider().startswith('LHC')]


def convert_histos(histos, normalize=False):
    """
    Convert yoda histogram objects to Python dicts.
    """

    histosList = []
    for histo in histos:
        try:
            histoDict = Histogram(histo, normalize).toDict()
            histosList.append(histoDict)
        except UnsupportedHistogramError as e:
            print "Unsupported histogram {} ({})".format(histo.annotations()['Path'], e)

    return histosList

