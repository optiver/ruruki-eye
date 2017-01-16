const MAX_RADIUS = 40;
let colourPool = null;

class CustomFilter {
    constructor(name, colour) {
        if (!colour) colour = 'blue';
        this.id = 'cf' + Date.now();
        this.name = name;
        this.filters = [];
        this.linkTypes = [];
        this.color = colour;
        this.result = null;
    }

    clone() {
        const copy = JSON.parse(JSON.stringify(this));
        const newFilter = new CustomFilter();
        for (let key in copy) {
            newFilter[key] = copy[key];
        }
        return newFilter;
    }

    add(filter, linkType) {
        if (!filter) {
            throw new Error(`Invalid filter: ${filter}! Ignored!`);
        }
        linkType = (linkType || 'AND').toUpperCase();
        if (linkType !== 'AND' && linkType !== 'OR') {
            throw new Error(`Invalid filter link type: ${linkType}! Defaulting to AND`);
        }
        this.filters.push(filter);
        if (this.filters.length > 1) {
            this.linkTypes.push(linkType || 'AND');
        }
    }

    remove(filter) {
        if (!filter) {
            throw new Error(`Invalid filter: ${filter}! Ignored!`);
        }
        const filterIndex = this.filters.indexOf(filter);
        if (filterIndex === -1) {
            throw new Error('Filter not in sequence! Ignoring...');
        }
        this.filters.splice(filterIndex, 1);
        if (this.filters.length === 0) {
            this.linkTypes = [];
        }

        if (this.linkTypes.length > 0) {
            this.linkTypes.splice(filterIndex === 0 ? 0 : filterIndex - 1, 1);
        }
        this.result = null;
    }

    forEach(callback, context) {
        for (let i = 0; i < this.filters.length; i++) {
            callback(this.filters[i], this.linkTypes[i-1]);
        }
    }

