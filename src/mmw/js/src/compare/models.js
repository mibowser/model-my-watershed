"use strict";

var _ = require('lodash'),
    Backbone = require('../../shim/backbone'),
    ControlsCollection = require('../modeling/models').ModelPackageControlsCollection;

var CHART = 'chart',
    TABLE = 'table';

var ChartRowModel = Backbone.Model.extend({
    defaults: {
        name: '',
        chartDiv: '',
        seriesColors: [],
        legendItems: null,
        values: [],
        unit: '',
        precipitation: null,
    },
});

var ChartRowsCollection = Backbone.Collection.extend({
    model: ChartRowModel,
});

var TableRowModel = Backbone.Model.extend({
    defaults: {
        name: '',
        values: [],
        unit: '',
    },
});

var TableRowsCollection = Backbone.Collection.extend({
    model: TableRowModel,

    /**
     * Initialize collection by storing the given scenario collection
     * and listening to updates to scenario results. Each change fires
     * an `update` function, which should be defined in the descendants
     * of this collection.
     */
    initialize: function(attrs) {
        var update = _.bind(this.update, this);

        this.scenarios = attrs.scenarios;

        this.scenarios.forEach(function(scenario) {
            scenario.get('results').on('change', update);
        });
    }
});

var Tr55RunoffTable = TableRowsCollection.extend({
    update: function() {
        var results = this.scenarios.map(function(scenario) {
                return scenario.get('results')
                               .findWhere({ name: 'runoff' })
                               .get('result');
            }),
            get = function(key) {
                return function(result) {
                    return result.runoff.modified[key];
                };
            },
            runoff = _.map(results, get('runoff')),
            et     = _.map(results, get('et'    )),
            inf    = _.map(results, get('inf'   )),
            rows   = [
                { name: "Runoff"            , unit: "cm", values: runoff },
                { name: "Evapotranspiration", unit: "cm", values: et     },
                { name: "Infiltration"      , unit: "cm", values: inf    },
            ];

        this.reset(rows);
    }
});

var TabModel = Backbone.Model.extend({
    defaults: {
        name: '',
        active: false,
        table: null,  // TableRowsCollection
        charts: null, // ChartRowCollection
    },
});

var TabsCollection = Backbone.Collection.extend({
    model: TabModel,
});

var WindowModel = Backbone.Model.extend({
    defaults: {
        controls: null, // ModelPackageControlsCollection
        mode: CHART, // or TABLE
        scenarios: null, // ScenariosCollection
        tabs: null,  // TabsCollection
    },

    addOrReplaceInput: function(input) {
        this.get('scenarios').each(function(scenario) {
            scenario.addOrReplaceInput(input);
        });
    }
});

module.exports = {
    ChartRowModel: ChartRowModel,
    ChartRowsCollection: ChartRowsCollection,
    ControlsCollection: ControlsCollection,
    TableRowModel: TableRowModel,
    TableRowsCollection: TableRowsCollection,
    Tr55RunoffTable: Tr55RunoffTable,
    TabModel: TabModel,
    TabsCollection: TabsCollection,
    WindowModel: WindowModel,
    constants: {
        CHART: CHART,
        TABLE: TABLE,
    },
};
