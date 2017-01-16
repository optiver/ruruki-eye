(() => {
    const modalDialog = document.getElementById('create-new-modal');
    const modalSave = document.getElementById('create-new-modal-save');
    const modalCancel = document.getElementById('create-new-modal-cancel');
    const modalEdgeFrom = document.getElementById('create-new-modal-from-name');
    const modalEdgeTo = document.getElementById('create-new-modal-to-name');

    const showModal = () => {
        modalDialog.style.display = 'block';
        modalDialog.classList.add('in');
    };

    const hideModal = () => {
        modalDialog.classList.remove('in');
        modalDialog.style.display = 'none';
    }

    const createEdge = () => {
        const post = {
            from: from.id,
            to: to.id
        };
        const err = () => {
            alert('An error occured while creating the edge.');
        };
        RurukiEye.ajaxRequest('/vertices/createEdge', 'application/json', data => {
            const response = JSON.parse(data.responseText);
            if (!response.success) {
                return err();
            }
            hideModal();
            window.rurukiEye.addEdge(response.edge);
        }, err, JSON.stringify(post), 'application/json');
    };

    const populateModal = (node1, node2) => {
        modalEdgeFrom.innerHTML = `<table><tr><td>${node1.name}</td></tr></table>`;
        modalEdgeTo.innerHTML = `<table><tr><td>${node2.name}</td></tr></table>`;
    };

    modalSave.addEventListener('click', createEdge);
    modalCancel.addEventListener('click', hideModal);
    window.rurukiEye.on('createNew', (node1, node2) => {
        from = node1;
        to = node2;
        populateModal(from, to);
        showModal();
    });
})();
