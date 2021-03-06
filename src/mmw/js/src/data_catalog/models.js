"use strict";

var $ = require('jquery'),
    _ = require('underscore'),
    Backbone = require('../../shim/backbone'),
    turfIntersect = require('turf-intersect'),
    App = require('../app'),
    settings = require('../core/settings');

var REQUEST_TIMED_OUT_CODE = 408;
var DESCRIPTION_MAX_LENGTH = 100;
var PAGE_SIZE = settings.get('data_catalog_page_size');

var Catalog = Backbone.Model.extend({
    defaults: {
        id: '',
        name: '',
        description: '',
        fromDate: null,
        toDate: null,
        query: '',
        bbox: '',
        loading: false,
        active: false,
        results: null, // Results collection
        resultCount: 0,
        is_pageable: true,
        page: 1,
        error: '',
        detail_result: null
    },

    initialize: function() {
        var self = this;
        this.get('results').on('change:show_detail', function() {
            self.set('detail_result', self.get('results').getDetail());
        });
    },

    searchIfNeeded: function(query, fromDate, toDate, bbox) {
        var self = this,
            error = this.get('error'),
            isSameSearch = query === this.get('query') &&
                           fromDate === this.get('fromDate') &&
                           toDate === this.get('toDate') &&
                           bbox === this.get('bbox');

        if (!isSameSearch || error) {
            this.cancelSearch();
            this.searchPromise = this.search(query, fromDate, toDate, bbox)
                                     .always(function() {
                                        delete self.searchPromise;
                                     });
        }

        return this.searchPromise || $.when();
    },

    cancelSearch: function() {
        if (this.searchPromise) {
            this.searchPromise.abort();
        }
    },

    search: function(query, fromDate, toDate, bbox) {
        this.set({
            query: query,
            bbox: bbox,
            fromDate: fromDate,
            toDate: toDate,
        });

        return this.startSearch(1);
    },

    startSearch: function(page) {
        var lastPage = Math.ceil(this.get('resultCount') / PAGE_SIZE),
            thisPage = parseInt(page) || 1,
            data = {
                catalog: this.id,
                query: this.get('query'),
                bbox: this.get('bbox'),
                from_date: this.get('fromDate'),
                to_date: this.get('toDate'),
            };

        if (thisPage > 1 && thisPage <= lastPage) {
            _.assign(data, { page: thisPage });
        }

        this.set('loading', true);
        this.set('error', false);

        return this.get('results')
                   .fetch({ data: data })
                   .done(_.bind(this.doneSearch, this))
                   .fail(_.bind(this.failSearch, this))
                   .always(_.bind(this.finishSearch, this));
    },

    doneSearch: function(response) {
        var data = _.findWhere(response, { catalog: this.id });

        this.set({
            page: data.page || 1,
            resultCount: data.count,
        });
    },

    failSearch: function(response, textStatus) {
        if (textStatus === "abort") {
            // Do nothing if the search failed because it
            // was purposefully cancelled
            return;
        }
        if (response.status === REQUEST_TIMED_OUT_CODE){
            this.set('error', "Searching took too long. " +
                              "Consider trying a smaller area of interest " +
                              "or a more specific search term.");
        } else {
            this.set('error', "Error");
        }
    },

    finishSearch: function() {
        this.set({ loading: false });
    },

    previousPage: function() {
        var page = this.get('page');

        if (page > 1) {
            return this.startSearch(page - 1);
        } else {
            return $.when();
        }
    },

    nextPage: function() {
        var page = this.get('page'),
            count = this.get('resultCount'),
            lastPage = Math.ceil(count / PAGE_SIZE);

        if (page < lastPage) {
            return this.startSearch(page + 1);
        } else {
            return $.when();
        }
    }
});

var Catalogs = Backbone.Collection.extend({
    model: Catalog
});

var Result = Backbone.Model.extend({
    defaults: {
        id: '',
        title: '',
        description: '',
        geom: null, // GeoJSON
        links: null, // Array
        created: '',
        updated: '',
        show_detail: false // Show this result as the detail view?
    },

    getSummary: function() {
        var text = this.get('description') || '';
        if (text.length <= DESCRIPTION_MAX_LENGTH) {
            return text;
        }
        var truncated = text.substr(0,
            text.indexOf(' ', DESCRIPTION_MAX_LENGTH));
        return truncated + '&hellip;';
    },

    getDetailsUrl: function() {
        var links = this.get('links') || [],
            detailsUrl = _.findWhere(links, { type: 'details' });
        return detailsUrl && detailsUrl.href;
    },

    toJSON: function() {
        return _.assign({}, this.attributes, {
            summary: this.getSummary(),
            detailsUrl: this.getDetailsUrl()
        });
    }
});

var Results = Backbone.Collection.extend({
    url: '/api/bigcz/search',
    model: Result,

    initialize: function(models, options) {
        this.catalog = options.catalog;
    },

    parse: function(response) {
        var aoi = App.map.get('areaOfInterest'),
            data = _.findWhere(response, { catalog: this.catalog }),
            // Filter results to only include those without geometries (Hydroshare)
            // and those that intersect the area of interest (CINERGI and CUAHSI).
            filteredResults = _.filter(data.results, function(r) {
                return r.geom === null || turfIntersect(aoi, r.geom) !== undefined;
            });

        // Add the result's id onto the geojson's geom so the map can keep
        // track of which shape came from where
        return _.map(filteredResults, function(r) {
            if (r.geom) {
                r.geom.properties = {
                    id: r.id
                };
            }
            return r;
        });
    },

    getDetail: function() {
        return this.findWhere({ show_detail: true});
    },

    showDetail: function(result) {
        var currentDetail = this.getDetail();

        if (currentDetail) {
            // Do nothing if the selected result is already the detail shown
            if (currentDetail.get('id') === result.get('id')) {
                return;
            }
            // Turn off the actively shown detail. There should only be
            // one with `show_detail` true at a time
            currentDetail.set('show_detail', false);
        }

        result.set('show_detail', true);
    },

    closeDetail: function() {
        var currentDetail = this.getDetail();

        if (!currentDetail) {
            return;
        }

        currentDetail.set('show_detail', false);
    }
});

var SearchForm = Backbone.Model.extend({
    defaults: {
        fromDate: null,
        toDate: null,
        query: '',
        showingFilters: false,
        isValid: true,
    }
});

module.exports = {
    Catalog: Catalog,
    Catalogs: Catalogs,
    Result: Result,
    Results: Results,
    SearchForm: SearchForm
};
