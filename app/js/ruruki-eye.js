var MAX_RADIUS = 40;

if ('d3' in window) var colorPool = d3.scale.category10();

/**
 * Performs AJAX request for Vertex information based on Verted ID.
 *
 * @param {int} vertexId - Id of the vertex
 * @param {string} endpoint - Server/endpoint for the expand querying
 * @param {function} callback - Callback which the result will be passed to
 */
function asyncFetchVertexDataById(vertexId, endpoint, callback) {
    $.getJSON(
        endpoint + '/' + vertexId,
        callback
    );
}

/**
 * Performs AJAX request for filtering.
 *
 * @param {string} filter - Filtering queryString
 * @param {string} endpoint - Server/endpoint for data querying
 * @param {function} callback - Callback which the result will be passed to
 */
function asyncFetchDataMatchingFilters(filter, endpoint, callback) {
    $.getJSON(
        endpoint + '/?filter=' + JSON.stringify(filter.serialize())
    )
    .done(function(data) {
        callback({
            'filterName': filter.name,
            'results': data
        });
    })
    .fail(function(jqxhr) {
        callback({
            'filterName': filter.name,
            'results': null,
            'status': jqxhr.status,
            'error': jqxhr.statusText
        });
    });
}

/**
 * Fetches scalar color for the specific node type.
 *
 * @param {string} label - Label or unique identifier of the node
 * @param {string} type - Type of the node: 'edge' or 'vertex'
 */
function getColor(label, type) {
    if (type == 'vertex') {
        return colorPool(label);
    }

    return '#555';
}

/**
 * Darkens or lightens a hexadecimal color.
 *
 * @param {string} origColor - Color your want to transform
 * @param {float} amount - Amount of transformation you want to apply to the
 *                         color. Positive values will lighten and negative
 *                         values will darken. Valid range is from -1 to 1
 */
function transformColor(origColor, amount) {
    var newColor = '#';

    origColor = origColor.substr(1, origColor.length);

    for (var i = 0; i < 3; i++) {
        var component = parseInt(origColor.substr(i * 2, 2), 16);

        component = Math.round(
            Math.min(
                Math.max(0, component + (component * amount)),
                255
            )
        );

        newColor += component.toString(16);
    }

    return newColor;
}

/**
* Stringify a dictionary highlighting (strong) the keys.
*
* @param {dict} dict - Dictionary to be stringified
* @param {string} string - String or character you want to use as separator
* @returns {string} - A string containing key=value jointed by the separator
*/

function dictToStr(dict, separator) {
    if (separator === undefined) { separator = ','; }

    var str = '';

    for (var key in dict) {
        if (str) str += separator + ' ';
        str += '<span class="info-properties-key">' + key + '</span>: ' +
            '<span class="info-properties-value">' + dict[key] + '</span>';
    }

    return str;
}

/**
 * Creates a Bootstrap label with custom color for the given node
 *
 * @param {dict} node - A graph node representation
 * @returns {string}
 */
function createTagHTML(node) {
    return '<span class="label" style="background-color:' + node.color +
        ';"><strong>' + node.label.toUpperCase() + '</strong></span> ';
}

/**
 * Delete children to the node containing the given id.
 *
 * @param {string} id - Id of the node which needs to be hidden
 * @param {array} container - Collection of items of a specific type (vertices
 *                            or edges) current being displayed (therefore in
 *                            use by D3).
 * @param {dict} dictionary - Our own collection of elements (vertices and/or
 *                            edges) indexed by ID.
 */
function deleteChildrenFromCollection(id, container, dictionary) {
    var affectedItems = 0;
    var ids = [id];
    var nid = null;

    function suggestParent(each) {
        nid = container[i][each].id;

        if (nid !== id && ids.indexOf(nid) === -1 &&
            container[i][each].parentVertexId !== null) {

            ids.push(nid);
        }
    }

    while(ids.length > 0) {
        id = ids.pop();
        for (var i = 0; i < container.length; i++) {
            if (container[i].parentVertexId !== id) {
                continue;
            }

            // It's an edge!
            if (container[i].type === 'edge') {
                ['source', 'target'].forEach(suggestParent);
            }

            // It's a vertex!
            if (container[i].type === 'vertex') {
                nid = container[i].id;
                if (nid !== id && ids.indexOf(nid) === -1) {

                    ids.push(nid);
                }
            }

            delete dictionary[container[i].id];
            container.splice(i--, 1);
            affectedItems++;
        }
    }

    return affectedItems;
}

/**
 * Organizes backend data into something more workable and correlate vertices
 * and edges.
 *
 * @param {dict} data - An API response
 * @param {dict} preData - (optional) Any previously organized data we may
 *                         already have processed.
 * @param {dict} parentVertex - (optional) Node to relate this new data being
 *                              processed. This will be a signature to the
 *                              new data for collapsing nodes in the future.
 * @returns {dics} - A dictionary containing information about "vertices",
 *                   "edges" and "labels".
 */
