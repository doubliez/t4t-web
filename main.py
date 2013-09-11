#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Main script used to start the Tornado web server and to handle
requests and messages sent through the web socket.

Just run `python main.py` to start the server.
"""

from cern.simulation import Simulation
from cern.tools import WSComm
from cern.rivettools import get_lhc_analyses

import tornado.httpserver
import tornado.websocket
import tornado.ioloop
import tornado.web
import rivet
import json
import ConfigParser
import multiprocessing
import os
import sys

# Import configuration (paths to PYTHIA and Rivet...)
# See `config.ini` file
config = ConfigParser.RawConfigParser()
config.read(os.path.join(sys.path[0], 'config.ini'))


class MainHandler(tornado.web.RequestHandler):
    """
    The request handler which renders the main template
    and passes some parameters to it (see `templates/home.html`).
    """

    def get(self):
        """
        Response to the GET request to http://localhost:8888/
        """

        paramsJSONFile = open(os.path.join(config.get('paths', 'static'), 'js', 'params.json'), 'r')
        paramsJSON = paramsJSONFile.read()
        paramsJSONFile.close()

        kwargs = {
            'title': "CERN LHC on the web",
            'header': {
                'title': "CERN LHC on the web",
                'headline': "Interactive Test4Theory"
                },
            'rivetVersion': rivet.version(),
            'analyses': get_lhc_analyses(),
            'paramsJSON': paramsJSON
            }
        self.render('templates/home.html', **kwargs)


class WSHandler(tornado.websocket.WebSocketHandler):
    """
    The web socket handler which receives "actions" passed from the
    Javascript client side to control the simulation.
    """

    # The allowed actions for the simulation (the names
    # must correspond to existing method names in this class).
    allowed_actions = ['init', 'load_params', 'run', 'pause', 'resume',
        'stop', 'save_params', 'required_beams', 'compare', 'analysis_details']

    def open(self):
        """
        Reset the simulation object when the connection is established.
        """

        self.simulation = None

        # Use a queue with a `WSComm` thread to send messages through
        # the web socket. Useful to avoid unexpected loss of connection
        # when different threads try to write messages at the same time.
        self._ws = multiprocessing.Queue()
        self._wscomm = WSComm(self.write_message, self._ws)
        self._wscomm.start()

        # Register client
        clients.append((self._ws, self._wscomm))

    def on_message(self, message):
        """
        Triggered when a message is received.
        """

        # Deserialize JSON object into a Python dict
        data = json.loads(message)

        # Execute action if it is allowed (call corresponding method)
        if 'action' in data and data['action'] in self.allowed_actions:
            getattr(self, data['action'])(data)

    def on_close(self):
        """
        Properly stop the simulation when the connection is closed.
        """

        if self.simulation:
            self.simulation.stop()

        self._wscomm.stop()
        self._ws.close()
        self._wscomm.join()

        clients.remove((self._ws, self._wscomm))

    def init(self, data):
        """
        Create a new `Simulation` thread.
        """

        self.simulation = Simulation(data['generator'], data['params'], data['fifo'], self._ws)

    def load_params(self, data):
        """
        Load parameters from PYTHIA cmnd file.

        (will send response back to the web interface)
        """

        if self.simulation:
            self.simulation.load_params(data['params'])

    def run(self, data):
        """
        Run the simulation with the specified analysis and update interval.
        """

        if self.simulation:
            self.simulation.set_analysis(data['analysis'])
            self.simulation.set_histointerval(data['histointerval'])
            self.simulation.start()

    def pause(self, data):
        """
        Pause the simulation (Rivet process).
        """

        if self.simulation:
            self.simulation.pause()

    def resume(self, data):
        """
        Resume the simulation (Rivet process).
        """

        if self.simulation:
            self.simulation.resume()

    def stop(self, data):
        """
        Stop the simulation (PYTHIA and Rivet).
        """

        if self.simulation:
            self.simulation.stop()

    def save_params(self, data):
        """
        Save parameters to PYTHIA cmnd file.
        """

        if self.simulation:
            self.simulation.save_params(data['params'])

    def required_beams(self, data):
        """
        Query for the required beams of an analysis.

        (will send response back to the web interface)
        """

        if self.simulation:
            self.simulation.required_beams(data['analysis'])

    def compare(self, data):
        """
        Compare the specified yoda files.

        (parsed with yoda and sent back to the web interface)
        """

        if self.simulation:
            self.simulation.compare(data['yoda_files'])

    def analysis_details(self, data):
        """
        Query for the details of an analysis.

        (will send response back to the web interface)
        """

        if self.simulation:
            self.simulation.analysis_details(data['analysis'])


if __name__ == "__main__":
    """
    Start the web server (port 8888) with the handlers specified above.

    Static content (css, js...) is served from the static directory
    specified in `config.ini`.
    """

    clients = []

    application = tornado.web.Application([
        (r'/', MainHandler),
        (r'/ws', WSHandler),
    ], static_path=config.get('paths', 'static'))

    http_server = tornado.httpserver.HTTPServer(application)
    http_server.listen(8888)

    try:
        tornado.ioloop.IOLoop.instance().start()
    except KeyboardInterrupt:
        for _ws, _wscomm in clients:
            _wscomm.stop()
            _ws.close()
            _wscomm.join()
        tornado.ioloop.IOLoop.instance().stop()

