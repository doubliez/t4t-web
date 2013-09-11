# Citizen Science: CERN LHC on the web
## Web server and front-end for PYTHIA 8 and Rivet 2.0.0

### Requirements

The basic requirements to run the Tornado Web Server for this application are the following:

##### CERN simulation software:
- PYTHIA 8 (http://home.thep.lu.se/~torbjorn/Pythia.html)
- Rivet >=2.0.0 (http://rivet.hepforge.org/)

##### Python 2 with:
- Tornado (install with `pip install tornado`)
- pymongo (install with `pip install pymongo`)

##### MongoDB (http://www.mongodb.org/)


### Getting started

First, you need to set the PYTHONPATH environment variable correctly for Python to find the `rivet` module installed with Rivet. This can be done automatically by sourcing the `rivetenv.sh` file created at the root of Rivet source tree after compiling it. In Bash:

```bash
$ . rivetenv.sh
```

Then, the Tornado Web Server can be started by running:

```bash
$ python main.py
```

The server is listening on port 8888.

The interface can be accessed at http://localhost:8888/


### Configuration

Some paths are configured in the `config.ini` file (for PYTHIA, Rivet...).