function processData(data, preData, parentVertex) {
    if (preData === undefined) preData = { vertices: {}, edges: {} };

    var verticesById = preData.vertices.raw || {};
    var edgesById = preData.edges.raw || {};
    var vertices = [];
    var edges = [];
    var labels = preData.labels || {
        vertex: [], edge: [], tags: { vertex: {}, edge: {} }
    };
    var newVertices = [];
    var newEdges = [];

    data.vertices.forEach(function (each) {
        if (verticesById[each.id] !== undefined) {
            return;
        }

        var name = each.properties.name || each.id;

        verticesById[each.id] = {
            type: 'vertex',
            id: each.id,
            name: name,
            label: each.label,
            color: transformColor(getColor(each.label, 'vertex'), 0.3),
            borderColor: getColor(each.label, 'vertex'),
            imports: [],
            in_connections: parseInt(
                each.metadata.in_edge_count
            ) || 0.0,
            out_connections: parseInt(
                each.metadata.out_edge_count
            ) || 0.0,
            visiblyConnectedEdges: [],
            isVisible: true,
            parentVertexId: parentVertex ? parentVertex.id : null,
            href: each.href
        };

        if (labels.tags.vertex[each.label] === undefined) {
            labels.tags.vertex[each.label] = createTagHTML(
                verticesById[each.id]
            );
        }

        verticesById[each.id].info = labels.tags.vertex[
            verticesById[each.id].label
        ] + each.id + ' {' + dictToStr(each.properties) + '}';

        if (verticesById[each.id].parentVertexId === each.id) {
            // OMG, but why? Fear not Jenda, I'll explain... only the root node
            // deserve to be addressed as "root node"!
            verticesById[each.id].parentVertexId = null;
        }

        if (labels.vertex.indexOf(each.label) === -1) {
            labels.vertex.push(each.label);
        }

        newVertices.push(verticesById[each.id]);
    });

    data.edges.forEach(function(each) {
        if (edgesById[each.id] !== undefined) {
            return;
        }

        var source = verticesById[each.head_id];
        var target = verticesById[each.tail_id];

        edgesById[each.id] = {
            type: 'edge',
            id: each.id,
            source: source,
            target: target,
            label: each.label,
            color: getColor(null, 'edge'),
            properties: each.properties,
            isVisible: true,
            parentVertexId: parentVertex ? parentVertex.id : null
        };

        if (labels.tags.edge[each.label] === undefined) {
            labels.tags.edge[each.label] = createTagHTML(
                edgesById[each.id]
            );
        }

        edgesById[each.id].info = '(' + source.id + ') ' +
            labels.tags.edge[edgesById[each.id].label] +
            ' →  ' +
            '(' + target.id + ') {' + dictToStr(each.properties) + '}';

        newEdges.push(edgesById[each.id]);

        verticesById[each.head_id].imports.push(
            each.tail_id
        );

        if (labels.edge.indexOf(each.label) == -1) {
            labels.edge.push(each.label);
        }
    });

    for (var key in verticesById) {
        vertices.push(verticesById[key]);
    }

    for (key in edgesById) {
        edges.push(edgesById[key]);
    }

    return {
        vertices: {
            raw: verticesById,
            diff: newVertices,
            group: vertices
        },
        edges: {
            raw: edgesById,
            diff: newEdges,
            group: edges
        },
        labels: labels,
    };
}

/**
 * Add help box to parent element containing information about the available
 * actions based on the configuration utilized when instantiating RurukiEye
 *
 * @class
 * @param {jqueryElement} element - Element to append the help box to
 * @param {dict} config - Ruruki configuration
 */
function attachHelpMenu(element, config) {
    function addItem(command, description) {
        var li = document.createElement('li');

        li.innerHTML = '<strong>' + command + '</strong> ' + description;
        ul.appendChild(li);
    }

    var help = document.createElement('div');
    var ul = document.createElement('ul');

    if (config.pin !== false) {
        addItem('Left Click', 'to pin and/or move a node around');
        addItem('Right Click', 'to unpin a node');
    }

    if (config.openNewTab !== false) {
        addItem('Middle Click', 'to open in another tab');
    }

    if (config.expand !== false) {
        addItem('Double Click', 'to expand a node');
        addItem('Shift + Double Click', 'to collapse a node');
    }

    if (config.reCenter !== false) {
        addItem('Ctrl + Double Click', 'to re-center to the node');
    }

    addItem('?', 'to toggle this help');

    help.className = 'help';
    ul.className = 'list-unstyled';

    help.appendChild(ul);

    element.append($(help));

    /**
     * Add listener to '?' key (pressing it should toggle visibility of
     * this element).
     */
    $(window).keypress(function (event) {
        if (event.keyCode === 63) {
            $('.help').toggleClass('deactivated');
        }
    });
}

/**
 * Add box to parent element containing controllers to interact with the
 * graph.
 *
 * @class
 * @param {jqueryElement} element - Element to append the control panel to
 */
