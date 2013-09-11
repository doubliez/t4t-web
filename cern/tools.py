# -*- coding: utf-8 -*-

"""
Tools used for communication.
"""

import tornado.ioloop
import threading
import os
import tempfile
import pymongo

# Signals
SIM_END = 0
PYT_RUN = 1
PYT_STP = 2
RIV_RUN = 3
RIV_STP = 4
SIM_ERR = 5
PARAMS_SAVED = 6
PARAMS_ERROR = 7
SIM_STP = 8


class FIFOFile(object):
    """
    Context manager to handle the FIFO file used by PYTHIA and Rivet.
    """

    def __init__(self, name):
        self.name = name
        self.tmpdir = tempfile.mkdtemp()
        self.filename = os.path.join(self.tmpdir, self.name)

    def __enter__(self):
        os.mkfifo(self.filename)
        return self.filename

    def __exit__(self, type, value, traceback):
        os.remove(self.filename)
        os.rmdir(self.tmpdir)


class WSComm(threading.Thread):
    """
    Web Socket Communication thread.

    A little framework to send messages via the web socket.
    """

    add_callback = tornado.ioloop.IOLoop.instance().add_callback

    def __init__(self, write_message, _ws):
        threading.Thread.__init__(self)
        self.write_message = write_message
        self._ws = _ws

        self._run = threading.Event()

    def run(self):
        self._run.set()

        while self._run.is_set():
            try:
                msg = self._ws.get(True)
                self.add_callback(self.write_message, {'type': msg[0], 'content': msg[1]})
            except EOFError:
                print "WSComm thread: WebSocket queue has been closed"

    def stop(self):
        self._run.clear()


class PythiaDB(object):
    """
    MongoDB object store for PYTHIA parameters.
    """

    def __init__(self):
        self.client = pymongo.MongoClient()
        self.db = self.client.pythia
        self.params = self.db.params

    def add(self, p):
        if self.params.find(p).count() == 0:
            self.params.insert(p)

    def remove(self, p):
        self.params.remove(p)

    def exists(self, p):
        return self.params.find(p).count() > 0

    def get_yoda(self, p):
        return str(self.params.find_one(p)['_yoda'])

