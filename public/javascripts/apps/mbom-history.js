/*  UNDO / REDO FOR THE MANUFACTURING BOM EDITOR
    -----------------------------------------------------------------------------
    Why this can be done safely on the client : nothing the editor does is written
    to Fusion Manage until Save. Save does not replay a list of actions either - it
    compares the MBOM tree on screen with the database state each node carries in
    its data attributes (data-edges on the parent, data-edge, data-qty,
    data-number-db, data-make-buy, data-link-db) and derives creations, removals,
    additions and updates from that difference (setSaveActions in mbom.js).
    Restoring an earlier copy of the tree therefore restores exactly the changes
    that were staged at that moment, and Save computes its work from it as usual.

    How a step is recorded : every action of the editor ends in a change of the
    #mbom-tree DOM, so instead of instrumenting each of them, a MutationObserver
    waits for the tree to settle and then compares a fingerprint of what Save
    cares about - structure, links, edges, quantities, make/buy, titles, codes.
    Selection, hover, expand / collapse and status colours change the DOM too but
    not the fingerprint, so they never become a step. A quick sequence of changes,
    like dragging an item or typing a quantity, collapses into one step.

    How a step is restored : the snapshot is a deep copy of the tree WITH its
    jQuery event handlers, so every button, toggle and quantity field keeps
    working. The jQuery UI widgets are the exception - a copied widget instance
    still belongs to the element it was created on - so they are stripped from
    the copy and created anew through initMBOMSortable / initMBOMDroppable, the
    same functions the editor itself uses.

    Where history stops : after Save the tree carries new database state, and
    marking an EBOM item as End Item or as Matches MBOM writes that flag to Fusion
    Manage immediately. An older copy no longer matches the database at those
    points, so the history restarts there (mbomHistoryCheckpoint).
    ----------------------------------------------------------------------------- */

let mbomHistoryStart, mbomHistoryPause, mbomHistoryCheckpoint;