    serialize() {
        const rep = [];
        this.forEach((filter, type) => rep.push([filter, type]));
        return rep;
    }
}

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
class RurukiEye extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        const sep = window.document.location.href.indexOf('?') === -1 ? '?' : '&',
            url = window.document.location.href + sep + '__cb=' + Date.now();
        this.loadingData = true;
        RurukiEye.getJSON(url, data => {
            this.data = data;
            delete this.loadingData;
        },
        error => {
            console.log('ERROR: Not able to get JSON from server!');
            throw new Error('Cannot continue without data.');
        });
    }

    start() {
        // Wait for initial data to be loaded from server.
        // Not a pretty solution to the problem, but prevents blocking the event loop.
        if (this.loadingData) {
            setTimeout(this.start.bind(this), 100);
            return;
        }

        const self = this;
        if (this.data === void(0) || this.config.centerId === void(0)) {
            throw new Error('Mandatory fields missing in configuration: "data", "centerId"');
        }
        this.expandEndpoint = this.config.expandEndpoint || '/vertices';
        this.filterEndpoint = this.config.filterEndpoint || '';
        const parsedId = parseInt(this.config.centerId);
        this.baseNodeId = isNaN(parsedId) && this.config.centerId !== '' && this.config.centerId !== this.expandEndpoint.substr(1) ?
            this.data.vertices.filter(p => p.properties.name === this.config.centerId)[0].id : parsedId;
        this.parentElementSelector = this.config.container || 'ruruki-eye';
        this.parentElement = document.getElementById(this.parentElementSelector);
        this.centerNodeColor = this.config.centerNodeColor || '#FFDF00';
        const createNewModal = this.config.createNewModal || '/templates/create-new-modal.html';
        this.inspector = {
            status: {
                vertex: {},
                edge: {}
            }
        };

        this._loadCSS(this.config.cssUrl || '/static/css/ruruki-eye.css');

        this.processedData = RurukiEye._processData(this.data, void(0), {id: self.baseNodeId});
        this.customFilters = {};
        this.graphIsBounded = true;

        this.width = this.parentElement.getBoundingClientRect().width;
        this.height = this.parentElement.getBoundingClientRect().height;

        this.on('tick', this._generateWrapperContext(this._tick));
        this.force = d3.layout.force()
            .nodes(d3.values(self.processedData.vertices.raw))
            .links(d3.values(self.processedData.edges.raw))
            .size([self.width, self.height])
            .linkDistance(d => 60 + (Math.max(self._calcRadius(d.target), self._calcRadius(d.source)) * 4))
            .charge(-300)
            .gravity(0)
            .on('tick', () => self.emit('tick'))
            .start();

        this.drag = d3.behavior.drag()
            .on('dragstart', this._generateWrapperContext(this._dragNodeStart))
            .on('drag', this._generateWrapperContext(this._dragNode))
            .on('dragend', this._generateWrapperContext(this._dragNodeEnd));

        this.svg = d3.select(`#${self.parentElementSelector}`).append('div')
            .classed('ruruki-main', true)
            .append('svg')
            .attr('viewBox', `0 0 ${self.width} ${self.height}`)
            .classed('ruruki-main-responsive', true);

        this.dragLine = this.svg.append('path')
            .attr('class', 'edge dragline hidden')
            .attr('marker-end', d => 'url(#tcp)') // todo: url(#tcp) is a hack
            .attr('d', 'M0,0L0,0');

        if (this.config.help !== false) this._attachHelpMenu(this.parentElement, this.config);
        if (this.config.controlPanel !== false) this._attachControlPanel(this.parentElement);
        if (this.config.infoPanel !== false) RurukiEye._attachInfoPanel(this.parentElement);
        if (this.config.dragNew !== false) RurukiEye._attachCreateNewDialog(this.parentElement, createNewModal);

        this.nodes = this.force.nodes();
        this.links = this.force.links();
        this.text = this.svg.append('g').selectAll('text');
        this.edge = this.svg.append('g').selectAll('path');
        this.vertex = this.svg.append('g').selectAll('circle');
        this.info = document.getElementsByClassName('ruruki-info info');
        this.detail = document.getElementsByClassName('ruruki-info detail');
        for (let elem of this.detail) {
            elem.innerHTML = '';
        }

        this.on('size', this._fixSize.bind(this));
        const loadRedraw = () => {
            this.emit('size');
            this.redrawGraph();
        };
        window.addEventListener('resize', loadRedraw);
        window.addEventListener('DOMContentLoaded', loadRedraw);
        window.addEventListener('load', loadRedraw);
        if (document.readyState === 'complete') {
            setTimeout(loadRedraw, 500);
        }
        this.emit('size');

        window.addEventListener('keypress', e => self.emit('keypress', e));
    }

    /**
     * _dragNode - called when dragging is taking place on a node.
     * This method will reposition nodes and generate a drag line.
     *
     * @param  {Object} self handle to the current ruruki-eye (avoids fidding with d3 'this' context)
     * @param  {Object} d the node that is being dragged
     */
    _dragNode(self, d) {
        if (self.dragNodeStarted) {
            d.px += d3.event.dx;
            d.py += d3.event.dy;
            d.x += d3.event.dx;
            d.y += d3.event.dy;
        }
        else if(self.dragNodeAddNew) {
            self.dragLine.attr('d', `M${d.x},${d.y}L${d3.mouse(this)[0]},${d3.mouse(this)[1]}`);
        }
        self.emit('tick');
    }

    /**
     * _dragNodeStart - called when a node is being dragged.
     * This method will prevent other nodes being moved while a node is being dragged, reposition
     * the drag line and will prevent node drag while holding the ctrl key.
     *
     * @param  {Object} self handle to the current ruruki-eye (avoids fidding with d3 'this' context)
     * @param  {type} d    the node that is being dragged
     */
    _dragNodeStart(self, d) {
        if(d3.event.sourceEvent.ctrlKey && self.config.dragNew !== false) {
            self.force.stop();
            self.dragNodeAddNew = true;
            self.dragLine
                .classed('hidden', false)
                .attr('d', `M${d.x},${d.y}L${d.x},${d.y}`);
        }
        else {
            self.dragNodeStarted = true;
            self.pinNode(self, d);
            self.force.resume();
        }
    }

    /**
     * _dragNodeEnd - called when a node is no-longer being dragged.
     * Will hide the dragline and create a new link if appropriate.
     *
     * @param  {Object} self handle to the current ruruki-eye (avoids fidding with d3 'this' context)
     * @param  {Object} d    the node that is being dragged
     */
    _dragNodeEnd(self, d) {
        self.dragNodeStarted = false;
        self.force.resume();
        if (self.dragNodeAddNew) {
            self.dragNodeAddNew = false;
            self.dragLine.classed('hidden', true);
            if (self.nodeUnderMouse && self.nodeUnderMouse.id !== d.id) {
                self.emit('createNew', d, self.nodeUnderMouse);
            }
        }
        self.emit('tick');
    }

    /**
     * Attach Ruruki stylesheet.
     *
     * @param {string} cssUrl - Url to Ruruki CSS file
     */
    _loadCSS(cssUrl) {
        const link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.type = 'text/css';
        link.href = cssUrl;
        link.media = 'all';
        document.head.appendChild(link);
    }

    /**
     * Resizes graph canvas on windows resize
     */
    _fixSize() {
        this.width = this.parentElement.getBoundingClientRect().width || this.width;
        this.height = this.parentElement.getBoundingClientRect().height || this.height;
        for (let elem of document.getElementsByClassName('ruruki-main-responsive')) {
            elem.style.width = this.width;
            elem.style.height = this.height;
        }
        this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`);
    }

    /**
    * Redraws graph. To be called when new nodes have been added!
    */
    redrawGraph() {
        const self = this;
        this.text = this.text.data(this.nodes);
        this.edge = this.edge.data(this.links);
        this.vertex = this.vertex.data(this.nodes);

        this.svg.append('defs').selectAll('marker')
            .data(this.processedData.labels.edge)
            .enter().append('marker')
            .attr('class', 'arrowhead')
            .attr('id', d => d)
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 10)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5');

        this.text.enter()
            .append('text')
            .attr('class', d => `vertex text ${d.label}`)
            .attr('x', d => self._calcRadius(d) + 5)
            .attr('y', '.31em')
            .attr('id', d => `vertex-text-${d.id}`)
            .text(d => d.name);

        this.edge.enter()
            .append('path')
            .attr('class', d => `edge ${d.label}`)
            .attr('marker-end', d => `url(#${d.label})`)
            .attr('id', d => `edge-${d.id}`)
            .on('mouseover', this._generateWrapperContext(this._mouseOverEdge))
            .on('mouseout', this._generateWrapperContext(this._mouseOut))
            .on('click', this._generateWrapperContext(this._mouseClickedEdge));

        this.vertex.enter()
            .append('circle')
            .attr('class', d => {
                let classes = `vertex node ${d.label}`;
                if (d.id == self.baseNodeId) {
                    d.fixed = true;
                    d.clean = true;
                    classes = `${classes} fixed`;
                }
                return classes;
            })
            .attr('stroke', d => d.id == self.baseNodeId ? self.centerNodeColor : d.borderColor)
            .style('fill', d => d.id == self.baseNodeId ? self.centerNodeColor : d.color)
            .attr('r', d => self._calcRadius(d))
            .attr('id', d => `vertex-${d.id}`)
            .on('dblclick', self._generateWrapperContext(self._changeNodeDetailLevel))
            .on('click', self._generateWrapperContext(self._mouseClicked))
            .on('mouseover', self._generateWrapperContext(self._mouseOverNode))
            .on('mouseout', self._generateWrapperContext(self._mouseOut))
            .on('contextmenu', self._generateWrapperContext(self.unpinNode))
            .call(self.drag);

        this._updateInfo();
    }

    highlightByFilter(filterName) {
        if (!filterName || !this.customFilters[filterName].result) {
            return;
        }

        const self = this;
        ['vertices', 'edges'].forEach(type => {
            const singleType = (type === 'vertices' ? 'vertex' : 'edge');

            self.customFilters[filterName].result[type].forEach((each) => {
                node = this.processedData[type].raw[each.id];
                if (!node) return;
                this.svg.selectAll(`#${singleType}-${node.id}`).classed('highlighted', true);

                if (singleType === 'vertex') {
                    this.svg.selectAll(`#${singleType}-text-${node.id}`).classed('highlighted', true);
                }
            });
        });
    }

    highlightByType(entityType, entityLabel) {
        const selector = `.${entityType}.${entityLabel}`;
        this.svg.selectAll(selector).classed('highlighted', true);
    }

    clearHighlight(self) {
        self = self || this;
        self.svg.selectAll('.edge').classed('highlighted', false);
        self.svg.selectAll('.vertex').classed('highlighted', false);
    }

    _editFilter(filterName) {
        const self = this;
        return () => {
            this._createFilteringComponent(self.customFilters[filterName]);
        };
    }

    _updateFilter(data) {
        const filter = customFilters[data.filterName];

        // Someone probably deleted the filter while we waited for the backend to answer
        if (!filter) return;

        const filterTag = document.getElementById(`custom-filter-${filter.id}`);
        const filterWarnIcon = document.getElementById(`custom-filter-icon-${filter.id}`);

        if (data.error !== void(0)) {
            filterWarnIcon.title = `Invalid Filter! - ${data.error}`;
            filterWarnIcon.style.display = 'inline';
            filterWarnIcon.style.color = 'red';
        }

        filter.result = data.results;

        if (filter.result) {
            filterTag.classList.remove('disabled');
        } else {
            filterTag.classList.add('disabled');
        }
    }

    _composeFilter(filter) {
        const compositeFilter = filter.clone();
        const filters = [];
        compositeFilter.forEach((filter, type) => {
            /^result(.*)$/.test(filter);
        });
        return compositeFilter;
    }

    _createFilteringComponent(filterSeq, pristine) {
        filterSeq = filterSeq === null ? null : filterSeq.clone();
        pristine = pristine === void(0) ? true : pristine;

        const container = document.getElementById('custom-defined-filter-editor');
        container.innerHTML = '';

        const editContainer = document.createElement('div');
        const controlsContainer = document.createElement('div');
        const subControlsContainer = document.createElement('div');
        const addFilterContainer = document.createElement('div');

        const buttonAddFilter = document.createElement('button');
        const buttonSave = document.createElement('button');
        const buttonCancel = document.createElement('button');
        const buttonDelete = document.createElement('button');
        const spanAddFilter = document.createElement('span');
        const spanSave = document.createElement('span');
        const spanCancel = document.createElement('span');
        const spanDelete = document.createElement('span');

        const filterName = document.createElement('input');
        const filterColor = document.createElement('input');
        let filterCount = 0;

        buttonSave.disabled = pristine;

        editContainer.className = 'row property';
        controlsContainer.className = 'row property';

        const enableControls = (event) => {
            buttonSave.disabled = false;
            buttonCancel.disabled = false;
            buttonDelete.disabled = false;
        };

        filterName.placeholder = 'Name';
        filterName.type = 'text';
        filterName.id = 'ruruki-cf-name';
        filterName.onkeyup = enableControls;

        filterColor.placeholder = 'Color';
        filterColor.type = 'text';
        filterColor.id = 'ruruki-cf-color';
        filterColor.onkeyup = enableControls;
        filterColor.value = '#00c';

        const addFilterRow = (filter, linkType) => {
            if (linkType) {
                const divider = document.createElement('h1');

                divider.className = 'ruruki-cp-divider';
                divider.id = `ruruki-cf-link-${filterCount}`;
                divider.value = linkType;
                divider.title = 'Click to change link type or right click to delete';
                divider.appendChild(document.createTextNode(linkType));

                divider.onclick = event => {
                    let innerValue = divider.value;

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

                divider.oncontextmenu = event => {
                event.preventDefault();
                    try {
                        filterSeq.remove(filter);
                    } catch (err) {}

                    this._createFilteringComponent(filterSeq, false);
                };

                editContainer.appendChild(divider);
            }

            const text = document.createElement('input');
            text.id = `ruruki-cf-value-${filterCount++}`;
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

        buttonAddFilter.onclick = () => {
            addFilterRow('', 'AND');
        };

        buttonSave.type = 'button';
        buttonSave.className = 'btn btn-xs btn-success';
        spanSave.className = 'glyphicon glyphicon-ok';
        buttonSave.appendChild(spanSave);
        buttonSave.title = 'Save';
        const self = this;
        buttonSave.onclick = () => {
            let regex;
            let link;

            const newFilter = new CustomFilter();

            newFilter.name = document.getElementById('ruruki-cf-name').value;
            newFilter.color = document.getElementById('ruruki-cf-color').value;

            // Very first filter has no link
            newFilter.add(document.getElementById('ruruki-cf-value-0').value);

            for (let i = 1; i < filterCount; i++) {
                regex = document.getElementById(`ruruki-cf-value-${i}`).value;
                link = document.getElementById(`ruruki-cf-link-${i}`).value;
                newFilter.add(regex, link);
            }

            if (filterSeq) delete customFilters[filterSeq.name];
            customFilters[newFilter.name] = newFilter;

            self._updateFilter({
                    filterName: newFilter.name,
                    id: newFilter.id,
                    results: null
                },
                customFilters);

            RurukiEye._asyncFetchDataMatchingFilters(newFilter, filterEndpoint, data => {
                self._updateFilter(data, customFilters);
            });

            self._redrawCustomFilters();
            this._createFilteringComponent(null);
        };

        buttonCancel.type = 'button';
        buttonCancel.className = 'btn btn-xs btn-warning';
        spanCancel.className = 'glyphicon glyphicon-remove';
        buttonCancel.appendChild(spanCancel);
        buttonCancel.title = 'Cancel editing';

        buttonCancel.onclick = () => {
            this._createFilteringComponent(null);
        };

        buttonDelete.type = 'button';
        buttonDelete.className = 'btn btn-xs btn-danger';
        spanDelete.className = 'glyphicon glyphicon-trash';
        buttonDelete.appendChild(spanDelete);
        buttonDelete.title = 'Delete';

        buttonDelete.onclick = () => {
            delete customFilters[filterSeq.name];
            self._redrawCustomFilters();
            this._createFilteringComponent(null);
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

    _redrawCustomFilters() {
        const container = document.getElementById('inspector-custom-filters');
        container.innerHTML = '';

        for (let key in this.customFilters) {
            const filter = this.customFilters[key];
            let title = filter.name;

            const li = document.createElement('li');
            const tag = document.createElement('label');
            const span = document.createElement('span');
            const strong = document.createElement('strong');
            const tagIcon = document.createElement('span');

            filter.forEach((f, t) => {
                if (t) title += ` ${t}`;
                title += ` ${f}`;
            });

            tagIcon.className = 'glyphicon glyphicon-warning-sign';
            tagIcon.style.display = 'none';
            tagIcon.id = `custom-filter-icon-${filter.id}`;

            strong.appendChild(document.createTextNode(`${key}  `));
            strong.appendChild(tagIcon);
            strong.dataset.filterName = key;

            span.className = 'label';
            span.style.backgroundColor = filter.color;
            span.dataset.filterName = key;
            span.appendChild(strong);

            tag.className = 'inspector property';
            tag.dataset.filterName = key;
            tag.id = `custom-filter-${filter.id}`;
            tag.appendChild(span);

            if (!filter.result) {
                tag.className += ' disabled';
            }

            li.dataset.filterName = key;
            li.title = title;
            li.appendChild(tag);

            li.addEventListener('mouseover', this.highlightByFilter.bind(this));
            li.addEventListener('mouseout', this._generateWrapperContext(this.clearHighlight));
            li.addEventListener('click', this._editFilter(filter.name));

            container.appendChild(li);

            console.log('key', key, 'filter', filter);
        }
    }

    /**
     * Redraws inspector to make it offer controls for the elements currently
     * available in the graph. Ie. visibility toggles.
     */
    _redrawInspector() {
        const self = this;
        const clearHighlight = this._generateWrapperContext(this.clearHighlight);
        ['edge', 'vertex'].forEach(entityType => {
            const container = document.getElementById(`inspector-toggle-${entityType}`);
            container.innerHTML = '';

            this.processedData.labels[entityType].forEach(each => {
                const li = document.createElement('li');
                li.innerHTML = `<label class="inspector property">${this.processedData.labels.tags[entityType][each]}</label>`;
                const label = li.firstChild;
                label.addEventListener('mouseout', clearHighlight);
                label.addEventListener('mouseover', self.highlightByType.bind(self, entityType, each));
                container.appendChild(li);

                if (self.inspector.status[entityType][each] === false) {
                    label.classList.add('disabled');
                }

                label.addEventListener('click', () => {
                    label.classList.toggle('disabled');
                    self.inspector.status[entityType][each] = !label.classList.contains('disabled');
                    self._updateElementsVisibility();
                });
            });
        });
    }

    /**
     * Updates INFO field (upper left corner).
     */
    _updateInfo() {
        for (let elem of this.info) {
            elem.innerHTML = `Showing <i>${this.links.length}</i> edges linked to <i>${this.nodes.length}</i> vertices`;
        }
    }

    /**
     * Called after every iteration of the simulation. Great place to
     * reposition and/or redraw your graph elements.
     */
    _tick(self) {
        const translate = d => {
            if (d.id == self.baseNodeId && d.clean === true) {
                d.x = self.width / 2;
                d.y = self.height / 2;
            }

            return 'translate(' + d.x + ',' + d.y + ')';
        };

        if (self.graphIsBounded) {
            self.vertex.attr('cx', d => {
                if (d.id === self.baseNodeId && d.clean === true) {
                    return (d.x = d.px = self.width / 2);
                }

                return (
                    d.x = Math.max(
                        self._calcRadius(d),
                        Math.min(self.width - self._calcRadius(d), d.x)
                    )
                );
            });
            self.vertex.attr('cy', d => {
                if (d.id === self.baseNodeId && d.clean === true) {
                    return (d.y = d.py = self.height / 2);
                }

                return (
                    d.y = Math.max(
                        self._calcRadius(d),
                        Math.min(self.height - self._calcRadius(d), d.y)
                    )
                );
            });
        } else {
            self.vertex.attr('transform', translate);
        }

        self.text.attr('transform', translate);
        self.edge.attr("d", d => {
            const diffX = d.target.x - d.source.x;
            const diffY = d.target.y - d.source.y;
            const pathLength = Math.sqrt(diffX ** 2 + diffY ** 2);
            const offsetX = (diffX * self._calcRadius(d.target)) / pathLength;
            const offsetY = (diffY * self._calcRadius(d.target)) / pathLength;

            return `M${d.source.x},${d.source.y}L${(d.target.x - offsetX) || 0},${(d.target.y - offsetY) || 0}`;
        });
    }

    /**
     * Calculate radius for given node (based on the amount of connections it
     * has).
     */
    _calcRadius(d) {
        return Math.min(
            5 + Math.max(d.in_connections, d.out_connections) * 0.4,
            MAX_RADIUS
        );
    }

    /**
     * Pins node to screen (simulation will no longer force it's position).
     */
    pinNode(self, d) {
        if (d3.event !== null && (d3.event.sourceEvent.ctrlKey || self.config.pin === false)) return;

        if (d.id === self.baseNodeId && d.clean === true) {
            delete d.clean;
        }

        if (d) {
            const selected = self.vertex[0].filter(v=>v.__data__.id === d.id)[0];
            d3.select(selected).classed('fixed', d.fixed = true);
        }
    }

    /**
     * Unpins node from screen (simulation may force it's position from this
     * moment on).
     */
    unpinNode(self, d) {
        d3.event.preventDefault();

        if (self.config.pin === false) return;

        if (d.id === self.baseNodeId && d.clean === true) {
            delete d.clean;
        }

        if (d) {
            d3.select(this).classed('fixed', d.fixed = false);
        }
    }

    /**
     * _generateWrapperContext - wraps a function such that the first argument passed to
     * it will always be the 'this' that this method is called with. This has been done
     * as d3 binds the 'this' context of callbacks when the true 'this' context (of the
     * ES6 class) is actually needed.
     * Due to the way d3 works, a typical .bind(this) operation is not sufficient - see
     * the inner workings of d3.
     *
     * @param  {function} func the function to wrap
     * @return {function}      a function which the first argument will always be 'this'
     */
    _generateWrapperContext(func) {
        const self = this;
        return function(...args) {
            func.apply(this, [self].concat(args))
        }
    }

    /**
     * Triggered on mouse click event on a vertex. Currently traps:
     *
     *   - Middle button: opens clicked node in a new tab
     */
    _mouseClicked(self, d) {
        if (d3.event.ctrlKey) {
            d3.event.preventDefault();
            const highlightVertex = () => {
                self.svg.selectAll('.edge').classed('highlighted', p => p && (p.source === d || p.target === d));
                d3.select(this).classed('highlighted', true);
                d3.select(`#vertex-text-${d.id}`).classed('highlighted', true);
            };
            const unhighlightVertex = () => {
                self.svg.selectAll('.highlighted').classed('highlighted', false);
            };
            self.emit('selected', d, highlightVertex, unhighlightVertex);
            return;
        }

        if (self.config.openNewTab === false) return;
        if (d && d3.event.button === 1) {
            win = window.open(`/vertices/${d.id}`, '_blank');
        }
    }

    /**
     * Triggered on mouse click event on an edge. Currently traps:
     *   - Middle button: opens clicked node in a new tab
     */
    _mouseClickedEdge(self, d) {
        if (d3.event.ctrlKey) {
            d3.event.preventDefault();
            const highlightEdge = () => {
                self.svg.selectAll('.edge').classed('highlighted', p => p === d);
                self.svg.selectAll('.vertex').classed('highlighted', p => p === d.source || p === d.target);
            };
            const unhighlightEdge = () => {
                self.svg.selectAll('.highlighted').classed('highlighted', false);
            };
            self.emit('selected', d, highlightEdge, unhighlightEdge);
            return;
        }
    }

    /**
     * Triggered on mouseOver event: highlights EDGES by adding "highlighted"
     * class and show element information in the "detail" label.
     */
    _mouseOverEdge(self, d) {
        if (d.isVisible !== true) {
            return;
        }

        self.svg.selectAll('.edge').classed('highlighted', p => p === d);
        self.svg.selectAll('.vertex').classed('highlighted', p => p === d.source || p === d.target);
        for (let elem of self.detail) {
            elem.innerHTML = d.info;
        }
    }

    /**
     * Triggered on mouseOver event: highlights VERTICES by adding "highlighted"
     * class and show element information in the "detail" label.
     */
    _mouseOverNode(self, d) {
        if (d.isVisible !== true) {
            return;
        }
        self.nodeUnderMouse = d;
        self.svg.selectAll('.edge').classed('highlighted', p => p && (p.source === d || p.target === d));
        self.svg.selectAll('.vertex').classed('highlighted', p => p === d);
        for (let elem of self.detail) {
            elem.innerHTML = d.info;
        }
    }

    /**
     * De-emphasize element by removing the "highlighted" class and wipes the
     * "detail" label clean.
     */
    _mouseOut(self) {
        delete self.nodeUnderMouse;
        self.svg.selectAll('.highlighted').classed('highlighted', false);
        for (let elem of self.detail) {
            elem.innerHTML = '';
        }
    }

    /**
     * Update visibility of all currently active elements based on
     * inspector's status.
     *
     * @see ForceGraph#inspector
     */
    _updateElementsVisibility() {
        const self = this;
        this.nodes.forEach(each => {
            if (self.inspector.status[each.type][each.label] === void(0)) {
                self.inspector.status[each.type][each.label] = true;
            }

            each.isVisible = self.inspector.status[each.type][each.label];

            if (each.id == self.baseNodeId) { each.isVisible = true; }
        });

        this.links.forEach(each => {
            if (self.inspector.status[each.type][each.label] === void(0)) {
                self.inspector.status[each.type][each.label] = true;
            }

            each.isVisible = self.inspector.status[each.type][each.label];

            if (each.source.isVisible === false ||
                each.target.isVisible === false) {
                each.isVisible = false;
            }

            if (each.isVisible === false) {
                if (each.source.visiblyConnectedEdges.includes(each.id)) {
                    each.source.visiblyConnectedEdges.splice(
                        each.source.visiblyConnectedEdges.indexOf(each.id),
                        1
                    );
                }

                if (each.target.visiblyConnectedEdges.includes(each.id)) {
                    each.target.visiblyConnectedEdges.splice(
                        each.target.visiblyConnectedEdges.indexOf(each.id),
                        1
                    );
                }
            } else {
                if (!each.source.visiblyConnectedEdges.includes(each.id)) {
                    each.source.visiblyConnectedEdges.push(each.id);
                }

                if (!each.target.visiblyConnectedEdges.includes(each.id)) {
                    each.target.visiblyConnectedEdges.push(each.id);
                }
            }

            if (each.source.visiblyConnectedEdges.length === 0 ||
                each.target.visiblyConnectedEdges.length === 0) {
                each.isVisible = false;
            }

            if (each.source.id == self.baseNodeId) { each.source.isVisible = true; }
            if (each.target.id == self.baseNodeId) { each.target.isVisible = true; }
        });

        d3.selectAll('.vertex').attr('opacity', d => {
            if (d.id === self.baseNodeId) { return 1; }

            if (d.visiblyConnectedEdges.length === 0 || d.isVisible === false) {
                return 0;
            } else {
                return 1;
            }
        });

        d3.selectAll('.edge').attr('opacity', d => !d || d.isVisible === true ? 1 : 0);
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
    collapseVertex(d) {
        if (this.config.expand === false) return;

        let affectedVertices = 0;
        let affectedEdges = 0;
        if (d.id === this.baseNodeId) {
            const self = this;
            this.links.forEach(each => {
                if (each.source.parentVertexId === d.id) {
                    affectedVertices += RurukiEye._deleteChildrenFromCollection(
                        each.source.id, self.nodes, this.processedData.vertices.raw
                    );
                    affectedEdges += RurukiEye._deleteChildrenFromCollection(
                        each.source.id, self.links, this.processedData.edges.raw
                    );
                }

                if (each.target.parentVertexId === d.id) {
                    affectedVertices += RurukiEye._deleteChildrenFromCollection(
                        each.target.id, self.nodes, this.processedData.vertices.raw
                    );
                    affectedEdges += RurukiEye._deleteChildrenFromCollection(
                        each.target.id, self.links, this.processedData.edges.raw
                    );
                }
            });
        }
        else {
            affectedVertices += RurukiEye._deleteChildrenFromCollection(
                d.id, this.nodes, this.processedData.vertices.raw
            );
            affectedEdges += RurukiEye._deleteChildrenFromCollection(
                d.id, this.links, this.processedData.edges.raw
            );
        }

        console.log(
            affectedVertices,
            'vertices deleted',
            affectedEdges,
            'edges deleted'
        );

        this.update();
    }

    /**
     * Changes the level of detail for the clicked node.
     * If SHIFT key is pressed during the event: collapseVertex, otherwise:
     * expandVertex.
     *
     * @see collapseVertex
     * @see expandVertex
     */
    _changeNodeDetailLevel(self, d) {
        d3.event.preventDefault();

        if (d3.event.shiftKey) {
            self.collapseVertex(d);
        } else if (d3.event.ctrlKey) {
            if (self.config.reCenter === false) return;
            window.location.reload();
        } else {
            self.expandVertex(d);
        }
    }

    /**
     * Queries API for information about the given vertex (?level=0 will be
     * used in the query) and add new elements to active graph.
     *
     * @param {dict} d - Node object being expanded (parent!).
     */
    expandVertex(d) {
        if (this.config.expand === false) return;

        for (let elem of this.info) {
            elem.innerHTML = `Loading data for node <i> ${d.id}</i>...`;
        }

        const expandListenerResult = this.emit('expand', d);
        if (expandListenerResult !== void(0)) {
            return;
        }

        const self = this;
        RurukiEye._asyncFetchVertexDataById(d.id, this.expandEndpoint, newData => {
            self.processedData = RurukiEye._processData(newData, self.processedData, d);

            console.log(
                self.processedData.vertices.diff.length,
                'vertices added',
                self.processedData.edges.diff.length,
                'edges added'
            );

            self.processedData.vertices.diff.forEach(each => self.nodes.push(each));
            self.processedData.edges.diff.forEach(each => self.links.push(each));

            self.redrawGraph();
            self._updateElementsVisibility();
            self._redrawInspector();

            self.force.start();
        });
    }

    /**
     * update - Updates the graph after external manipulation.
     */
    update() {
        const matcher = d => d.type ? d.id : d.__data__.id;
        this.text = this.text.data(this.nodes, matcher);
        this.edge = this.edge.data(this.links);
        this.vertex = this.vertex.data(this.nodes, matcher);

        this.text.exit().remove();
        this.edge.exit().remove();
        this.vertex.exit().remove();

        this._updateInfo();
        this.force.start();
        this._redrawInspector();
    }

    /**
     * addEdge - Adds an edge to the graph.
     *
     * @param  {object} e the edge to add
     */
    addEdge(e) {
        const newData = {
            vertices: [],
            edges: [e]
        };
        this.processedData = RurukiEye._processData(newData, this.processedData);
        this.processedData.vertices.diff.forEach(each => this.nodes.push(each));
        this.processedData.edges.diff.forEach(each => this.links.push(each));

        this.redrawGraph();
        this._updateElementsVisibility();
        this._redrawInspector();

        this.force.start();
    }

    /**
     * Removes a vertex and all of its assoicated edges from the graph.
     *
     * @param {dict} d - Node object to be removed.
     */
    removeVertex(d) {
        if (d.id === this.baseNodeId) {
            throw new Error('Cannot delete starting node');
        }

        // remove edges
        let affectedEdges = 0;
        for (let i = 0; i < this.links.length; i++) {
            const link = this.links[i];
            if (link.source.id === d.id || link.target.id === d.id) {
                this.links.splice(i, 1);
                delete this.processedData.edges.raw[d.id];
                i--;
                affectedEdges++;
            }
        }

        // remove vertex
        const ind = this.nodes.indexOf(d);
        this.nodes.splice(ind, 1);
        delete this.processedData.vertices.raw[d.id];

        console.log(1, 'vertex deleted', affectedEdges, 'edges deleted');

        this.update();
    }

    /**
     * Performs AJAX request for Vertex information based on Verted ID.
     *
     * @param {int} vertexId - Id of the vertex
     * @param {string} endpoint - Server/endpoint for the expand querying
     * @param {func} callback - Callback which the result will be passed to
     */
    static _asyncFetchVertexDataById(vertexId, endpoint, callback) {
        RurukiEye.getJSON(`${endpoint}/${vertexId}`, callback);
    }

    /**
     * Fetches scalar color for the specific node type.
     *
     * @param {string} label - Label or unique identifier of the node
     * @param {string} type - Type of the node: 'edge' or 'vertex'
     */
    static _getColor(label, type) {
        if (!colourPool) {
            colourPool = d3.scale.category10();
        }
        return type == 'vertex' ? colourPool(label) : '#555';
    }

    /**
     * Darkens or lightens a hexadecimal color.
     *
     * @param {string} origColor - Color your want to transform
     * @param {float} amount - Amount of transformation you want to apply to the
     *                         color. Positive values will lighten and negative
     *                         values will darken. Valid range is from -1 to 1
     */
    static _transformColor(origColor, amount) {
        let newColor = '#';
        origColor = origColor.substr(1, origColor.length);
        for (let i = 0; i < 3; i++) {
            let component = parseInt(origColor.substr(i * 2, 2), 16);
            component = Math.round(Math.min(Math.max(0, component + (component * amount)), 255));
            newColor += component.toString(16);
        }
        return newColor;
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
    static _deleteChildrenFromCollection(id, container, dictionary) {
        const ids = [id];
        let affectedItems = 0;
        let nid = null;
        let i;

        const suggestParent = (each) => {
            nid = container[i][each].id;
            if (nid !== id && ids.indexOf(nid) === -1 &&
                container[i][each].parentVertexId !== null) {
                ids.push(nid);
            }
        }

        while(ids.length > 0) {
            id = ids.pop();
            for (i = 0; i < container.length; i++) {
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
    static _processData(data, preData, parentVertex) {
        if (preData === void(0)) {
            preData = { vertices: {}, edges: {} };
        }

        const verticesById = preData.vertices.raw || {};
        const edgesById = preData.edges.raw || {};
        const vertices = [];
        const edges = [];
        const labels = preData.labels || {
            vertex: [], edge: [], tags: { vertex: {}, edge: {} }
        };
        const newVertices = [];
        const newEdges = [];

        data.vertices.forEach((each) => {
            if (verticesById[each.id] !== void(0)) {
                return;
            }

            const name = each.properties.name || each.id;
            verticesById[each.id] = {
                type: 'vertex',
                id: each.id,
                name: name,
                label: each.label,
                color: RurukiEye._transformColor(RurukiEye._getColor(each.label, 'vertex'), 0.3),
                borderColor: RurukiEye._getColor(each.label, 'vertex'),
                in_connections: parseInt(each.metadata.in_edge_count) || 0.0,
                out_connections: parseInt(each.metadata.out_edge_count) || 0.0,
                visiblyConnectedEdges: [],
                isVisible: true,
                parentVertexId: parentVertex ? parentVertex.id : null,
                raw: each
            };

            if (labels.tags.vertex[each.label] === void(0)) {
                labels.tags.vertex[each.label] = RurukiEye._createTagHTML(verticesById[each.id]);
            }
            verticesById[each.id].info = `${labels.tags.vertex[verticesById[each.id].label]}${each.id} {${RurukiEye._dictToStr(each.properties)}}`;

            if (verticesById[each.id].parentVertexId === each.id) {
                // OMG, but why? Fear not Jenda, I'll explain... only the root node
                // deserves to be addressed as "root node"!
                verticesById[each.id].parentVertexId = null;
            }

            if (labels.vertex.indexOf(each.label) === -1) {
                labels.vertex.push(each.label);
            }

            newVertices.push(verticesById[each.id]);
        });

        data.edges.forEach((each) => {
            if (edgesById[each.id] !== void(0)) {
                return;
            }

            const source = verticesById[each.head_id];
            const target = verticesById[each.tail_id];

            edgesById[each.id] = {
                type: 'edge',
                id: each.id,
                source: source,
                target: target,
                label: each.label,
                color: RurukiEye._getColor(null, 'edge'),
                properties: each.properties,
                isVisible: true,
                parentVertexId: parentVertex ? parentVertex.id : null,
                tag: labels.tags.edge[each.label],
                raw: each
            };

            if (labels.tags.edge[each.label] === void(0)) {
                labels.tags.edge[each.label] = RurukiEye._createTagHTML(edgesById[each.id]);
            }
            edgesById[each.id].info = `(${source.name}) ${labels.tags.edge[edgesById[each.id].label]} →  (${target.name}) {${RurukiEye._dictToStr(each.properties)}}`;

            newEdges.push(edgesById[each.id]);

            if (labels.edge.indexOf(each.label) == -1) {
                labels.edge.push(each.label);
            }
        });

        for (let key in verticesById) {
            vertices.push(verticesById[key]);
        }

        for (let key in edgesById) {
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
    * Creates a Bootstrap label with custom color for the given node
    *
    * @param {dict} node - A graph node representation
    * @returns {string}
    */
    static _createTagHTML(node) {
        return `<span class="label" style="background-color:${node.color};"><strong>${node.label.toUpperCase()}</strong></span> `;
    }

    /**
    * Stringify a dictionary highlighting (strong) the keys.
    *
    * @param {dict} dict - Dictionary to be stringified
    * @param {string} string - String or character you want to use as separator
    * @returns {string} - A string containing key=value jointed by the separator
    */
    static _dictToStr(dict, separator) {
        if (separator === void(0)) {
            separator = ',';
        }
        separator += ' ';
        return Object.keys(dict).map(key =>
            `<span class="info-properties-key">${key}</span>: <span class="info-properties-value">${
            typeof(dict[key]) === 'object' ? JSON.stringify(dict[key]) : dict[key]}</span>`).join(' ');
    }

    /**
    * Performs AJAX request for filtering.
    *
    * @param {string} filter - Filtering queryString
    * @param {string} endpoint - Server/endpoint for data querying
    * @param {func} callback - Callback which the result will be passed to
    */
    static _asyncFetchDataMatchingFilters(filter, endpoint, callback) {
        RurukiEye.getJSON(`${endpoint}/?filter=${JSON.stringify(filter.serialize())}`, data => {
            callback({
                'filterName': filter.name,
                'results': data
            });
        }, jqxhr => {
            callback({
                'filterName': filter.name,
                'results': null,
                'status': jqxhr.status,
                'error': jqxhr.statusText
            });
        });
    }

    /**
     * ajaxRequest - performs an asynchronous javascript XMLHttpRequest to an endpoint.
     *
     * @param  {string}   url             the url to retreive
     * @param  {string}   accept          the expected encoding for the response - set HTTP Accept header
     * @param  {function} success         a callback which will be called on success. Passed the data received
     * @param  {function} failure         a callback which will be called on failure (optional). Passed the XHR
     * @param  {string}   data            data to send as part of a post request (optional)
     * @param  {string}   dataContentType MIME of the post data (optional)
     */
    static ajaxRequest(url, accept, success, failure, data, dataContentType) {
        const xmlhttp = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject("Microsoft.XMLHTTP");
        xmlhttp.onreadystatechange = () => {
            if (xmlhttp.readyState == 4) {
                if (xmlhttp.status >= 100 && xmlhttp.status < 400) {
                    success(xmlhttp);
                }
                else if (failure) {
                    failure(xmlhttp);
                }
            }
        };
        if (data) {
            xmlhttp.open('POST', url, true);
            xmlhttp.setRequestHeader('Content-Type', dataContentType || 'application/x-www-form-urlencoded');
        }
        else {
            xmlhttp.open('GET', url, true);
        }
        xmlhttp.withCredentials = true;
        xmlhttp.setRequestHeader('Accept', accept);
        xmlhttp.send(data);
    }

    /**
     * getJSON - non-JQuery implementation of getJSON. Created due to long term plans to remove JQuery.
     *
     * @param  {string} url the url to fetch
     * @param  {type} success successfull callback
     * @param  {type} failure failure callback
     */
    static getJSON(url, success, failure) {
        RurukiEye.ajaxRequest(url, 'application/json', xmlhttp => {
            success(JSON.parse(xmlhttp.responseText));
        },
        failure);
    };

    /**
    * Loads an HTML dom element from a remote location syncronously.
    *
    * @param {string} url - The url to load the remote HTML resource from.
    * @param {fucntion} elementCallback - The callback to fire when data has been loaded,
    * passing the html as a single element.
    */
    static loadHTML(url, elementCallback) {
        RurukiEye.ajaxRequest(url, 'text/html', xmlhttp => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML= xmlhttp.responseText; // avoid wrapping in <body> tags which the real parser will do

            // using innerHTML or the DOM parser doesnt execute scripts, therefore we need to manually add the scripts
            const scripts = [];
            const cn = wrapper.getElementsByTagName('*');
            for (let i = 0; i < cn.length; i++) {
                if (cn[i].nodeName && cn[i].nodeName.toLowerCase() === 'script' && (!cn[i].type || cn[i].type.toLowerCase() === 'text/javascript')) {
                    scripts.push(cn[i].parentNode ? cn[i].parentNode.removeChild(cn[i]) : cn[i]);
                }
            }
            elementCallback(wrapper.children.length > 1 ? wrapper : wrapper.firstChild);
            for (let scr of scripts) {
                const data = scr.text || scr.textContent || scr.innerHTML || '';
                const src = scr.src || '';
                const head = document.getElementsByTagName('head')[0] || document.documentElement;
                const script = document.createElement('script');
                script.src = src;
                script.appendChild(document.createTextNode(data));
                head.insertBefore(script, head.firstChild);
            }
        });
    }

    /**
     * Add help box to parent element containing information about the available
     * actions based on the configuration utilized when instantiating RurukiEye
     *
     * @param {element} element - Element to append the help box to
     * @param {dict} config - Ruruki configuration
     */
    _attachHelpMenu(element, config) {
        const addItem = (command, description) => {
            const li = document.createElement('li');
            li.innerHTML = '<strong>' + command + '</strong> ' + description;
            ul.appendChild(li);
        }

        const help = document.createElement('div'),
            ul = document.createElement('ul');

        if (config.pin !== false) {
            addItem('Left Click', 'to pin and/or move a node around');
            addItem('Right Click', 'to unpin a node');
        }
        addItem('Ctrl + Left Click', 'to select a node or edge');

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

        if (config.dragNew !== false) {
            addItem('Ctrl + Drag Between Nodes', 'to create a new edge');
        }

        if (config.controlPanel !== false) {
            addItem('\\', 'to toggle the control panel');
        }
        addItem('?', 'to toggle this help');

        help.className = 'help';
        ul.className = 'list-unstyled';
        help.appendChild(ul);
        element.appendChild(help);

        this.on('keypress', e => {
            if (e.charCode === 63 || e.charCode === 47) {
                for (let elem of document.getElementsByClassName('help')) {
                    elem.classList.toggle('deactivated');
                }
                return false;
            }
        });
    }

    /**
    * Add box to parent element containing controllers to interact with the
    * graph.
    *
    * @param {element} element - Element to append the control panel to
    */
    _attachControlPanel(element) {
        let loadedCount = 0;
        const templates = {
            controlPanel: '/templates/control-panel/control-panel.html',
            tabs: '/templates/control-panel/tab.html',
            preDefinedFilters: '/templates/control-panel/pre-defined-filters.html',
            customDefinedFilters: '/templates/control-panel/custom-defined-filter-editor.html',
            propertiesEditor: '/templates/control-panel/properties-editor.html'
        };

        const self = this;
        const complete = () => {
            let first = true;
            const createTab = (innerHTML, icon, name, title, checked) => {
                const tab = templates.tabs.cloneNode(true);
                tab.children[0].id += name;
                tab.children[0].checked = !!checked;
                tab.children[1].attributes.for.value += name;
                tab.children[1].title = title;
                tab.children[1].children[0].className += icon;
                tab.children[2].id += name;
                tab.children[2].appendChild(innerHTML);
                return tab;
            };

            const tabsNode = templates.controlPanel.querySelector('.ruruki-cp-tabs');
            tabsNode.appendChild(createTab(templates.preDefinedFilters, 'tags', 'pre', 'Pre Defined Filters', true));
            tabsNode.appendChild(createTab(templates.customDefinedFilters, 'search', 'cus', 'Custom Filters'));
            tabsNode.appendChild(createTab(templates.propertiesEditor, 'cog', 'prop', 'Properties Editor'));

            element.appendChild(templates.controlPanel);
            const expander = templates.controlPanel.querySelector('.inspector-expander').children[0];
            const controlPanel = templates.controlPanel.querySelector('.ruruki-cp');
            const ctrlPanelToggle = () => {
                if (controlPanel.style.visibility === 'hidden') {
                    expander.className = 'glyphicon glyphicon-resize-small';
                    controlPanel.style.visibility = 'visible';
                } else {
                    expander.className = 'glyphicon glyphicon-resize-full';
                    controlPanel.style.visibility = 'hidden';
                }
            };
            expander.onclick = ctrlPanelToggle;
            this.on('keypress', e => {
                if (e.charCode === 92) {
                    ctrlPanelToggle();
                    return false;
                }
            });

            self._createFilteringComponent(null);
            this._redrawCustomFilters();
            self._redrawInspector();
        };

        for (let property in templates) {
            RurukiEye.loadHTML(templates[property], elem => {
                templates[property] = elem;
                loadedCount++;
                if (Object.keys(templates).length === loadedCount) {
                    complete();
                }
            });
        }
    }

    /**
    * Add couple of information divs to parent element, responsible for showing
    * information about how many nodes are on screen and detailed information
    * about the element your cursor is hovering over.
    *
    * @param {element} element - Element to append the info panel to
    */
    static _attachInfoPanel(element) {
        const info = document.createElement('div'),
            detail = document.createElement('div');

        info.className = 'ruruki-info info';
        info.appendChild(document.createTextNode('Loading info...'));
        detail.className = 'ruruki-info detail';
        detail.appendChild(document.createTextNode('Loading detail...'));

        element.appendChild(info);
        element.appendChild(detail);
    }

    /**
     * _attachCreateNewDialog - Adds a hidden create new dialog to the DOM, responsible
     * for adding new edges to the graph.
     *
     * @param  {element} parentElement the element to attach the dialog to.
     * @param  {type} createNewModalLocation the URL to attain the dialog from.
     */
    static _attachCreateNewDialog(parentElement, createNewModalLocation) {
        RurukiEye.loadHTML(createNewModalLocation, modalTemplate => {
            parentElement.appendChild(modalTemplate);
        });
    }
}
