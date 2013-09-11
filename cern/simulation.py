# -*- coding: utf-8 -*-

"""
The core classes controlling PYTHIA and Rivet.
"""

from rivettools import convert_histos
from tools import FIFOFile, PythiaDB, SIM_END, PYT_RUN, RIV_RUN, RIV_STP, SIM_ERR, PARAMS_SAVED, PARAMS_ERROR, SIM_STP

import os
import sys
import datetime
import subprocess
import multiprocessing
import threading
import signal
import time
import fileinput
import rivet
import yoda
import Queue
import ConfigParser

# Import configuration (paths to PYTHIA and Rivet...)
# See `config.ini` file
config = ConfigParser.RawConfigParser()
config.read(os.path.join(sys.path[0], 'config.ini'))


class StdRedirect(object):
    """
    Context manager to redirect standard outputs of Rivet.

    We need to do this at a system level using os.dup2 because the code
    whose output we want to redirect is the C++ code of Rivet, therefore
    a simple redirect of sys.stdout wouldn't work for this.
    """

    def __init__(self):
        self.old_out = os.dup(1)
        self.old_err = os.dup(2)

    def __enter__(self):
        sys.stdout.flush()
        sys.stderr.flush()
        rivet_out = os.open(os.path.join(sys.path[0], 'rivet_out.log'), os.O_TRUNC | os.O_WRONLY)
        rivet_err = os.open(os.path.join(sys.path[0], 'rivet_err.log'), os.O_TRUNC | os.O_WRONLY)
        os.dup2(rivet_out, 1)
        os.dup2(rivet_err, 2)
        os.close(rivet_out)
        os.close(rivet_err)

    def __exit__(self, type, value, traceback):
        os.dup2(self.old_out, 1)
        os.dup2(self.old_err, 2)
        os.close(self.old_out)
        os.close(self.old_err)


class Pythia(threading.Thread):
    """
    The thread running PYTHIA.
    """

    def __init__(self, generator, params, fifofile, _ws):
        """
        `generator` the PYTHIA program to run (e.g. `main42.exe`)
        `params` the PYTHIA cmnd file (e.g. `main42.cmnd`)
        `fifofile` the path to the FIFO file
        `_ws` the queue used to communicate with the web socket
        """

        threading.Thread.__init__(self)
        self.generator = generator
        self.params = params
        self.fifofile = fifofile
        self._ws = _ws

    def run(self):
        """
        Run PYTHIA in a subprocess and pipe the stdout
        to the web socket (one line at a time).
        """

        # Change to the PYTHIA directory before running the generator
        os.chdir(config.get('paths', 'pythia'))
        self.p = subprocess.Popen([os.path.join(".", self.generator), self.params, self.fifofile], stdout=subprocess.PIPE)

        # Send each line of the stdout through the web socket
        for line in iter(self.p.stdout.readline, ''):
            self._ws.put(['pythia', line])

        self.p = None

    def terminate(self):
        """
        Used to kill the subprocess.
        """

        if self.p:
            self.p.send_signal(signal.SIGKILL)


