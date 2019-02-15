Ext.define("initiative-team-allocation", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

    items: [
        {xtype:'container',itemId:'selector_box'},
        {xtype: 'container', itemId: 'advancedFilterBox', flex: 1},
        {xtype:'container',itemId:'grid_box'}
    ],

    integrationHeaders : {
        name : "initiative-team-allocation"
    },

    config: {
        defaultSettings: {
        }
    },
    portfolioItemFetch: ['ObjectID','FormattedID','Name'],

    launch: function() {
        Rally.data.util.PortfolioItemHelper.loadTypeOrDefault({
            defaultToLowest: true,
            loadAllTypes: true,
            requester: this,
            success: function (piTypeDef) {
               this.piTypePath = piTypeDef[1].get('TypePath');
               console.log("TYPE: ", this.piTypePath);
               this.logger.log('launch settings', this.getSettings());
               if (!this.validateApp()){
                   return;
               }
               this.setLoading('Initializing Projects...');
               this.projectUtilities = Ext.create('CA.agile.technicalservices.utils.ProjectUtilities',{
                   listeners: {
                       ready: this.initializeApp,
                       onerror: this.showErrorNotification,
                       scope: this
                   }
               });       
            },
            scope: this
        });
    },
    validateApp: function(){
        return true;
    },
    initializeApp: function(){
        this.setLoading(false);
        this.logger.log('initializeApp');

        CA.agile.technicalservices.ExtendedModelBuilder.build(
            this.getPortfolioItemType(),'ExtendedPortfolioItem').then({
            success: this._addSelectorComponents,
            failure: this.showErrorNotification,
            scope: this
        });

    },

    _addSelectorComponents: function(model){
        this.getSelectorBox().removeAll();

        this.extendedPortfolioModel = model;

        this.getSelectorBox().add({
            xtype: 'rallyinlinefilterbutton',
            modelNames: [this.getPortfolioItemType()],
            context: this.getContext(),
            margin: '10 5 10 5',

            stateful: true,
            stateId: 'grid-filters-1',
            listeners: {
                inlinefilterready: this.addInlineFilterPanel,
                inlinefilterchange: this.updateFilters,
                scope: this
            }
        });
    },

    buildGrid: function(){
        this.getGridBox().removeAll();

        var filters = this.getFilters(),
            fetch = this.getPortfolioItemFetch();

        this.logger.log('buildGrid', filters, fetch);

        this.getGridBox().add({
            xtype: 'rallygrid',
            columnCfgs: this.getColumnCfgs(),
            storeConfig: {
                model: this.extendedPortfolioModel,
                filters: filters,
                fetch: fetch,
                listeners: {
                    load: this.fetchUserStories,
                    scope: this
                }
            },
            showRowActionsColumn: false,
            scroll: false,
            enableEditing: false //,
//            enableBulkEdit: false
        });
    },
    getColumnCfgs: function(){
        var me = this;
        return [
            {
                dataIndex: 'DragAndDropRank',
                flex: 1
            },{
                dataIndex: 'FormattedID',
                flex: 1
            },{
                dataIndex: 'Name',
                flex: 6
            },{
                dataIndex: 'Parent',
                flex: 4
            },{
                dataIndex: 'Milestones',
                flex: 4
            },{
                dataIndex: 'Predecessors',
                text: 'DEP - Pred',
                flex: 1
            },{
                dataIndex: 'Successors',
                text: 'DEP - Succ',
                flex: 1
            },{
                dataIndex: 'LeafStoryCount',
                text: 'Total Story Count',
                flex: 1
            },{
                dataIndex: 'AcceptedLeafStoryCount',
                text: 'Accepted Story Count',
                flex: 1
            },{
            dataIndex: '__projectAllocations',
            text: 'Line of Business',
            renderer: me.lineOfBusinessRenderer,
            sortable: false,
            flex: 3
        },{
            dataIndex: '__projectAllocations',
            text: 'Team Name',
            renderer: me.teamNameRenderer,
            sortable: false,
            flex: 3
        },{
            dataIndex: '__projectAllocations',
            text: 'Percent of Time Spent',
            renderer: me.percentTimeRenderer,
            sortable: false,
            flex: 2
        }];
    },
    lineOfBusinessRenderer: function(v,m,r){
        return _.pluck(v,'lineOfBusiness').join('<br/>');
    },
    teamNameRenderer: function(v,m,r){
        return _.pluck(v,'teamName').join('<br/>');
    },
    percentTimeRenderer: function(v,m,r){
        var tooltip = "<div style=\"text-transform:uppercase;color:#fff;font-family:NotoSansBold, Helvetica, Arial;font-size:10px;\"><span style=\"color:#337ec6;font-size:10px;\">" + r.get('FormattedID') + "</span> Percent of Time Spent</div> is the sum of the \"Active\" story points associated with the Initiative divided by the total sum of currently \"Active\" story points for the Team.  \"Active\" stories are those in a Schedule State of \"Defined\",\"In-Progress\" or \"Completed\".</br>";

        Ext.Array.each(v, function(obj){
            tooltip += Ext.String.format('</br><span style="font-family:NotoSansBold, Helvetica, Arial;">{0}</span>: {1} / {2} points', obj.teamName, Math.round(obj.thisTotal || 0), Math.round(obj.projectTotal || 0));
        });

        var percents = [];
        Ext.Array.each(v, function(obj){
            var pct = "";
            if (obj.projectTotal){
               pct = (((obj.thisTotal || 0)/obj.projectTotal) * 100).toFixed(1) + '%';
            }
            percents.push(pct);
        });

        //return percents.join('</br>');
        return Ext.String.format('<div class="pct"><span class="tooltiptext">{1}</span>{0}</div>', percents.join('<br/>'),tooltip);
    },
    getStoryFilters: function(){

        var scheduleStateFilters = Rally.data.wsapi.Filter.or([{
            property: 'ScheduleState',
            value: "Completed"
        },{
            property: "ScheduleState",
            value: "Defined"
        },{
            property: "ScheduleState",
            value: "In-Progress"
        }]);

        var iterationFilters = Rally.data.wsapi.Filter.or([{
            property: "Iteration.StartDate",
            operator: "<=",
            value: "today"
        },{
            property: "Iteration",
            value: ""
        }]);

        var storyFilters = Ext.create('Rally.data.wsapi.Filter',{
            property: "DirectChildrenCount",
            value: 0
        });

        storyFilters = storyFilters.and(scheduleStateFilters);
        storyFilters = storyFilters.and(iterationFilters);
        return storyFilters;
    },
    fetchUserStories: function(store, portfolioItems){

        if (!portfolioItems || portfolioItems.length === 0){
            return;
        }
        var parentProperty = "Feature.Parent.ObjectID",
            filters = Ext.Array.map(portfolioItems, function(pi){
            return {
                property: parentProperty,
                value: pi.get('ObjectID')
            };
        });
        filters = Rally.data.wsapi.Filter.or(filters);

        var storyFilters = this.getStoryFilters();

        filters = filters.and(storyFilters);
        this.logger.log('fetchUserStories', portfolioItems, filters.toString());

        var config = {
            model: 'HierarchicalRequirement',
            fetch: ['ObjectID','Project',"PlanEstimate","Feature","Parent","Name"],
            filters: filters,
            context: {project: null},
            enablePostGet: true,
            compact: false
        };

        this.setLoading('Loading Team Allocation Data...');
        CA.agile.technicalservices.Toolbox.fetchWsapiRecords(config).then({
            success: this.processStories,
            failure: this.showErrorNotification,
            scope: this
        });
    },
    processStories: function(records){
        this.logger.log('processStories: fetchUserStories.success', records);

        if (!records || records.length === 0){
            this.setLoading(false);
            return ;
        }

        var hash = {},
            projectHash = {};

        for (var i=0; i<records.length; i++){
            var data = records[i].getData(),
                initiative = data.Feature && data.Feature.Parent && data.Feature.Parent.ObjectID;

            if (initiative){
                if (!hash[initiative]){
                    hash[initiative] = {};
                }
                var project = data.Project.ObjectID;
                if (!projectHash[project]){
                    projectHash[project] = data.Project;
                }
                if (!hash[initiative][project]){
                    hash[initiative][project] = [];
                }
                hash[initiative][project].push(data.PlanEstimate || 0);
            }
        }

        this.logger.log('processStories: ProjectHash, InitiativeHash', projectHash, hash);


        var projectFilters = Ext.Array.map(Ext.Object.getKeys(projectHash), function(k){
            return {
                property: "Project.ObjectID",
                value: k
            };
        });
        projectFilters = Rally.data.wsapi.Filter.or(projectFilters);

        var storyFilters = this.getStoryFilters();

        projectFilters = projectFilters.and(storyFilters);

        var config = {
            model: 'HierarchicalRequirement',
            fetch: ['ObjectID','Project',"PlanEstimate"],
            filters: projectFilters,
            context: {project: null},
            enablePostGet: true,
            compact: false,
            limit: Infinity
        };

      //  this.setLoading('Loading Project Allocation Data...');
        CA.agile.technicalservices.Toolbox.fetchWsapiRecords(config).then({
            success: function(projectRecords){
                this.logger.log('processStories:  fetchProjectRecords: ', projectRecords);
                var projectUtilities = this.projectUtilities;
                for (var i=0; i<projectRecords.length; i++){
                    var data = projectRecords[i].getData();
                    if (!projectHash[data.Project.ObjectID]){
                        projectHash[data.Project.ObjectID] = {
                            activePoints: []
                        };
                    }
                    if (!projectHash[data.Project.ObjectID].activePoints){
                        projectHash[data.Project.ObjectID].activePoints = [];
                        var projectAncestor = projectUtilities.getProjectAncestor(data.Project.ObjectID, 3);
                        projectHash[data.Project.ObjectID].lineOfBusiness = projectUtilities.getProjectName(projectAncestor);
                    }
                    projectHash[data.Project.ObjectID].activePoints.push(data.PlanEstimate || 0);
                }

                var initiatives = this.down('rallygrid').getStore().getRange();
                this.down('rallygrid').suspendLayout = true;
                this.down('rallygrid').getStore().suspendEvents(true);
                for (var i=0; i<initiatives.length; i++){
                    initiatives[i].updateTeamInfo(hash[initiatives[i].get('ObjectID')], projectHash);
                }
                this.down('rallygrid').getStore().resumeEvents();
                this.down('rallygrid').suspendLayout = false;
                this.down('rallygrid').doLayout();


            },
            failure: this.showErrorNotification,
            scope: this
        }).always(function(){ this.setLoading(false); }, this);

    },
    getFilters: function(){
        var filters = null;

        var filterButton = this.down('rallyinlinefilterbutton');
        if (filterButton && filterButton.inlineFilterPanel && filterButton.getWsapiFilter()){
            this.logger.log('getFilters advancedfilters', filterButton.getWsapiFilter(), filterButton.getFilters());
            if (filters){
                filters = filters.and(filterButton.getWsapiFilter());
            } else {
                filters = filterButton.getWsapiFilter();
            }
        }
        return filters || [];
    },
    addInlineFilterPanel: function(panel){
        this.getAdvancedFilterBox().add(panel);
    },
    updateFilters: function(filter){
        this.logger.log('updatefilters', filter);
        this.getSelectorBox().doLayout();
        this.buildGrid();
    },
    getAdvancedFilterBox: function(){
        return this.down('#advancedFilterBox');
    },
    getSelectorBox: function(){
        return this.down('#selector_box');
    },
    getGridBox: function(){
        return this.down('#grid_box');
    },
    showErrorNotification: function(msg){
        this.setLoading(false);
        Rally.ui.notify.Notifier.showError({message: msg});
    },
    getPortfolioItemType: function(){
        return this.piTypePath;
    },
    getPortfolioItemFetch: function() {
        return this.portfolioItemFetch;
    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }
});