function attachControlPanel(element) {
    function createTab(id, labelText, labelIcon, contentElement, checked) {
        var tabContainer = document.createElement('li');
        var radio = document.createElement('input');
        var label = document.createElement('label');
        var span = document.createElement('span');

        radio.type = 'radio';
        radio.name = 'ruruki-cp-tabs';
        radio.id = 'ruruki-cp-tab-' + id;
        radio.checked = checked !== undefined ? checked : false;

        span.className = labelIcon;

        label.className = 'ruruki-cp-tabs label';
        label.htmlFor = 'ruruki-cp-tab-' + id;
        label.title = labelText;
        label.appendChild(span);

        tabContainer.className = 'ruruki-cp-tabs-container';
        tabContainer.appendChild(radio);
        tabContainer.appendChild(label);
        tabContainer.appendChild(contentElement);

        contentElement.className = 'ruruki-cp-tab-content';
        contentElement.id = 'ruruki-cp-tab-content-' + id;

        return tabContainer;
    }

    var controlPanel = document.createElement('div');
    var controlPanelTitle = document.createElement('div');
    var megaContainer = document.createElement('div');
    var tabs = document.createElement('ul');
    var titleContainer = document.createElement('div');
    var titleRow = document.createElement('div');
    var title = document.createElement('span');
    var expanderContainer = document.createElement('div');
    var expander = document.createElement('span');
    var preDefinedContainer = document.createElement('div');
    var customDefinedContainer = document.createElement('div');
    var vertexPropertyRow = document.createElement('div');
    var vertexPropertyContainer = document.createElement('ul');
    var edgePropertyRow = document.createElement('div');
    var edgePropertyContainer = document.createElement('ul');
    var customPropertyEditor = document.createElement('div');
    var customPropertyRow = document.createElement('div');
    var customPropertyContainer = document.createElement('ul');

    // TABS
    tabs.className = 'ruruki-cp-tabs';
    tabs.appendChild(createTab('pre', 'Pre Defined Filters', 'glyphicon glyphicon-tags', preDefinedContainer, true));
    tabs.appendChild(createTab('custom', 'Custom Filters', 'glyphicon glyphicon-search', customDefinedContainer));
    // EOF TABS

    controlPanel.className = 'ruruki-cp';
    controlPanelTitle.className = 'ruruki-cp-title';

    megaContainer.className = 'container inspector';
    titleContainer.className = 'container inspector';

    titleRow.className = 'row title';

    title.className = 'inspector-title';
    title.appendChild(document.createTextNode('Control Panel'));

    expander.className = 'glyphicon glyphicon-resize-small';

    expanderContainer.className = 'inspector-expander';
    expanderContainer.appendChild(expander);

    titleRow.appendChild(title);
    titleRow.appendChild(expanderContainer);

    vertexPropertyRow.className = 'row property';
    vertexPropertyContainer.className = 'list-unstyled';
    vertexPropertyContainer.id = 'inspector-toggle-vertex';

    vertexPropertyRow.appendChild(vertexPropertyContainer);

    edgePropertyRow.className = 'row property';
    edgePropertyContainer.className = 'list-unstyled';
    edgePropertyContainer.id = 'inspector-toggle-edge';

    edgePropertyRow.appendChild(edgePropertyContainer);

    preDefinedContainer.appendChild(vertexPropertyRow);
    preDefinedContainer.appendChild(edgePropertyRow);

    customPropertyEditor.id = 'custom-defined-filter-editor';

    customPropertyRow.className = 'row property';
    customPropertyRow.id = 'BLA';
    customPropertyContainer.className = 'list-unstyled';
    customPropertyContainer.id = 'inspector-custom-filters';

    customPropertyRow.appendChild(customPropertyContainer);

    customDefinedContainer.appendChild(customPropertyEditor);
    customDefinedContainer.appendChild(customPropertyRow);

    megaContainer.appendChild(tabs);

    titleContainer.appendChild(titleRow);

    controlPanel.appendChild(megaContainer);
    controlPanelTitle.appendChild(titleContainer);

    element.append($(controlPanel));
    element.append($(controlPanelTitle));

    expander.onclick = function() {
        if (controlPanel.style.visibility === 'hidden') {
            expander.className = 'glyphicon glyphicon-resize-small';
            controlPanel.style.visibility = 'visible';
        } else {
            expander.className = 'glyphicon glyphicon-resize-full';
            controlPanel.style.visibility = 'hidden';
        }
    };
}

/**
 * Add couple of information divs to parent element, responsible for showing
 * information about how many nodes are on screen and detailed information
 * about the element your cursor is hovering over.
 *
 * @class
 * @param {jqueryElement} element - Element to append the info panel to
 */
function attachInfoPanel(element) {
    var info = document.createElement('div');
    var detail = document.createElement('div');

    info.className = 'ruruki-info info';
    info.appendChild(document.createTextNode('Loading info...'));

    detail.className = 'ruruki-info detail';
    detail.appendChild(document.createTextNode('Loading detail...'));

    element.append($(info));
    element.append($(detail));
}

/**
 * Attach Ruruki stylesheet.
 *
 * @class
 * @param {jqueryElement} element - Element to append the stylesheet element
 * @param {string} cssUrl - Url to Ruruki CSS file
 */
function loadCSS(cssUrl) {
    var link = document.createElement('link');

    link.rel  = 'stylesheet';
    link.type = 'text/css';
    link.href = cssUrl;
    link.media = 'all';

    document.head.appendChild(link);
}

var CustomFilter = function(name, color) {
    if (!color) color = 'blue';

    this.id = 'cf' + Date.now();
    this.name = name;
    this.filters = [];
    this.linkTypes = [];
    this.color = color;
    this.result = null;
};

CustomFilter.prototype.clone = function() {
    var copy = JSON.parse(JSON.stringify(this));

    var newFilter = new CustomFilter();

    for (var key in copy) {
        newFilter[key] = copy[key];
    }

    return newFilter;
};

CustomFilter.prototype.add = function(filter, linkType) {
    if (!filter) {
        throw 'Invalid filter: ' + filter + '! Ignored!';
    }

    linkType = (linkType || 'AND').toUpperCase();

    if (linkType !== 'AND' && linkType !== 'OR') {
        throw 'Invalid filter link type: ' + linkType + '! Defaulting to AND';
    }

    this.filters.push(filter);

    if (this.filters.length > 1)
        this.linkTypes.push(linkType || 'AND');
};

CustomFilter.prototype.remove = function(filter) {
    if (!filter) {
        throw 'Invalid filter: ' + filter + '! Ignored!';
    }

    var filterIndex = this.filters.indexOf(filter);

    if (filterIndex === -1) {
        throw 'Filter not in sequence! Ignoring...';
    }

    this.filters.splice(filterIndex, 1);

    if (this.filters.length === 0) {
        this.linkTypes = [];
    }

    if (this.linkTypes.length > 0) {
        if (filterIndex === 0) {
            this.linkTypes.splice(0, 1);
        } else {
            this.linkTypes.splice(filterIndex - 1, 1);
        }
    }

    this.result = null;
};

CustomFilter.prototype.forEach = function(callback, context) {
    for (var i = 0; i < this.filters.length; i++) {
        callback(this.filters[i], this.linkTypes[i-1]);
    }
};

CustomFilter.prototype.serialize = function() {
    var rep = [];
    var index = 0;
    var THIS = this;

    this.forEach(function(filter, type) {
        rep.push([filter, type]);
    });

    return rep;
};