class Rivet(multiprocessing.Process):
    """
    The Rivet process.
    """

    def __init__(self, analysis, fifofile, histointerval, _q, _ws, _y):
        """
        `analysis` the name of the analysis to run
        `fifofile` the path of the FIFO file
        `histointerval` the update frequency (no. of events)
        `_q` the queue used to communicate with the process
        `_ws` the queue used to communicate with the web socket
        `_y` the queue used to send back the yoda filename to `Simulation`
        """

        multiprocessing.Process.__init__(self)
        self.analysis = analysis
        self.fifofile = fifofile
        self.histointerval = histointerval
        self._q = _q
        self._ws = _ws
        self._y = _y

    def run(self):
        with StdRedirect():
            # Change to the `output` directory, where the yoda
            # histogram files will be stored.
            os.chdir(config.get('paths', 'rivet_output'))

            rivet.util.check_python_version()
            rivet.util.set_process_name('rivet')

            # Add an analysis lib path for extra analyses
            # (path specified in `config.ini`)
            rivet.addAnalysisLibPath(config.get('paths', 'analysis_lib'))

            ah = rivet.AnalysisHandler()
            ah.setIgnoreBeams(False)
            ah.addAnalysis(self.analysis)

            run = rivet.Run(ah)

            # Retrieve reference histograms if they exist
            ref_histos = None
            ref_histos_sent = False

            try:
                ref_file = os.path.join(config.get('paths', 'refdata'), "{}.yoda".format(self.analysis))
                ref_histos = convert_histos(yoda.readYODA(ref_file))
            except IOError:
                print "No refdata for {}".format(self.analysis)

            # Initialize
            if run.init(self.fifofile):
                evtnum = 0

                # Event loop
                while True:
                    # Pause/resume loop
                    try:
                        msg = self._q.get(False)
                        if msg == 'pause':
                            self._ws.put(['signal', RIV_STP])
                            while True:
                                msg = self._q.get(True)
                                if msg == 'resume':
                                    self._ws.put(['signal', RIV_RUN])
                                    break
                        elif msg == 'stop':
                            break
                    except Queue.Empty:
                        pass

                    # Read and process current event
                    if not run.readEvent() or not run.processEvent():
                        break
                    evtnum += 1

                    self._ws.put(['rivet', "Event no. {} processed\n".format(evtnum)])

                    # Intermediate histograms
                    if evtnum % self.histointerval == 0:
                        now = datetime.datetime.now().strftime("%Y%m%d-%H%M%S%f")
                        yodafile = "{}.yoda".format(now)

                        # Write histograms to yoda file
                        ah.writeData(yodafile)

                        # Read the file with yoda and normalize the histograms
                        histos = convert_histos(yoda.readYODA(yodafile), True)

                        # Delete the file (no need to keep intermediate histogram files)
                        os.unlink(yodafile)

                        self._ws.put(['histos', histos])

                        if not ref_histos_sent and ref_histos:
                            self._ws.put(['histos', ref_histos])
                            ref_histos_sent = True

                self._ws.put(['rivet', "Finished event loop\n"])

                # Finalization
                run.finalize()
                ah.finalize()
                now = datetime.datetime.now().strftime("%Y%m%d-%H%M%S%f")
                yodafile = "final-{}.yoda".format(now)

                # Write final histograms to yoda file (and keep it)
                ah.writeData(yodafile)

                # Read the file with yoda
                histos = convert_histos(yoda.readYODA(yodafile))

                self._ws.put(['histos', histos])

                if ref_histos:
                    self._ws.put(['histos', ref_histos])

                # Send the yoda file name to the client
                # (used to later compare different runs of an analysis)
                self._ws.put(['yoda', "final-{}".format(now)])

                self._y.put(yodafile)

    def pause(self):
        self._q.put('pause')

    def resume(self):
        self._q.put('resume')

    def stop(self):
        self._q.put('stop')


