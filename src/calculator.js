Ext.define("MyBurnCalculator", function() {

    var self;

    return {

        extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",

        config : {
            series : [],
            ignoreZeroValues : true,
            flatScopeProjection : false,
            peRecords : [],
            featureCompleteByState : false,
            featureCompleteState : ""
        },

        constructor:function(config) {
            self = this;
            this.initConfig(config);
            return this;
        },

        pointsOffset : [],
        countOffset : [],
        data : [],
        lastAccepted : [],
        indexOffset : [],

        getMetrics: function () {

            // get the set of non-projection metrics
            var nonProjectionMetrics = _.filter(self.series,function(s) {
               return s.name.indexOf("Projection")==-1;
            });

            var metrics = _.map( nonProjectionMetrics, function(m) {
                return {
                    field : m.field,
                    as : m.description,
                    display : m.display,
                    f : m.f
                };
            });

            return metrics;
        },

        getDerivedFieldsOnInput : function () {
            // XS 1, S 3, M 5, L 8, XL 13
            return [
                {
                    as: 'CalcPreliminaryEstimate',
                    f:  function(row) {
                        var r = _.find(self.peRecords, function(rec) { return rec.get("ObjectID") == row.PreliminaryEstimate; });
                        var v = r !== undefined ? r.get("Value") : 0;
                        return v;
                    }
                },
                {
                    as: 'Completed',
                    f:  function(row) {
                        if (!self.featureCompleteByState)
                            return row.PercentDoneByStoryCount == 1 ? 1 : 0;
                        else
                            // console.log("state","'"+row['State']+"'",self.featureCompleteState);
                            return row['State']==self.featureCompleteState;
                    }
                }
            ];
        },

        getMidPointIndex : function(dateSeries) {

            var today = new Date();

            var tdi = _.findIndex(dateSeries,function(d) {
                return ( today.setHours(0,0,0,0) === new Date(Date.parse(d)).setHours(0,0,0,0))
            });

            return tdi !== -1 ? Math.round(tdi/2) : -1;

        },


        calcProjectionPoint : function(seriesName,projectOn,row, index, summaryMetrics, seriesData, projectFrom) {

            var that = this;

            // for first point we save the data set on which we are going to do the linear projection on
            // we also optionally filter out values.
            if (index === 0) {
                console.log("Projection:",seriesName)
                datesData = _.pluck(seriesData,"label");
                var mid = self.getMidPointIndex(datesData);
                var today = new Date();
                var li = datesData.length-1;

                // that.data[seriesName] = _.pluck(seriesData,seriesName);
                that.data[seriesName] = _.pluck(seriesData,projectOn);
                console.log("Projection Data:",that.data[seriesName]);
                // if (seriesName==="Story Points") console.log(that.data[seriesName].length);
                // filter to just values before today
                that.data[seriesName] = _.filter(
                    that.data[seriesName], function(d,i) {
                        if (!_.isUndefined(projectFrom) && projectFrom==="mid") {
                            return (i < mid);
                        } else {
                            return new Date(Date.parse(datesData[i])) < today;
                        }
                    }
                );
                // if (seriesName==="Story Points") console.log(that.data[seriesName].length);
                // optionally remove zero values
                var dx = that.data[seriesName].length;
                if (self.ignoreZeroValues===true) {
                    that.data[seriesName] = _.filter(
                        that.data[seriesName], function(d,i) {
                            return i != 0 ? (d !== 0) : true;
                        }
                    );
                }
                // if (seriesName==="Story Points") console.log(that.data[seriesName].length);
                // if we do remove values from the data set then we need to save an offset
                // so we are calculating the projection on the revised length
                var dy = that.data[seriesName].length;
                that.indexOffset[seriesName] = dx - dy;

                // calculate an offset between the projected value and the actual accepted values.
                that.lastAccepted[seriesName] = that.data[seriesName][that.data[seriesName].length-1];
                console.log("lastAccepted",that.lastAccepted[seriesName],seriesName);
                var lastProjected = linearProject( that.data[seriesName], that.data[seriesName].length-1);
                // if (seriesName==="Story Points")
                //     console.log("la",lastAccepted,"lp",lastProjected);
                that.pointsOffset[seriesName] = that.lastAccepted[seriesName]-lastProjected;
            }
            index = index - that.indexOffset[seriesName];
            var y = linearProject( that.data[seriesName], index) + that.pointsOffset[seriesName];
            // use the last value if the flat scope projection setting is true
            // console.log("flatScopeProjection",self.flatScopeProjection,seriesName,that.lastAccepted[seriesName]);
            if (self.flatScopeProjection===true) {
                if (seriesName=="StoryPointsProjection" || seriesName=="StoryCountProjection")
                    y = that.lastAccepted[seriesName];
            }
            y = Math.round(y * 100) / 100;
            return _.isNaN(y) ? null : y;
        },

        getDerivedFieldsAfterSummary : function () {

            // get the set of projection metrics
            var projectionMetrics = _.filter(self.series,function(s) {
                return s.name.indexOf("Projection")!==-1;
            });

            var metrics = _.map( projectionMetrics, function(m) {
                return {
                    as : m.description,
                    projectOn : m.projectOn,
                    projectFrom : m.projectFrom,
                    name : m.name,
                    f : function(row,index,summaryMetrics,seriesData) {
                        var p = self.calcProjectionPoint(this.name,this.projectOn,row,index,summaryMetrics,seriesData,this.projectFrom);
                        return p;
                    }
                };
            });
            return metrics;

        },

        defined : function(v) {
            return (!_.isUndefined(v) && !_.isNull(v));
        }
    };
   
});