/**
 * Instantiate RurukiEye, the graph navigator and hook it to the given
 * parent element (or #ruruki-eye by default)!
 *
 * @class
 * @param {dict} data - An API vertex information response's json.
 * @param {int} centerId - The id of the center/root node. This node will never
 *                         be hidden or hard changed.
 * @param {dict} config - Ruruki configuration
 * <br><strong>Valid options:</strong>
 * <br>
 * <ul>
 *   <li>
 *      <strong>data</strong> <i>{dict}</i> - Json dump of the graph to be
 *      presented
 *   </li>
 *   <li>
 *      <strong>centerId</strong> <i>{int}</i> - Id of the center/root node.
 *      This node will be always on screen
 *   </li>
 *   <li>
 *      <strong>controlPanel</strong> <i>{boolean}</i> - Set to <strong>false
 *      </strong>to disable the Control Panel <i>optional</i>
 *   </li>
 *   <li>
 *      <strong>cssUrl</strong> <i>{String}</i> - Define a CSS file to be used
 *      to style Ruruki-Eye <i>optional</i>
 *   </li>
 *   <li>
 *      <strong>infoPanel</strong> <i>{boolean}</i> - Set to <strong>false
 *      </strong>to disable the Information Panel <i>optional</i>
 *   </li>
 *   <li>
 *      <strong>help</strong> <i>{boolean}</i> - Set to <strong>false</strong>
 *      to disable the helper box <i>optional</i>
 *   </li>
 *   <li>
 *      <strong>pin</strong> <i>{boolean}</i> - Set to <strong>false</strong>
 *      to disable pinning and panning of nodes <i>optional</i>
 *   </li>
 *   <li>
 *      <strong>expandEndpoint</strong> <i>{string}</i> - Remote URL to fetch
 *      for nodes being expanded. <expandEndpoint> + '/' + <vertexId>
 *      Defaults to "/vertices"/
 *      <i>optional</i>
 *   </li>
 *   <li>
 *      <strong>expandCallback</strong> <i>{string}</i> - Action to be executed
 *      when node is being expanded.
 *      If defined overwrites built-in "asyncFetchVertexDataById(vertex)"
 *      <i>optional</i>
 *   </li>
 *   <li>
 *      <strong>openNewTab</strong> <i>{boolean}</i> - Set to
 *      <strong>false</strong>to disable "open node in a new tab"
 *      <i>optional</i>
 *   </li>
 *   <li>
 *      <strong>expand</strong> <i>{boolean}</i> - Set to
 *      <strong>false</strong> to disable node expanding and collapsing
 *      <i>optional</i>
 *   </li>
 *   <li>
 *      <strong>reCenter</strong> <i>{boolean}</i> - Set to
 *      <strong>false</strong>
 *      to disallow re-centering of the graph (change focus to another node)
 *      <i>optional</i>
 *   </li>
 * </ul>
 */