class Simulation(threading.Thread):
    """
    The `Simulation` thread.
    """

    def __init__(self, generator, params, fifo, _ws):
        """
        `generator` the PYTHIA program to run (e.g. `main42.exe`)
        `params` the PYTHIA cmnd file (e.g. `main42.cmnd`)
        `fifo` the FIFO file name
        `_ws` the queue used to communicate with the web socket
        """

        threading.Thread.__init__(self)
        self.generator = generator
        self.params = params
        self.fifo = fifo
        self._ws = _ws

        self.analysis = None
        self.histointerval = None
        self.pythia = None
        self.rivet = None

        self.error = False
        self.stopped = False

        self._q = multiprocessing.Queue()
        self._y = multiprocessing.Queue()

    def set_analysis(self, analysis):
        self.analysis = analysis

    def set_histointerval(self, histointerval):
        self.histointerval = histointerval

    def run(self):
        """
        Run the simulation if the analysis and update interval were set.

        Create the `FIFOFile` (in `/tmp`), run PYTHIA and then Rivet.
        """

        if self.analysis == None or self.histointerval == None:
            self._ws.put(['error', "Missing analysis or histointerval property - nothing done"])
        else:
            p = self.read_cmnd_file()
            p['_analysis'] = self.analysis
            db = PythiaDB()
            # If this analysis has already been run successfully with the supplied
            # parameters, just retrieve and display the stored results.
            if db.exists(p):
                yodafile = db.get_yoda(p)
                ref_histos = None
                try:
                    ref_file = os.path.join(config.get('paths', 'refdata'), "{}.yoda".format(self.analysis))
                    ref_histos = convert_histos(yoda.readYODA(ref_file))
                except IOError:
                    print "No refdata for {}".format(self.analysis)
                try:
                    histos = convert_histos(yoda.readYODA(os.path.join(config.get('paths', 'rivet_output'), yodafile)))
                    self._ws.put(['histos', histos])
                    if ref_histos:
                        self._ws.put(['histos', ref_histos])
                    self._ws.put(['yoda', yodafile.partition('.yoda')[0]])
                    self._ws.put(['signal', SIM_END])
                except IOError:
                    self._ws.put(['error', "Unable to retrieve saved histograms"])
                    self._ws.put(['signal', SIM_ERR])
            else:
                with FIFOFile(self.fifo) as fifofile:
                    # Generate events with PYTHIA
                    self._generate(fifofile)

                    # Small sleep time to allow PYTHIA subprocess to start
                    time.sleep(0.5)

                    # Analyse events with Rivet
                    self._analyse(fifofile)

                    self.rivet.join()

                    # If Rivet does not terminate correctly (because of an exception
                    # in the C code that cannot be caught in Python), kill PYTHIA,
                    # otherwise a lot of "setting badbit" errors would appear in the
                    # console, and PYTHIA wouldn't stop.
                    if self.rivet.exitcode != 0:
                        self._ws.put(['rivet', "Rivet process terminated... Killing PYTHIA\n"])
                        self.pythia.terminate()
                        self._ws.put(['error', "Rivet error - see console for details"])
                        self._ws.put(['signal', SIM_ERR])
                        self.error = True
                    self.pythia.join()

                # Back to the initial directory (of `main.py`)
                os.chdir(sys.path[0])

                if not self.error:
                    if self.stopped:
                        self._ws.put(['signal', SIM_STP])
                    else:
                        # Store successful analyses
                        yodafile = self._y.get(True)
                        p['_yoda'] = yodafile
                        db.add(p)
                        self._ws.put(['signal', SIM_END])

                with open(os.path.join(sys.path[0], 'rivet_out.log'), 'r') as f:
                    for line in f.readlines():
                        self._ws.put(['rivet_out', line])

                with open(os.path.join(sys.path[0], 'rivet_err.log'), 'r') as f:
                    for line in f.readlines():
                        self._ws.put(['rivet_err', line])

    def _generate(self, fifofile):
        """
        Create and start `Pythia` thread, generating events.
        """

        self.pythia = Pythia(self.generator, self.params, fifofile, self._ws)
        self.pythia.start()
        self._ws.put(['signal', PYT_RUN])

    def _analyse(self, fifofile):
        """
        Create and start `Rivet` process, analysing events.
        """

        self.rivet = Rivet(self.analysis, fifofile, self.histointerval, self._q, self._ws, self._y)
        self.rivet.start()
        self._ws.put(['signal', RIV_RUN])

    def pause(self):
        if self.rivet:
            self.rivet.pause()

    def resume(self):
        if self.rivet:
            self.rivet.resume()

    def stop(self):
        """
        Kill PYTHIA and let Rivet finish gracefully.
        """

        if self.pythia:
            self.pythia.terminate()
        if self.rivet:
            self.rivet.resume()
            self.rivet.stop()

        self.stopped = True

    def read_cmnd_file(self):
        """
        Read PYTHIA cmnd file and return params as a dict.
        """

        p = dict()

        with open(os.path.join(config.get('paths', 'pythia'), self.params), 'r') as f:
            for line in f:
                if line[0] not in ['', '#', '!'] and '=' in line:
                    part = line.partition('=')
                    name = part[0].strip()
                    value = part[2].partition('#')[0].partition('!')[0].strip()
                    p[name] = value

        return p

    def load_params(self, params):
        """
        Load parameters from the `params` PYTHIA cmnd file.
        """

        with open(os.path.join(config.get('paths', 'pythia'), self.params), 'r') as f:
            for line in f:
                # For every line, try to find a matching parameter
                for param in params:
                    # On the Javascript side, param names use '-' instead of ':'
                    name = param['name'].replace('-', ':')
                    if line.partition('=')[0].strip() == name:
                        param['currentValue'] = line.partition('=')[2].partition('#')[0].partition('!')[0].strip()
                        break

        self._ws.put(['params', params])

    def save_params(self, params):
        """
        Save parameters to the `params` PYTHIA cmnd file.
        """

        params_presence = dict()
        for param in params:
            name = param['name'].replace('-', ':')
            params_presence[name] = False
        try:
            # Inplace update of the file
            for line in fileinput.input(os.path.join(config.get('paths', 'pythia'), self.params), inplace=1):
                found = False
                for param in params:
                    # On the Javascript side, param names use '-' instead of ':'
                    name = param['name'].replace('-', ':')
                    value = param['currentValue']
                    if line.partition('=')[0].strip() == name:
                        found = True
                        if not params_presence[name]:
                            params_presence[name] = True
                            # Inplace update means stdout redirected to the file
                            print "{} = {}".format(name, value)
                            break
                if not found:
                    # Keep line unchanged
                    print line.strip()
            # Save not yet defined parameters at the end of the file
            with open(os.path.join(config.get('paths', 'pythia'), self.params), 'a') as f:
                for param in params:
                    name = param['name'].replace('-', ':')
                    value = param['currentValue']
                    if not params_presence[name]:
                        f.write("{} = {}\n".format(name, value))
            self._ws.put(['signal', PARAMS_SAVED])
        except:
            self._ws.put(['signal', PARAMS_ERROR])
            self._ws.put(['error', "Failed to save parameters"])

    def required_beams(self, analysis):
        """
        Get the required beams for an `analysis`.
        """

        ana = rivet.AnalysisLoader.getAnalysis(analysis)

        if ana:
            beams = ana.requiredBeams()
            idA = beams[0][1]
            idB = beams[0][0]
            self._ws.put(['param', ['Beams-idA', idA]])
            self._ws.put(['param', ['Beams-idB', idB]])

    def compare(self, yoda_files):
        """
        Compare histograms from different `yoda_files`.
        """

        for yodafile in yoda_files:
            try:
                histos = convert_histos(yoda.readYODA(os.path.join(config.get('paths', 'rivet_output'), yodafile)))
                self._ws.put(['compare_histos', histos])
            except IOError:
                print "Simulation.compare: error reading yoda file {}".format(yodafile)

    def analysis_details(self, analysis):
        """
        Get the details of an `analysis`.
        """

        ana = rivet.AnalysisLoader.getAnalysis(analysis)

        if ana:
            details = {
                'authors': ana.authors(),
                'bibKey': ana.bibKey(),
                'bibTeX': ana.bibTeX(),
                'collider': ana.collider(),
                'description': ana.description(),
                'experiment': ana.experiment(),
                'inspireId': ana.inspireId(),
                'name': ana.name(),
                'references': ana.references(),
                'requiredBeams': ana.requiredBeams(),
                'requiredEnergies': ana.requiredEnergies(),
                'runInfo': ana.runInfo(),
                'spiresId': ana.spiresId(),
                'status': ana.status(),
                'summary': ana.summary(),
                'year': ana.year()
                }
            self._ws.put(['analysis_details', details])

