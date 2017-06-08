import collections
import json
import logging
import optparse
from ruruki import graphs

from flask import Flask
from flask import jsonify
from flask import request

from flask.ext.cors import CORS

from werkzeug.exceptions import NotFound


app = Flask(__name__)
CORS(app)
DB = graphs.Graph()
LOGGER = logging.getLogger(__name__)


def request_wants_json():
    """
    Checks if the request is expecting a json response (headers contain Accept:
        application/json).

    :returns: An answer: this request expects a json response?
    :rtype: :class:`bool`
    """
    best = request.accept_mimetypes.best_match(
        ['application/json', 'text/html']
    )

    return all([
        best == 'application/json',
        request.accept_mimetypes[best] > request.accept_mimetypes['text/html']
    ])


def _get_indexes():
    filters = [
        "__contains",
        "__icontains",
        "__startswith",
        "__istartswith",
        "__endswith",
        "__iendswith",
        "__le",
        "__lt",
        "__ge",
        "__gt",
        "__eq",
        "__ieq",
        "__ne",
        "__ine",
    ]

    indexes = collections.defaultdict(list)

    for label, property in DB.vertices.get_indexes():
        indexes[label].append(property)

    return {
        "indexes": indexes, "filters": filters
    }


def set_db(graph):
    """
    Update and set the global ``DB``.

    :param graph: Graph to set the ``DB``.
    :type graph: :class:`ruruki.interfaces.IGraph`
    """
    global DB
    LOGGER.info("Setting up db to {0}".format(graph))
    DB = graph


def fetch_data(vertex_id=None, levels=0, **kwargs):
    """
    Fetch data from the database.

    :param vertex_id: Vertex id if you are returning a sinle vertex based on
        the id. If :obj:`None`, it will return everything.
    :param vertex_id: :class:`int` or :obj:`None`
    :param levels: How many level deep to return.
    :type levels: :class:`int`
    :param kwargs: Key and values filter parameters.
    :type kwargs: :class:`str` = :class:`str`
    :returns: Returns a iterable of vertices.
    :rtype: Iterable of :class:`ruruki.interfaces.IVertex`
    """
    db = DB

    tunned_kwargs = kwargs.copy()

    for key, value in kwargs.items():
        if ':' in key:
            value = tunned_kwargs.pop(key)
            tokens = key.split(':')
            tunned_kwargs['label'] = tokens[0]

            if value == '*':
                continue

            tunned_kwargs[tokens[1]] = value

    def fetch(v, seen, levels):
        if v in seen:
            return

        seen.add(v)
        if levels > 0:
            for each in v.get_both_vertices():
                fetch(each, seen, levels-1)

    if vertex_id is None:
        result = list(db.get_vertices(**tunned_kwargs))
        LOGGER.info(
            "Found {0} vertices based on filter parameters: "
            "{1}".format(len(result), tunned_kwargs)
        )
        return result

    seen = set()
    LOGGER.info(
        "Fetching vertex id {0!r} and {1} levels deep.".format(
            vertex_id, levels
        )
    )
    fetch(db.get_vertex(vertex_id), seen=seen, levels=levels)
    return seen


def format_data(data, exclude_labels=[], exclude_properties=[]):
    """
    Format the data into a json response.

    :param data: Data that you are formatting and returning a json response
        for.
    :type data: Iterable of :class:`ruruki.interfaces.IEntity`
    :param exclude_labels: List of labels that you would like to filter out
        and exclude for the data returned.
    :type exclude_labels: :class:`list` of :class:`str`
    :param exclude_properties: List of property key and values to exclude.
    :type exclude_properties: :class:`list` of :class:`tuple`
        (:class:`str`, :class:`str`)
    :returns: Returns the data as a json.
    :rtype: :class:`dict`
    """
    if not data:
        LOGGER.warn("Empty data!")
        return jsonify({})

    def exclude_by_label(head, tail):
        return (
            head.label in exclude_labels or
            tail.label in exclude_labels
        )

    def exclude_by_property(head, tail):
        vertices = [head, tail]
        for key, values in exclude_properties:
            for value in values:
                matched = list(
                    EntityContainer.static_filter(
                        vertices, **{key: value}
                    )
                )
                if list(matched):
                    return True
        return False

    seen = set()
    formatted_data = collections.defaultdict(list)
    for each in data:
        for edge in each.get_both_edges():
            if edge not in seen:
                seen.add(edge)
                head = edge.get_in_vertex()
                tail = edge.get_out_vertex()

                if exclude_by_label(head, tail):
                    continue

                if exclude_by_property(head, tail):
                    continue

                formatted_data["edges"].append(edge.as_dict())
                formatted_data["vertices"].append(head.as_dict())
                formatted_data["vertices"].append(tail.as_dict())
    return formatted_data


