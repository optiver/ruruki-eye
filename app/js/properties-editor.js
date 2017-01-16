(() => {
    const propertiesEditorContainer = document.getElementById('properties-editor-container');

    /*
        Add node dropdown.
    */
    if (window.rurukiEye.config.propertiesEditor.addNew !== false) {
        document.getElementById('properties-editor-node-add').style.display = 'block';

        let propertiesEditorListData = null;
        RurukiEye.getJSON('/vertices/list', data => propertiesEditorListData = data);

        const propertiesEditorInputNode = propertiesEditorContainer.querySelector('#properties-editor-node-add-input');
        const propertiesEditorDropdown = propertiesEditorContainer.querySelector('#properties-editor-node-add-dropdown');
        const propertiesEditorDropdownContainer = propertiesEditorContainer.querySelector('#properties-editor-node-add-dropdown-container');
        const propertiesEditorAddClear = propertiesEditorContainer.querySelector('#properties-editor-add-clear');
        const propertiesEditorAddAdd = propertiesEditorContainer.querySelector('#properties-editor-add-add');
        let cursorX = 0;
        let cursorY = 0;

        const show = () => {
            if (!propertiesEditorListData) {
                return; // prevent race
            }
            propertiesEditorDropdown.options.length = 0;
            propertiesEditorDropdownContainer.style.display = 'block';
            const textFilter = propertiesEditorInputNode.value;
            const regex = new RegExp(textFilter.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
            let added = 0;
            for(let i = 0; i < propertiesEditorListData.length; i++){
                if(propertiesEditorListData[i].processName.match(regex)){
                    addValue(propertiesEditorListData[i]);
                    added++;
                }
            }
            propertiesEditorAddAdd.disabled = added === 0;
        }

        const hide = () => {
            const activeElement = document.elementFromPoint(cursorX, cursorY);
            if (activeElement === propertiesEditorInputNode || activeElement === propertiesEditorDropdown || activeElement.tagName.toLowerCase() === 'option') {
                return;
            }
            propertiesEditorDropdownContainer.style.display = 'none';
        }

        const addValue = (val) => {
            const createOptions = document.createElement('option');
            propertiesEditorDropdown.appendChild(createOptions);
            createOptions.text = val.processName + ' (' + val.hostName.substr(0, val.hostName.indexOf('.')) + ')';
            createOptions.value = val.id;
        }

        const setVal = (target) => {
            const selectedValue = target.target.value;
            const res = propertiesEditorListData.find(val => val.id == selectedValue);
            propertiesEditorInputNode.value = res.processName;
            propertiesEditorDropdownContainer.style.display = 'none';
        }

        const clear = () => {
            propertiesEditorInputNode.value = '';
            propertiesEditorAddAdd.disabled = true;
        }

        const add = () => {
            const nodeName = propertiesEditorInputNode.value;
            clear();
            const expandNode = propertiesEditorListData.filter(v => v.processName === nodeName)[0];
            window.rurukiEye.expandVertex(expandNode);
        }

        document.addEventListener('mousemove', e => {
            // for some reason there is no way to query this outside of an event, go figure
            cursorX = e.pageX;
            cursorY = e.pageY;
        });
        propertiesEditorInputNode.addEventListener('keyup', show);
        propertiesEditorInputNode.addEventListener('focus', show);
        propertiesEditorInputNode.addEventListener('blur', hide);
        propertiesEditorDropdown.addEventListener('click', setVal);
        propertiesEditorDropdown.addEventListener('blur', hide);
        propertiesEditorAddClear.addEventListener('click', clear);
        propertiesEditorAddAdd.addEventListener('click', add);
    }

    /*
        Saving changes to edges
    */
    const saveEdgeChange = (newDestNode) => {
        const post = {
            edgeId: selection.id,
            newDestNodeId: parseInt(newDestNode.value)
        };

        const err = () => {
            alert('Could not save change to edge.');
        };

        RurukiEye.ajaxRequest('/vertices/updateEdge', 'application/json', data => {
            if (!JSON.parse(data.responseText).success) {
                return err();
            }
            selection.target = target;
            window.rurukiEye.update();
        }, err, JSON.stringify(post), 'application/json');
    };

    /*
        Vertex/edge selection
    */
    const propertiesEditorSelectContainer = propertiesEditorContainer.querySelector('#properties-editor-select-container');
    const propertiesEditorSelectProptable = propertiesEditorContainer.querySelector('#properties-editor-select-proptable');
    const propertiesEditorSelectClearBtn = propertiesEditorContainer.querySelector('#properties-editor-select-clear');
    const propertiesEditorSelectDeleteBtn = propertiesEditorContainer.querySelector('#properties-editor-select-delete');
    const propertiesEditorSelectNoSelect = propertiesEditorContainer.querySelector('#properties-editor-select-noselect');
    const propertiesEditorSelectRemoveBtn = propertiesEditorContainer.querySelector('#properties-editor-select-remove');

    let selection = null,
        selectionHighlight = null,
        selectionUnhighlight = null,
        target = null;

    const createRow = (property, value) => {
        const row = document.createElement('tr');
        const label = document.createElement('td');
        label.innerHTML = property;
        label.style.fontStyle = 'italic';
        label.style.fontWeight = 'bold';
        label.style.display = 'flex';
        label.style.overflowX = 'auto';
        label.style.borderBottom = 'solid 1px lightgray';
        row.append(label);
        const val = document.createElement('td');
        val.innerHTML = value;
        val.style.display = 'block';
        val.style.overflowX = 'auto';
        row.append(val);
        return row;
    };

    const generateVertexProperties = () => {
        propertiesEditorSelectProptable.innerHTML = '';
        const properties = selection.raw.properties;
        for (let property in properties) {
            let value = properties[property];
            if (Array.isArray(value)) {
                let table = '';
                for (let val of value) {
                    table += `<tr><td>${val.toString()}</td></tr>`;
                }
                value = `<table class="table table table-condensed table-hover" style="text-align:center">${table}</table>`;
            }
            else if (typeof(value) === 'object') {
                value = JSON.stringify(value);
            }
            propertiesEditorSelectProptable.append(createRow(property, value));
        }
    };

    const generateEdgeProperties = () => {
        generateVertexProperties();
        propertiesEditorSelectProptable.append(createRow('type', selection.tag));
        propertiesEditorSelectProptable.append(createRow('from', window.rurukiEye.nodes.find(v=> v.id === selection.source.id).name));
        if (window.rurukiEye.config.propertiesEditor.changeEdge === false) {
            propertiesEditorSelectProptable.append(createRow('to', window.rurukiEye.nodes.find(v=> v.id === selection.target.id).name));
        }
        else {
            let innerDropDown = '';
            for (let val of window.rurukiEye.nodes.slice().sort()) {
                if (val.label !== selection.target.label) {
                    continue;
                }
                innerDropDown += `<option value="${val.id}"${val.id === selection.target.id ? ' selected="true"':''}>${val.name}</option>`;
            }
            const destinationVertexRow = createRow('to', `<select id="destSel" class="form-control input-sm">${innerDropDown}</select>`);
            propertiesEditorSelectProptable.append(destinationVertexRow);
            const destSel = destinationVertexRow.querySelector('#destSel');
            const changeEventHandler = saveEdgeChange.bind(this, destSel);
            destSel.addEventListener('change', () => {
                target = window.rurukiEye.nodes.find(p => p.id == destSel.value);
                changeEventHandler();
            });
        }
    };

    window.rurukiEye.on('selected', (item, itemHighlight, itemUnhighlight) => {
        selection = item;
        selectionHighlight = itemHighlight;
        selectionUnhighlight = itemUnhighlight;
        target = selection.target;
        propertiesEditorSelectNoSelect.style.display = 'none';
        if (window.rurukiEye.config.propertiesEditor.deleteSelection !== false) {
            propertiesEditorSelectDeleteBtn.disabled = false;
        }
        propertiesEditorSelectRemoveBtn.disabled = item.type !== 'vertex';
        propertiesEditorSelectClearBtn.disabled = false;
        selection.type === 'vertex' ? generateVertexProperties() : generateEdgeProperties();
    });

    const mouseOverVertex = () => {
        if (!selection) {
            return;
        }
        selectionHighlight();
    };

    const mouseOutVertex = () => {
        if (!selection) {
            return;
        }
        selectionUnhighlight();
    };

    const clearVertex = () => {
        if (selectionUnhighlight) {
            selectionUnhighlight();
        }
        selection = null;
        selectionHighlight = null;
        selectionUnhighlight = null;
        target = null;
        propertiesEditorSelectProptable.innerHTML = '';
        propertiesEditorSelectRemoveBtn.disabled = true;
        propertiesEditorSelectDeleteBtn.disabled = true;
        propertiesEditorSelectClearBtn.disabled = true;
        propertiesEditorSelectNoSelect.style.display = 'inline';
    };

    const removeVertex = () => {
        window.rurukiEye.removeVertex(selection);
        clearVertex();
    };

    const deleteVertex = () => {
        if (selection.type === 'vertex' && selection.id === window.rurukiEye.baseNodeId &&
            !alert('Cannot delete starting ruruki node.') ||
            !confirm('Are you sure?')) {
            return;
        }

        RurukiEye.getJSON(`/vertices/delete${selection.type.charAt(0).toUpperCase() + selection.type.slice(1)}/${selection.id}`,
            data => {
            if (!data.success) {
                alert('Deleting the node/edge failed.');
                return;
            }
            removeVertex();
        });
    };

    propertiesEditorSelectDeleteBtn.addEventListener('click', deleteVertex);
    propertiesEditorSelectClearBtn.addEventListener('click', clearVertex);
    propertiesEditorSelectRemoveBtn.addEventListener('click', removeVertex);
    propertiesEditorSelectContainer.addEventListener('mouseover', mouseOverVertex);
    propertiesEditorSelectContainer.addEventListener('mouseout', mouseOutVertex);

    /*
        Pin all verticies in current position.
    */
    const propertiesEditorPinAll = propertiesEditorContainer.querySelector('#properties-editor-pinall');
    propertiesEditorPinAll.addEventListener('click', () => {
        for (let vertex of window.rurukiEye.vertex.data()) {
            window.rurukiEye.pinNode(window.rurukiEye, vertex);
        }
    });
})();
