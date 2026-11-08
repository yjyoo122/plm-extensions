/*  RESIZABLE PANELS FOR THE MANUFACTURING BOM EDITOR
    -----------------------------------------------------------------------------
    Two drag handles :
      - between the middle panel and the MBOM on the right  -> --width-mbom
      - between the 3D viewer and the EBOM in the middle     -> --width-ebom
    The layout in mbom.css is built entirely on these two CSS variables, so a
    handle only has to set the variable on <html> - every mode of the editor
    (EBOM alignment, Add Items, Operations, details panel on / off) follows it.

    The handles are placed from the actual position of the panels, not from the
    variables, because the variables also change with the screen size (media
    queries in mbom.css) and because two layouts are not built on them at all :
    with the viewer switched off, the MBOM and the middle panel split 50 / 50.
    Dragging in that layout switches it to the variables (body.custom-split).

    The widths are remembered in this browser. Double-click a handle to go back
    to the default layout.
    ----------------------------------------------------------------------------- */

(function() {

    const STORAGE_KEY = 'plmx-mbom-panel-widths';
    const MIN_MBOM    = 320;
    const MIN_EBOM    = 380;
    const MIN_VIEWER  = 120;
    const MIN_TABS    = 420;

    let handleMBOM = null;
    let handleEBOM = null;
    let dragging   = null;
    let frame      = null;


    function cssPixels(elem, property) {

        return parseFloat(getComputedStyle(elem)[property]) || 0;

    }

    function setWidth(name, value) {

        document.documentElement.style.setProperty(name, Math.round(value) + 'px');

    }

    function isShown(elem) {

        if(!elem) return false;

        let rect = elem.getBoundingClientRect();

        return (getComputedStyle(elem).display !== 'none') && (rect.height > 0);

    }


    /*  STORAGE  - wrapped, a blocked or private browser storage must never break the editor */
    function load() {

        let saved = null;

        try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(error) {}

        if(!saved || (typeof saved !== 'object')) return;

        if(saved.mbom > 0) setWidth('--width-mbom', saved.mbom);
        if(saved.ebom > 0) setWidth('--width-ebom', saved.ebom);
        if(saved.split === true) $('body').addClass('custom-split');

    }

    function save() {

        let style = document.documentElement.style;

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                mbom  : parseFloat(style.getPropertyValue('--width-mbom')) || 0,
                ebom  : parseFloat(style.getPropertyValue('--width-ebom')) || 0,
                split : $('body').hasClass('custom-split')
            }));
        } catch(error) {}

    }

    function reset() {

        document.documentElement.style.removeProperty('--width-mbom');
        document.documentElement.style.removeProperty('--width-ebom');
        $('body').removeClass('custom-split');

        try { localStorage.removeItem(STORAGE_KEY); } catch(error) {}

        afterChange();

    }


    /*  PLACING THE HANDLES                                                        */
    function place() {

        let main   = document.getElementById('main');
        let tabs   = document.getElementById('tabs');
        let mbom   = document.getElementById('mbom');
        let viewer = document.getElementById('viewer');
        let ebom   = document.getElementById('ebom');

        if(!main || !tabs || !mbom) return;

        let rectMain = main.getBoundingClientRect();

        // the gap between the middle panel and the MBOM is made of their two borders
        if(isShown(tabs) && isShown(mbom)) {

            let rectMBOM = mbom.getBoundingClientRect();
            let half     = Math.max(6, cssPixels(mbom, 'borderLeftWidth'));

            handleMBOM.css({
                display : 'block',
                left    : (rectMBOM.left - rectMain.left - half) + 'px',
                width   : (2 * half) + 'px',
                top     : (rectMBOM.top  - rectMain.top) + 'px',
                height  : rectMBOM.height + 'px'
            });

        } else handleMBOM.hide();

        // the viewer and the EBOM sit side by side in EBOM alignment mode only
        let withViewer = $('body').hasClass('mode-ebom') && !$('body').hasClass('no-viewer');

        if(withViewer && isShown(viewer) && isShown(ebom)) {

            let rectViewer = viewer.getBoundingClientRect();
            let rectEBOM   = ebom.getBoundingClientRect();
            let left       = rectViewer.right;
            let width      = rectEBOM.left - rectViewer.right;

            // on a narrow screen the EBOM can be wider than the panel and push the viewer to zero;
            // the handle then sits at the left edge, so the EBOM can be dragged narrower again
            if(width < 8) {
                left  = Math.max(rectViewer.left, Math.min(left, rectEBOM.left)) - 4;
                width = 12;
            }

            handleEBOM.css({
                display : 'block',
                left    : (left - rectMain.left) + 'px',
                width   : width + 'px',
                top     : (rectEBOM.top - rectMain.top) + 'px',
                height  : rectEBOM.height + 'px'
            });

        } else handleEBOM.hide();

    }

    // the details panel and other layout switches are animated, so the handles are placed again
    // a few times after a change instead of once
    function placeSoon() {

        place();

        for(let delay of [ 100, 300, 600 ]) setTimeout(place, delay);

    }

    function afterChange() {

        placeSoon();

        if(typeof viewerResize === 'function') viewerResize(0);

    }


    /*  DRAGGING                                                                   */
    function startDrag(event, which) {

        if(event.button !== 0) return;

        event.preventDefault();

        dragging = which;

        // with the viewer off the 50 / 50 layout is not built on the variables : take over the
        // current width first, so the MBOM does not jump when the drag starts
        if((which === 'mbom') && !$('body').hasClass('custom-split') && $('body').hasClass('no-viewer')) {
            setWidth('--width-mbom', document.getElementById('mbom').getBoundingClientRect().width - (2 * cssPixels(document.getElementById('mbom'), 'borderLeftWidth')));
            $('body').addClass('custom-split');
        }

        $('body').addClass('resizing-panels');
        $(event.currentTarget).addClass('active');

        try { event.currentTarget.setPointerCapture(event.pointerId); } catch(error) {}

    }

    function drag(event) {

        if(dragging === null) return;

        let x = event.clientX;

        if(frame !== null) return;

        frame = requestAnimationFrame(function() {

            frame = null;

            if(dragging === 'mbom') dragMBOM(x); else dragEBOM(x);

            place();

        });

    }

    function dragMBOM(x) {

        let tabs     = document.getElementById('tabs');
        let mbom     = document.getElementById('mbom');
        let rectTabs = tabs.getBoundingClientRect();
        let rectMBOM = mbom.getBoundingClientRect();
        let borders  = cssPixels(mbom, 'borderLeftWidth') + cssPixels(mbom, 'borderRightWidth');

        x = Math.max(x, rectTabs.left + MIN_TABS);

        let width = Math.max(MIN_MBOM, rectMBOM.right - x - borders);

        setWidth('--width-mbom', width);

        // a narrower middle panel must still leave the viewer some room next to the EBOM
        if($('body').hasClass('mode-ebom') && !$('body').hasClass('no-viewer')) {

            let tabsInner = (rectMBOM.right - width - borders) - rectTabs.left - cssPixels(tabs, 'borderLeftWidth') - cssPixels(tabs, 'borderRightWidth');
            let gap       = cssPixels(tabs, 'borderRightWidth');
            let ebomNow   = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--width-ebom')) || 0;
            let ebomMax   = tabsInner - gap - MIN_VIEWER;

            if(ebomNow > ebomMax) setWidth('--width-ebom', Math.max(MIN_EBOM, ebomMax));

        }

    }

    function dragEBOM(x) {

        let tabs      = document.getElementById('tabs');
        let rectTabs  = tabs.getBoundingClientRect();
        let innerLeft = rectTabs.left  + cssPixels(tabs, 'borderLeftWidth');
        let innerRght = rectTabs.right - cssPixels(tabs, 'borderRightWidth');
        let gap       = cssPixels(tabs, 'borderRightWidth');
        let maximum   = Math.max(MIN_EBOM, innerRght - innerLeft - gap - MIN_VIEWER);

        let width = innerRght - x - (gap / 2);

        setWidth('--width-ebom', Math.min(maximum, Math.max(MIN_EBOM, width)));

    }

    function endDrag(event) {

        if(dragging === null) return;

        dragging = null;

        $('body').removeClass('resizing-panels');
        $('.panel-splitter.active').removeClass('active');

        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch(error) {}

        save();
        afterChange();

    }


    /*  SETUP                                                                      */
    function createHandle(id, which, title) {

        let handle = $('<div></div>').appendTo('#main')
            .attr('id', id)
            .attr('title', title)
            .addClass('panel-splitter')
            .hide();

        handle.on('pointerdown', function(e) { startDrag(e.originalEvent, which); });
        handle.on('pointermove', function(e) { drag(e.originalEvent); });
        handle.on('pointerup pointercancel', function(e) { endDrag(e.originalEvent); });
        handle.on('dblclick', function(e) { e.preventDefault(); reset(); });

        return handle;

    }

    $(document).ready(function() {

        if($('#main').length === 0 || $('#mbom').length === 0) return;

        load();

        handleMBOM = createHandle('splitter-mbom', 'mbom', 'Drag to change the width of the MBOM (double-click : default layout)');
        handleEBOM = createHandle('splitter-ebom', 'ebom', 'Drag to change the width of the viewer and the EBOM (double-click : default layout)');

        $(window).on('resize', placeSoon);

        // modes, viewer on / off and the details panel are all switched by classes on <body>
        new MutationObserver(placeSoon).observe(document.body, { attributes : true, attributeFilter : [ 'class' ] });

        // and the panels only get their size once the editor has loaded its data
        if(typeof ResizeObserver === 'function') {
            let observer = new ResizeObserver(function() { place(); });
            for(let id of [ 'main', 'tabs', 'mbom', 'viewer', 'ebom' ]) {
                let elem = document.getElementById(id);
                if(elem) observer.observe(elem);
            }
        }

        placeSoon();

    });

})();