@app.route("/", methods=["GET"])
def index():
    if not request_wants_json():
        return app.send_static_file('search.html')

    def _parse_filters(raw_filter):
        lfilters = {}

        for f in raw_filter.split(','):
            tokens = f.split('=');

            if len(tokens[1]) > 1 and any([
                all([
                    tokens[1][0] == '"',
                    tokens[1][-1] == '"'
                ]),
                all([
                    tokens[1][0] == "'",
                    tokens[1][-1] == "'"
                ])
            ]):
                lfilters[tokens[0]] = tokens[1][1:-2]
            else:
                try:
                    lfilters[tokens[0]] = float(tokens[1])
                except:
                    lfilters[tokens[0]] = tokens[1]

        return lfilters

    def _filter_operation(container, operation, data):
        if operation == 'AND':
            return container & data
        elif operation == 'OR':
            return container | data
        else:
            return data

    db = DB
    vertices = set()
    edges = set()

    if request.args and 'filter' in request.args:
        for f in json.loads(request.args.get('filter')):
            lfilter = _parse_filters(f[0])
            data = db.get_vertices(**lfilter)

            vertices = _filter_operation(
                vertices, f[1], db.get_vertices(**lfilter)
            )

            edges = _filter_operation(
                edges, f[1], db.get_edges(**lfilter)
            )

    formatted_vertices = [
        each.as_dict()
        for each in vertices
    ]

    formatted_edges = [
        each.as_dict()
        for each in edges
    ]

    return jsonify(
        {
            'vertices': formatted_vertices,
            'edges': formatted_edges
        }
    )


@app.route('/indexes', methods=['GET'])
def indexes():
    if request_wants_json():
        return jsonify(_get_indexes())
    else:
        raise NotFound('Nothing to see here!')


@app.route("/vertices", methods=["GET"])
def vertices():
    """
    Return all the vertices including the edges.

    :returns: Returns all the vertices as a JSON response.
    :rtype: :class:`flask.Response`
    """
    if not request_wants_json():
        return app.send_static_file('search.html')

    results = set()
    args = dict(request.args)

    if '__cb' in args:
        del args['__cb']

    exl = args.pop("exclude_label", [])
    exp = []
    _ = [key for key in args if key.startswith("exclude__")]
    for key in _:
        exp.append((key.split("__", 1)[-1], args.pop(key)))

    if args:
        for key in args:
            for each in args[key]:
                results = results | set(fetch_data(**{key: each}))
    else:
        results = fetch_data()

#        formatted_data = format_data(results, exl, exp)
#        return jsonify(formatted_data)

    formatted_vertices = [
        each.as_dict()
        for each in results
    ]

    return jsonify({'vertices': formatted_vertices})


@app.route("/vertices/<int:vertex_id>", methods=["GET"])
def vertex(vertex_id):
    """
    Return the vertex including the edges.

    :param vertex_id: Vertex id that you are requesting.
    :type vertex_id: :class:`int`
    :param levels: How many level deep to return.
    :type levels: :class:`int`
    :returns: Returns all the vertices as a JSON response.
    :rtype: :class:`flask.Response`
    """
    if not request_wants_json():
        return app.send_static_file('graph.html')

    args = dict(request.args)
    exl = args.pop("exclude_label", [])
    exp = []
    _ = [key for key in args if key.startswith("exclude__")]
    for key in _:
        exp.append((key.split("__", 1)[-1], args.pop(key)))

    levels = args.pop("levels", [0])
    results = fetch_data(vertex_id, levels=int(levels.pop()))

    formatted_data = format_data(results, exl, exp)

    return jsonify(formatted_data)

def get_cmd_opts_args():
    """
    Get the command lines options and arguments.

    :returns: Returns the options and arguments.
    :rtype: :class:`tuple` (:class:`optparse.Option`, iterable of :class:`str`)
    """
    parser = optparse.OptionParser(conflict_handler="resolve")
    parser.add_option(
        "-h", "--host", dest="host", default="0.0.0.0",
        metavar="HOST", help="Host to listen on. Default: %default"
    )
    parser.add_option(
        "-p", "--port", dest="port", type="int", default=5000,
        metavar="PORT",
        help="Port number to listen web connections. Default: %default"
    )
    parser.add_option(
        "--debug", dest="debug", action="store_true",
        help="Run the web service in dubug mode. This will show stacktraces."
    )
    return parser.parse_args()


def run(host, port, debug, graph=None):
    """
    Start a web server.

    :param host: Host to listen on.
    :type host: :class:`str`
    :param port: Port to listen on.
    :type port: :class:`int`
    :param debug: Enable debugging.
    :type debug: :class:`bool`
    :param graph: Bind to a graph.
    :type debug: :class:`ruruki.interfaces.IGraph`
    """
    logging.basicConfig(level=logging.INFO)
    logging.info("Starting server {}:{}".format(host, port))
    set_db(graph)
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    opts, args = get_cmd_opts_args()
    run(opts.host, opts.port, opts.debug)