(function() {

    const MAX_STEPS   = 50;
    const SETTLE_MS   = 500;
    const WIDGET_KEYS = ['ui-sortable', 'ui-droppable', 'ui-draggable'];

    let steps    = [];      // { nodes : detached copy of the tree, fp : fingerprint }
    let pointer  = -1;
    let paused   = true;
    let timer    = null;
    let observer = null;


    function getTree() {

        return $('#mbom-tree');

    }


    /*  FINGERPRINT
        Exactly the properties Save reads from a node, plus its depth. Anything else
        is presentation and must not turn into an undo step.                        */
    function getFingerprint() {

        let parts = [];

        getTree().find('.item').each(function() {

            let elemItem       = $(this);
            let elemDescriptor = elemItem.find('.item-head-descriptor').first();
            let title          = (elemDescriptor.length > 0) ? elemDescriptor.html() : elemItem.find('.item-title').first().html();

            parts.push([
                elemItem.parentsUntil('#mbom-tree', '.item').length,
                elemItem.attr('data-link')    || '',
                elemItem.attr('data-edge')    || '',
                elemItem.attr('data-link-db') || '',
                elemItem.attr('data-ebom')    || '',
                elemItem.find('.item-qty-input').first().val() || '',
                elemItem.find('.item-make-buy').first().val()  || '',
                elemItem.find('.item-code').first().html()     || '',
                title || '',
                elemItem.hasClass('process') ? 'process' : '',
                elemItem.hasClass('leaf')    ? 'leaf'    : ''
            ].join('\u001f'));

        });

        return parts.join('\u001e');

    }


    /*  COPYING
        Native cloning keeps the typed value of an input but not the selection of a
        <select> - the make / buy choice - so form state is carried over explicitly. */
    function copyFormState(elemsFrom, elemsTo) {

        let from = elemsFrom.find('input, select, textarea');
        let to   = elemsTo.find('input, select, textarea');

        to.each(function(index) {

            let source = from.get(index);

            if(typeof source === 'undefined') return;

            if((this.type === 'checkbox') || (this.type === 'radio')) this.checked = source.checked;
            else $(this).val($(source).val());

        });

    }

    function stripWidgets(elems) {

        elems.find('*').addBack().each(function() {

            for(let key of WIDGET_KEYS) {

                let instance = $.data(this, key);

                if(!instance) continue;

                $(this).off('.' + instance.widgetName).off(instance.eventNamespace);
                $.removeData(this, key);

            }

            $.removeData(this, 'sortable-item');

        });

    }

    function capture(fingerprint) {

        let live = getTree().children();
        let copy = live.clone(true, true);

        stripWidgets(copy);
        copyFormState(live, copy);

        return {
            nodes : copy,
            fp    : (typeof fingerprint === 'string') ? fingerprint : getFingerprint()
        };

    }


    /*  RESTORING                                                                    */
    function restore(step) {

        let fresh = step.nodes.clone(true, true);

        copyFormState(step.nodes, fresh);

        // .remove() - not .detach() - so that jQuery UI tears down the widgets of the
        // tree being replaced, including their registration with the drag & drop manager
        getTree().children().remove();
        getTree().append(fresh);

        initMBOMSortable($('#mbom-root-bom'));

        getTree().find('.item-head.ui-droppable').each(function() {
            initMBOMDroppable($(this));
        });

        refreshDerivedState();

        // whatever the refresh recomputed is part of this state now, not a new step
        step.fp = getFingerprint();

        if(timer !== null) { clearTimeout(timer); timer = null; }

    }

    function refreshDerivedState() {

        // restoreAssembly : in disassemble mode, components no longer in the MBOM reappear in the model
        let refreshers = [ 'updateMBOMNumbers', 'setTotalQuantities', 'setStatusBar', 'setStatusBarFilter', 'updateViewer', 'restoreAssembly' ];

        for(let name of refreshers) {
            if(typeof window[name] !== 'function') continue;
            try {
                window[name]();
            } catch(error) {
                console.warn('mbom-history : ' + name + ' failed after restoring a step - ' + error.message);
            }
        }

    }


    /*  RECORDING                                                                    */
    function schedule() {

        if(paused) return;

        if(timer !== null) clearTimeout(timer);

        timer = setTimeout(settle, SETTLE_MS);

    }

    function settle() {

        timer = null;

        if(paused) return;

        let fingerprint = getFingerprint();

        if((pointer >= 0) && (steps[pointer].fp === fingerprint)) return;

        steps = steps.slice(0, pointer + 1);
        steps.push(capture(fingerprint));

        if(steps.length > MAX_STEPS) steps.shift();

        pointer = steps.length - 1;

        updateButtons();

    }

    // A change made within the last half second has not been recorded yet. It has to be,
    // before stepping back, or undo would skip it and jump one step too far.
    function flushPending() {

        if(timer === null) return;

        clearTimeout(timer);
        settle();

    }


    /*  UNDO / REDO                                                                  */
    function isBusy() {

        // a drag is still in progress, or a dialog of the editor is open
        if($('.ui-sortable-helper, .ui-draggable-dragging').length > 0) return true;
        if($('.dialog:visible').length > 0) return true;

        return false;

    }

    function undo() {

        if(paused || isBusy()) return;

        flushPending();

        if(pointer <= 0) return;

        pointer--;
        restore(steps[pointer]);
        updateButtons();

    }

    function redo() {

        if(paused || isBusy()) return;

        flushPending();

        if(pointer >= steps.length - 1) return;

        pointer++;
        restore(steps[pointer]);
        updateButtons();

    }

    function updateButtons() {

        $('#undo').toggleClass('disabled', paused || (pointer <= 0));
        $('#redo').toggleClass('disabled', paused || (pointer >= steps.length - 1));

    }


    /*  PUBLIC ENTRY POINTS, called from mbom.js                                    */

    // Once the editor has built both trees.
    mbomHistoryStart = function() {

        steps   = [ capture() ];
        pointer = 0;
        paused  = false;

        if(observer === null) {

            observer = new MutationObserver(schedule);
            observer.observe(getTree().get(0), { childList : true, subtree : true, attributes : true, characterData : true });

            // typing into a quantity field changes a property, not the DOM
            getTree().on('input.mbomHistory change.mbomHistory', schedule);

            // a change made in the last half second is not recorded yet, so the button may still look
            // disabled - undo() records it first (flushPending) and then steps back over it
            $('#undo').click(function() { if(!$(this).hasClass('disabled') || (timer !== null)) undo(); });
            $('#redo').click(function() { if(!$(this).hasClass('disabled')) redo(); });

            $(document).on('keydown.mbomHistory', function(e) {

                if(!(e.ctrlKey || e.metaKey)) return;

                // inside a field the browser's own text undo is what the user expects
                let tag = String(e.target.tagName || '').toLowerCase();

                if((tag === 'input') || (tag === 'textarea') || (tag === 'select') || e.target.isContentEditable) return;

                let key = String(e.key || '').toLowerCase();

                if((key === 'z') && !e.shiftKey) {
                    e.preventDefault();
                    undo();
                } else if((key === 'y') || ((key === 'z') && e.shiftKey)) {
                    e.preventDefault();
                    redo();
                }

            });

        }

        updateButtons();

    };

    // While Save rewrites the tree.
    mbomHistoryPause = function() {

        paused = true;

        if(timer !== null) { clearTimeout(timer); timer = null; }

        updateButtons();

    };

    // The tree now matches the database again, or a change was written to it directly :
    // the current state becomes the new first step. Captured right away, so that a change
    // the caller is about to make (adding the item that was just marked as End Item)
    // becomes an ordinary step after it that can still be undone.
    mbomHistoryCheckpoint = function() {

        if(timer !== null) { clearTimeout(timer); timer = null; }

        steps   = [ capture() ];
        pointer = 0;
        paused  = false;

        updateButtons();

    };

})();
