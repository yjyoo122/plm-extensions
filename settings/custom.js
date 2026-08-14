// ---------------------------------------------------------------------------------------------------------------------------
//  INSTRUCTIONS
// ---------------------------------------------------------------------------------------------------------------------------
//  This template file should be used to adjust the configuration settings of the UX server
//  Instead of changing the given settings in settings.js, it is recommended to update then in here.
//  This default file contains the most frequently changed settings only
//  Anyway, you can copy/paste any setting to be overwritten from settings.js in here
//  All settings provided in this custom file will overwrite the matching settings in settings.js
//  This only works if the exact same structure of the settings is reused
//  So if exports.config.abom.bomLabel should be changed, you have to define this value as exports.config.abom.bomLabel in here.
//  This file contains the key configuration elements already (exports.config, exports.menu, exports.chrome)
//  Do not remove these elements but instead paste the settings to change into these elements
//  You can find some exmaples of frequently changed settings below as comments
//  Changes to this file only get applied when restarting the server
// ---------------------------------------------------------------------------------------------------------------------------



// ---------------------------------------------------------------------------------------------------------------------------
//  CUSTOM WORKSPACE DEFINITION
// ---------------------------------------------------------------------------------------------------------------------------
exports.common = {

    workspaceIds : {

        // Product Development Workspaces
        changeOrders                 : 84,
        changeRequests               : 83,
        changeTasks                  : 80,
        designReviews                : 76,
        designReviewTasks            : 77,
        engineeringProjects          : 213,
        engineeringProjectActivities : 211,
        items                        : 57,
        nonConformances              : 98,
        problemReports               : 82,

        // Products & Projects Workspaces
        products               : 95,
        projects               : 86,
        projectTasks           : 90,

        // Supplier Collaboration Workspaces
        sparePartsRequests     : 241,
        supplierPackages       : 147,

        // Asset Management Workspaces
        orderProjects          : 283,
        orderProjectDeliveries : 279,
        assets                 : 280,
        assetItems             : 282,
        assetServices          : 284,
        serialNumbers          : 277,

    },

    workspaces: {
        items : {
            defaultBOMView : 'Tree Navigator', // This BOM view should contain columns Descriptor, Number (see next setting) and BOM Quantity only
            fieldIdNumber  : 'NUMBER'
        }
    },

    viewer : {
        numberProperties   : ['Part Number', 'Name', 'label', 'Artikelnummer', 'Bauteilnummer'],
        suffixPrimaryFile  : ['.iam.dwf', '.iam.dwfx', '.ipt.dwf', '.ipt.dwfx'],
        extensionsIncluded : ['dwf', 'dwfx', 'nwd', 'ipt', 'stp', 'step', 'sldprt', 'pdf'],
    }

}



// ---------------------------------------------------------------------------------------------------------------------------
//  CUSTOM APPLICATION SETTINGS
// ---------------------------------------------------------------------------------------------------------------------------
exports.applications = {

    abom : {
        // bomLabel : 'Asset BOM',
        // assetItems : {
        //     workspaceId : 282
        // },
        // orderProjectDeliveries : {
        //     workspaceId : 279
        // },
    },
    classes        : {},
    compare        : {},
    configurator   : {},
    dashboard      : {},
    explorer       : {},
    impactanalysis : {},
    insights       : {},
    instances      : {
        // tabs : [{
        //     workspaceId : 308
        // }]
    },
    mbom           : {
        // workspaceEBOM : {
        //     workspaceId : null, // uses common.workspaceIds.items per default
        // }, 
        // workspaceMBOM : {
        //     workspaceId : null, // uses common.workspaceIds.items per default
        // }
    },
    portal         : {
        // downloadPatterns : [{
        //     fields    : ['NUMBER', 'PDM_ITEM_REVISION'],
        //     separator : ' ',
        //     label     : 'Number PDM-Revision'
        // }]        
    },
    portfolio      : {},
    projects       : {},
    reports        : {},
    reviews        : {},
    sbom           : {},
    service        : {},
    variants       : {
        // workspaceItemVariants : {
            // workspaceId : 571,
        // }
    },
    addins : {}

}



// ---------------------------------------------------------------------------------------------------------------------------
//  CUSTOM MAIN MENU SETTINGS
// ---------------------------------------------------------------------------------------------------------------------------
exports.menu = []




// ---------------------------------------------------------------------------------------------------------------------------
//  SERVER ROUTING
// ---------------------------------------------------------------------------------------------------------------------------
exports.server = {
    landingPage     : '',  // Set the default URL to be opened if no app URL is provided (default is '')
    servicesEnabled : {}   // Defines the applications to enable. When an application is set to false, an error 404 page will be shown when users try accessing the given page.
}



// ---------------------------------------------------------------------------------------------------------------------------
//  CUSTOM CHOROME EXTENSION SETTINGS
// ---------------------------------------------------------------------------------------------------------------------------
exports.chrome = {
    customStyle : true
}



// ---------------------------------------------------------------------------------------------------------------------------
//  CUSTOM USER INTERFACE LANGUAGE SETTINGS
// ---------------------------------------------------------------------------------------------------------------------------
//  Per default, the user interface follows the language of the browser (Japanese, Korean or English).
//  To force one single language for everybody, remove the two slashes in front of the four lines below and
//  set defaultLanguage to 'ja' (Japanese), 'ko' (Korean) or 'en' (English). Restart the server afterwards.
//  If you do not need skipSelectors, simply delete that line - and the comma at the end of the line above it.
//
//  Sometimes a value coming from Fusion Manage looks exactly like a label of the user interface - for example
//  an item titled 'Details' or a lifecycle called 'Released'. Such a value would get translated as well, which
//  is not wanted. skipSelectors is the escape hatch for this: list the CSS selectors of the elements holding
//  your data and everything inside them stays in its original language.
// exports.i18n = {
//     defaultLanguage : 'ja',
//     skipSelectors   : ['.item-title', '.field-value']
// }