var RurukiEye = function(config) {
    if (config.data === undefined || config.centerId === undefined) {
        throw 'Mandatory fields missing in configuration: "data", "centerId"';
    }

    var expandEndpoint = config.expandEndpoint || '/vertices';
    var filterEndpoint = config.filterEndpoint || '';
    var expandCallback = config.expandCallback;
    var baseNodeId = config.centerId;
    var parentElementSelector = config.container || '#ruruki-eye';
    var parentElement = $(parentElementSelector);
    var centerNodeColor = config.centerNodeColor || '#FFDF00';
    var inspector = {
        status: {
            vertex: {},
            edge: {}
        }
    };

    loadCSS(config.cssUrl || '/static/css/ruruki-eye.css');

    var processedData = processData(config.data, undefined, {id: baseNodeId});
    var customFilters = {};
    var graphIsBounded = true;

    var width = parentElement.width();
    var height = parentElement.height();

    var force = d3.layout.force()
        .nodes(d3.values(processedData.vertices.raw))
        .links(d3.values(processedData.edges.raw))
        .size([width, height])
        .linkDistance(function(d) {
            return 60 +
            (Math.max(calcRadius(d.target), calcRadius(d.source)) * 4);
        })
        .charge(-300)
        .gravity(0)
        .on('tick', tick)
        .start();

    var drag = force.drag()
        .on('dragstart', pinNode);

    var svg = d3.select(parentElementSelector).append('div')
        .classed('ruruki-main', true)
        .append('svg')
        .attr('viewBox', '0 0 ' + width + ' ' + height)
        .classed('ruruki-main-responsive', true);

    if (config.help !== false) attachHelpMenu(parentElement, config);
    if (config.controlPanel !== false) attachControlPanel(parentElement);
    if (config.controlPanel !== false) createFilteringComponent(null);
    if (config.infoPanel !== false) attachInfoPanel(parentElement);

    redrawCustomFilters();

    var nodes = force.nodes();
    var links = force.links();
    var text = svg.append('g').selectAll('text');
    var edge = svg.append('g').selectAll('path');
    var vertex = svg.append('g').selectAll('circle');
    var info = $('.ruruki-info.info');
    var detail = $('.ruruki-info.detail')
        .text('');

    fixSize();
    redrawGraph();
    redrawInspector();

    window.onresize = fixSize;
    $(window).load(fixSize());

    /**
     * Resizes graph canvas on windows resize
     */
    function fixSize() {
        width = parentElement.width() || width;
        height = parentElement.height() || height;

        $('.ruruki-main-responsive').css('width', width);
        $('.ruruki-main-responsive').css('height', height);

        svg.attr('viewBox', '0 0 ' + width + ' ' + height);
    }

    /**
     * Redraws graph. To be called when new nodes have been added!
     */
    function redrawGraph() {
        text = text.data(nodes);
        edge = edge.data(links);
        vertex = vertex.data(nodes);

        svg.append('defs').selectAll('marker')
            .data(processedData.labels.edge)
          .enter().append('marker')
            .attr('class', 'arrowhead')
            .attr('id', function(d) { return d; })
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 10)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
          .append('path')
            .attr('d', 'M0,-5L10,0L0,5');

        text.enter()
            .append('text')
            .attr('class', function(d) { return 'vertex text ' + d.label; })
            .attr('x', function(d) {
                    return calcRadius(d) + 5;
            })
            .attr('y', '.31em')
            .attr('id', function(d) {
                return 'vertex-text-' + d.id;
            })
            .text(function(d) { return d.name; });

        edge.enter()
            .append('path')
            .attr('class', function(d) { return 'edge ' + d.label; })
            .attr('marker-end', function(d) {
                return 'url(#' + d.label + ')';
            })
            .attr('id', function(d) { return 'edge-' + d.id; })
            .on('mouseover', mouseOverEdge)
            .on('mouseout', mouseOut);

        vertex.enter()
            .append('circle')
            .attr('class', function(d) {
                var classes = 'vertex node ' + d.label;

                if (d.id == baseNodeId) {
                    d.fixed = true;
                    d.clean = true;
                    classes = classes + ' fixed';
                }

                return classes;
            })
            .attr('stroke', function(d) {
                return d.id == baseNodeId ? centerNodeColor : d.borderColor;
            })
            .style('fill', function(d) {
                return d.id == baseNodeId ? centerNodeColor : d.color;
            })
            .attr('r', function(d) { return calcRadius(d); })
            .attr('id', function(d) { return 'vertex-' + d.id; })
            .on('dblclick', changeNodeDetailLevel)
            .on('click', mouseClicked)
            .on('mouseover', mouseOverNode)
            .on('mouseout', mouseOut)
            .on('contextmenu', unpinNode)
            .call(drag);

        updateInfo();
    }

    function highlightByFilter(evt) {
        var data = $(evt.target).data();

        if (!data.filterName || !customFilters[data.filterName].result)
            return;

        ['vertices', 'edges'].forEach(function(type) {
            var singleType = (type === 'vertices' ? 'vertex' : 'edge');

            customFilters[data.filterName].result[type].forEach(function(each) {
                node = processedData[type].raw[each.id];
                if (!node) return;
                svg.selectAll(
                    '#' + singleType + '-' + node.id
                ).classed('highlighted', true);

                if (singleType === 'vertex') {
                    svg.selectAll(
                        '#' + singleType + '-text-' + node.id
                    ).classed('highlighted', true);
                }
            });
        });
    }

    function highlightByType(evt) {
        var data = $(evt.target).data();
        var selector = '.' + data.entityType + '.' + data.entityLabel;

        svg.selectAll(selector).classed('highlighted', true);
    }

    function clearHighlight() {
        svg.selectAll('.edge').classed('highlighted', false);
        svg.selectAll('.vertex').classed('highlighted', false);
    }

    function editFilter(filterName) {
        return function() {
            createFilteringComponent(customFilters[filterName]);
        };
    }

    function updateFilter(data) {
        var filter = customFilters[data.filterName];

        // Someone probably deleted the filter while we waited for the backend
        // to answer
        if (!filter) return;

        var filterTag = document.getElementById('custom-filter-' + filter.id);
        var filterWarnIcon = document.getElementById('custom-filter-icon-' + filter.id);

        if (data.error !== undefined) {
            filterWarnIcon.title = 'Invalid Filter! - ' + data.error;
            filterWarnIcon.style.display = 'inline';
            filterWarnIcon.style.color = 'red';
        }

        filter.result = data.results;

        if (filter.result) {
            $(filterTag).removeClass('disabled');
        } else {
            $(filterTag).addClass('disabled');
        }
    }

    function composeFilter(filter) {
        var compositeFilter = filter.clone();

        var filters = [];

        compositeFilter.forEach(function(filter, type) {
            if (/^result(.*)$/.test(filter)) {
            }
        });

        return compositeFilter;
    }

    function createFilteringComponent(filterSeq, pristine) {
        filterSeq = filterSeq === null ? null : filterSeq.clone();
        pristine = pristine === undefined ? true : pristine;

        var container = document.getElementById('custom-defined-filter-editor');

        $(container).empty();

        var editContainer = document.createElement('div');
        var controlsContainer = document.createElement('div');
        var subControlsContainer = document.createElement('div');
        var addFilterContainer = document.createElement('div');

        var buttonAddFilter = document.createElement('button');
        var buttonSave = document.createElement('button');
        var buttonCancel = document.createElement('button');
        var buttonDelete = document.createElement('button');
        var spanAddFilter = document.createElement('span');
        var spanSave = document.createElement('span');
        var spanCancel = document.createElement('span');
        var spanDelete = document.createElement('span');

        var filterName = document.createElement('input');
        var filterColor = document.createElement('input');
        var filterCount = 0;

        buttonSave.disabled = pristine;

        editContainer.className = 'row property';
        controlsContainer.className = 'row property';

        filterName.placeholder = 'Name';
        filterName.type = 'text';
        filterName.id = 'ruruki-cf-name';
        filterName.onkeyup = enableControls;

        filterColor.placeholder = 'Color';
        filterColor.type = 'text';
        filterColor.id = 'ruruki-cf-color';
        filterColor.onkeyup = enableControls;
        filterColor.value = '#00c';

        function enableControls(event) {
            buttonSave.disabled = false;
            buttonCancel.disabled = false;
            buttonDelete.disabled = false;
        }

        function addFilterRow(filter, linkType) {
            if (linkType) {
                var divider = document.createElement('h1');

                divider.className = 'ruruki-cp-divider';
                divider.id = 'ruruki-cf-link-' + filterCount;
                divider.value = linkType;
                divider.title = 'Click to change link type or right click to delete';
                divider.appendChild(document.createTextNode(linkType));

                divider.onclick = function(event) {
                    var innerValue = divider.value;

                    if (innerValue === 'OR') {
                        innerValue = 'AND';
                    } else {
                        innerValue = 'OR';
                    }

                    divider.value = innerValue;
                    divider.removeChild(divider.childNodes[0]);
                    divider.appendChild(document.createTextNode(innerValue));

                    buttonSave.disabled = false;
                    buttonCancel.disabled = false;
                };

                divider.oncontextmenu = function(event) {
                event.preventDefault();
                    try {
                        filterSeq.remove(filter);
                    } catch (err) {}

                    createFilteringComponent(filterSeq, false);
                };

                editContainer.appendChild(divider);
            }

            var text = document.createElement('input');

            text.id = 'ruruki-cf-value-' + filterCount++;
            text.type = 'text';
            text.placeholder = 'Filter';
                text.onkeyup = enableControls;

            if (filter) {
                text.value = filter;
            }

            editContainer.appendChild(text);
        }

        editContainer.appendChild(filterName);
        editContainer.appendChild(filterColor);

        buttonAddFilter.type = 'button';
        buttonAddFilter.className = 'btn btn-xs btn-default';
        spanAddFilter.className = 'glyphicon glyphicon-plus';
        buttonAddFilter.appendChild(spanAddFilter);
        buttonAddFilter.title = 'Add Filter';

        buttonAddFilter.onclick = function() {
            addFilterRow('', 'AND');
        };

        buttonSave.type = 'button';
        buttonSave.className = 'btn btn-xs btn-success';
        spanSave.className = 'glyphicon glyphicon-ok';
        buttonSave.appendChild(spanSave);
        buttonSave.title = 'Save';

        buttonSave.onclick = function() {
            var regex;
            var link;

            var newFilter = new CustomFilter();

            newFilter.name = document.getElementById('ruruki-cf-name').value;
            newFilter.color = document.getElementById('ruruki-cf-color').value;

            // Very first filter has no link
            newFilter.add(document.getElementById('ruruki-cf-value-0').value);

            for (var i = 1; i < filterCount; i++) {
                regex = document.getElementById('ruruki-cf-value-' + i).value;
                link = document.getElementById('ruruki-cf-link-' + i).value;
                newFilter.add(regex, link);
            }

            if (filterSeq) delete customFilters[filterSeq.name];
            customFilters[newFilter.name] = newFilter;

            updateFilter(
                {
                    filterName: newFilter.name,
                    id: newFilter.id,
                    results: null
                },
                customFilters
                );

            asyncFetchDataMatchingFilters(newFilter, filterEndpoint, function(data) {
                updateFilter(data, customFilters);
            });

            redrawCustomFilters();
            createFilteringComponent(null);
        };

        buttonCancel.type = 'button';
        buttonCancel.className = 'btn btn-xs btn-warning';
        spanCancel.className = 'glyphicon glyphicon-remove';
        buttonCancel.appendChild(spanCancel);
        buttonCancel.title = 'Cancel editing';

        buttonCancel.onclick = function() {
            createFilteringComponent(null);
        };

        buttonDelete.type = 'button';
        buttonDelete.className = 'btn btn-xs btn-danger';
        spanDelete.className = 'glyphicon glyphicon-trash';
        buttonDelete.appendChild(spanDelete);
        buttonDelete.title = 'Delete';

        buttonDelete.onclick = function() {
            delete customFilters[filterSeq.name];
            redrawCustomFilters();
            createFilteringComponent(null);
        };

        addFilterContainer.className = 'ruruki-cp-cf-controls left';
        addFilterContainer.appendChild(buttonAddFilter);
        controlsContainer.appendChild(addFilterContainer);

        subControlsContainer.className = 'ruruki-cp-cf-controls right';
        subControlsContainer.appendChild(buttonSave);
        controlsContainer.appendChild(subControlsContainer);

        container.appendChild(editContainer);
        container.appendChild(controlsContainer);

        if (!filterSeq || !filterSeq.filters || filterSeq.filters.length === 0) {
            addFilterRow();
        } else {
            filterName.value = filterSeq.name;
            filterColor.value = filterSeq.color;
            filterSeq.forEach(addFilterRow);
            subControlsContainer.appendChild(buttonCancel);
            subControlsContainer.appendChild(buttonDelete);
        }

        return container;
    }

    function redrawCustomFilters() {
        var container = $(document.getElementById('inspector-custom-filters'));

        container.empty();

        for (var key in customFilters) {
            var filter = customFilters[key];
            var title = filter.name;

            var li = document.createElement('li');
            var jqLi = $(li);
            var tag = document.createElement('label');
            var span = document.createElement('span');
            var strong = document.createElement('strong');

            var tagIcon = document.createElement('span');

            filter.forEach(function(f, t) {
                if (t) title += ' ' + t;
                title += ' ' + f;
            });

            tagIcon.className = 'glyphicon glyphicon-warning-sign';
            tagIcon.style.display = 'none';
            tagIcon.id = 'custom-filter-icon-' + filter.id;

            strong.appendChild(document.createTextNode(key + '  '));
            strong.appendChild(tagIcon);
            strong.dataset.filterName = key;

            span.className = 'label';
            span.style.backgroundColor = filter.color;
            span.dataset.filterName = key;
            span.appendChild(strong);

            tag.className = 'inspector property';
            tag.dataset.filterName = key;
            tag.id = 'custom-filter-' + filter.id;
            tag.appendChild(span);

            if (!filter.result) {
                tag.className += ' disabled';
            }

            li.dataset.filterName = key;
            li.title = title;
            li.appendChild(tag);

            jqLi.hover(highlightByFilter, clearHighlight);
            jqLi.click(editFilter(filter.name));

            container.append(jqLi);

            console.log('key', key, 'filter', filter);
        }
    }

    /**
     * Redraws inspector to make it offer controls for the elements currently
     * available in the graph. Ie. visibility toggles.
     */
    function redrawInspector() {
        ['edge', 'vertex'].forEach(function (entityType) {
            var container = $('#inspector-toggle-' + entityType).empty();

            processedData.labels[entityType].forEach(function (each) {
                var li = $('<li>');
                var label = $(
                    '<label ' +
                    'class="inspector property">' +
                    processedData.labels.tags[entityType][each] +
                    '</label>'
                );

                label.data({
                    entityType: entityType,
                    entityLabel: each
                });

                label.children().data({
                    entityType: entityType,
                    entityLabel: each
                });

                label.hover(highlightByType, clearHighlight);

                li.append(label);

                container.append(li);

                if (inspector.status[entityType][each] === false) {
                    label.addClass('disabled');
                }

                label.on('click', function() {
                    label.toggleClass('disabled');

                    inspector.status[entityType][each] = !label.hasClass(
                        'disabled'
                    );

                    updateElementsVisibility(entityType, each, inspector);
                });
            });
        });
    }

    /**
     * Updates INFO field (upper left corner).
     */
    function updateInfo() {
        info.html(
            'Showing <i>' + links.length + '</i> edges linked to <i>' +
            nodes.length + '</i> vertices'
        );
    }

    /**
     * Called after every iteration of the simulation. Great place to
     * reposition and/or redraw your graph elements.
     */
    function tick() {
        if (graphIsBounded) {
            vertex.attr('cx', function(d) {
                if (d.id === baseNodeId && d.clean === true) {
                    return (d.x = d.px = width / 2);
                }

                return (
                    d.x = Math.max(
                        calcRadius(d),
                        Math.min(width - calcRadius(d), d.x)
                    )
                );
            });
            vertex.attr('cy', function(d) {
                if (d.id === baseNodeId && d.clean === true) {
                    return (d.y = d.py = height / 2);
                }

                return (
                    d.y = Math.max(
                        calcRadius(d),
                        Math.min(height - calcRadius(d), d.y)
                    )
                );
            });
        } else {
            vertex.attr('transform', translate);
        }

        text.attr('transform', translate);

        edge.attr("d", function(d) {
            diffX = d.target.x - d.source.x;
            diffY = d.target.y - d.source.y;

            pathLength = Math.sqrt(Math.pow(diffX, 2) + Math.pow(diffY, 2));

            offsetX = (diffX * calcRadius(d.target)) / pathLength;
            offsetY = (diffY * calcRadius(d.target)) / pathLength;

            return "M" + d.source.x + "," + d.source.y + "L" +
                (d.target.x - offsetX) + "," + (d.target.y - offsetY);
        });
    }

    /**
     * Calculate radius for given node (based on the amount of connections it
     * has).
     */
    function calcRadius(d) {
        return Math.min(
            5 + Math.max(d.in_connections, d.out_connections) * 0.4,
            MAX_RADIUS
        );
    }

    /**
     * Translates element to pre-calculated X and Y positions.
     */
    function translate(d) {
        if (d.id == baseNodeId && d.clean === true) {
            d.x = width / 2;
            d.y = height / 2;
        }

        return 'translate(' + d.x + ',' + d.y + ')';
    }

    /**
     * Pins node to screen (simulation will no longer force it's position).
     */
    function pinNode(d) {
        if (config.pin === false) return;

        if (d.id === baseNodeId && d.clean === true) {
            delete d.clean;
        }

        if (d) {
          d3.select(this).classed('fixed', d.fixed = true);
        }
    }

    /**
     * Unpins node from screen (simulation may force it's position from this
     * moment on).
     */
    function unpinNode(d) {
        d3.event.preventDefault();

        if (config.pin === false) return;

        if (d.id === baseNodeId && d.clean === true) {
            delete d.clean;
        }

        if (d) {
          d3.select(this).classed('fixed', d.fixed = false);
        }
    }

    /**
     * Triggered on mouse click event. Currently traps:
     *   - Middle button: opens clicked node in a new tab
     */
    function mouseClicked(d) {
        d3.event.preventDefault();

        if (config.openNewTab === false) return;

        if (d && d3.event.button === 1) {
            var url = d.href || '/vertices/' + d.id;
            if (d3.event.ctrlKey) {
                win = window.open(url, '_blank');
            } else {
                window.location = url;
            }
        }
    }

    /**
     * Triggered on mouseOver event: highlights EDGES by adding "highlighted"
     * class and show element information in the "detail" label.
     */
    function mouseOverEdge(d) {
        if (d.isVisible !== true) { return; }

        svg.selectAll('.edge').classed('highlighted', function(p) {
            return p === d;
        });
        svg.selectAll('.vertex').classed('highlighted', function(p) {
            return p === d.source || p === d.target;
        });
        detail.html(d.info);
    }

    /**
     * Triggered on mouseOver event: highlights VERTICES by adding "highlighted"
     * class and show element information in the "detail" label.
     */
    function mouseOverNode(d) {
        if (d.isVisible !== true) { return; }

        svg.selectAll('.edge').classed('highlighted', function(p) {
            return p.source === d || p.target === d;
        });
        d3.select(this).classed('highlighted', true);
        d3.select('#vertex-text-' + d.id).classed('highlighted', true);
        detail.html(d.info);
    }

    /**
     * De-emphasize element by removing the "highlighted" class and wipes the
     * "detail" label clean.
     */
    function mouseOut() {
        svg.selectAll('.highlighted').classed('highlighted', false);
        detail.text('');
    }

    /**
     * Toggles visibility of element based on inspector status.
     * Default elements not present in inspector to VISIBLE.
     *
     * @see ForceGraph#inspector
     */
    function toggleElementVisibility(entityType, elementName, inspector) {
        if (inspector.status[entityType][elementName] === undefined) {
            inspector.status[entityType][elementName] = true;
        }

        var status = inspector.status[entityType][elementName];

        d3.selectAll('.' + entityType + '.' + elementName).attr(
            'opacity',
            function(d) {
                return status === true ? 1 : 0;
            }
        );
    }

    /**
     * Update visibility of all currently active elements based on
     * inspector's status.
     *
     * @see ForceGraph#inspector
     */
    function updateElementsVisibility() {
        nodes.forEach(function(each) {
            if (inspector.status[each.type][each.label] === undefined) {
                inspector.status[each.type][each.label] = true;
            }

            each.isVisible = inspector.status[each.type][each.label];

            if (each.id == baseNodeId) { each.isVisible = true; }
        });

        links.forEach(function(each) {
            if (inspector.status[each.type][each.label] === undefined) {
                inspector.status[each.type][each.label] = true;
            }

            each.isVisible = inspector.status[each.type][each.label];

            if (each.source.isVisible === false ||
                each.target.isVisible === false) {
                each.isVisible = false;
            }

            if (each.isVisible === false) {
                if (each.source.visiblyConnectedEdges.indexOf(each.id) !== -1) {
                    each.source.visiblyConnectedEdges.splice(
                        each.source.visiblyConnectedEdges.indexOf(each.id),
                        1
                    );
                }

                if (each.target.visiblyConnectedEdges.indexOf(each.id) !== -1) {
                    each.target.visiblyConnectedEdges.splice(
                        each.target.visiblyConnectedEdges.indexOf(each.id),
                        1
                    );
                }
            } else {
                if (each.source.visiblyConnectedEdges.indexOf(each.id) === -1) {
                    each.source.visiblyConnectedEdges.push(each.id);
                }

                if (each.target.visiblyConnectedEdges.indexOf(each.id) === -1) {
                    each.target.visiblyConnectedEdges.push(each.id);
                }
            }

            if (each.source.visiblyConnectedEdges.length === 0 ||
                each.target.visiblyConnectedEdges.length === 0) {
                each.isVisible = false;
            }

            if (each.source.id == baseNodeId) { each.source.isVisible = true; }
            if (each.target.id == baseNodeId) { each.target.isVisible = true; }
        });

        d3.selectAll('.vertex').attr('opacity', function(d) {
            if (d.id === baseNodeId) { return 1; }

            if (d.visiblyConnectedEdges.length === 0 || d.isVisible === false) {
                return 0;
            } else {
                return 1;
            }
        });

        d3.selectAll('.edge').attr('opacity', function(d) {
            return (d.isVisible === true ? 1 : 0);
        });
    }

    /**
     * Queries API for information about the given vertex (?level=0 will be
     * used in the query) and add new elements to active graph.
     *
     * @param {dict} d - Node object being expanded (parent!).
     */
    function expandVertex(d) {
        if (config.expand === false) return;

        info.html('Loading data for node <i> ' + d.id + '</i>...');

        if (expandCallback !== undefined) {
            expandCallback(d);
            return;
        }

        asyncFetchVertexDataById(d.id, expandEndpoint, function(newData) {
            processedData = processData(newData, processedData, d);

            console.log(
                processedData.vertices.diff.length,
                'vertices added',
                processedData.edges.diff.length,
                'edges added'
            );

            processedData.vertices.diff.forEach(function(each) {
                nodes.push(each);
            });

            processedData.edges.diff.forEach(function(each) {
                links.push(each);
            });

            redrawGraph();
            updateElementsVisibility();
            redrawInspector();

            force.start();
        });
    }

    /**
     * Remove all nodes related (children) to the given node recursively.
     * Ie.:
     *   <br><br>
     *   &nbsp;&nbsp; - A -<i>spawns</i>-> B
     *   <br>
     *   &nbsp;&nbsp; - B -<i>spanws</i>-> C and D
     *   <br><br>
     * by collapsing B only C and D nodes will be removed.
     * <br>
     * by collapsing A all the other nodes (B, C and D) will also be removed.
     *
     * @param {dict} d - Node object being collapsed (parent!).
     */
    function collapseVertex(d) {
        if (config.expand === false) return;

        var affectedVertices = 0;
        var affectedEdges = 0;

        if (d.id === baseNodeId) {
            links.forEach(function (each) {
                if (each.source.parentVertexId === d.id) {
                    affectedVertices += deleteChildrenFromCollection(
                        each.source.id, nodes, processedData.vertices.raw
                    );
                    affectedEdges += deleteChildrenFromCollection(
                        each.source.id, links, processedData.edges.raw
                    );
                }

                if (each.target.parentVertexId === d.id) {
                    affectedVertices += deleteChildrenFromCollection(
                        each.target.id, nodes, processedData.vertices.raw
                    );
                    affectedEdges += deleteChildrenFromCollection(
                        each.target.id, links, processedData.edges.raw
                    );
                }

            });
        }
        else {
            affectedVertices += deleteChildrenFromCollection(
                d.id, nodes, processedData.vertices.raw
            );
            affectedEdges += deleteChildrenFromCollection(
                d.id, links, processedData.edges.raw
            );
        }

        console.log(
            affectedVertices,
            'vertices deleted',
            affectedEdges,
            'edges deleted'
        );

        text = text.data(nodes);
        edge = edge.data(links);
        vertex = vertex.data(nodes);

        text.exit().remove();
        edge.exit().remove();
        vertex.exit().remove();

        updateInfo();

        force.start();

        redrawInspector();
    }

    /**
     * Changes the level of detail for the clicked node.
     * If SHIFT key is pressed during the event: collapseVertex, otherwise:
     * expandVertex.
     *
     * @see collapseVertex
     * @see expandVertex
     */
    function changeNodeDetailLevel(d) {
        d3.event.preventDefault();

        if (d3.event.shiftKey) {
            collapseVertex(d);
        } else if (d3.event.ctrlKey) {
            if (config.reCenter === false) return;

            window.location.href = '/vertices/' + d.id;
        } else {
            expandVertex(d);
        }
    }
};

