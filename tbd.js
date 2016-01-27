//Mongo Collections

Classifieds = new Mongo.Collection("classifieds");
Offers = new Mongo.Collection("Offers");
Images = new Mongo.Collection("Images");
Zipcodes = new Mongo.Collection("zipcodes");

//Modules
Modules = {};
Modules.both = {};
Modules.client = {};
Modules.server = {};

//Router

Router.configure({
    layoutTemplate: 'ApplicationLayout'
});


Router.route('/', function() {
    this.render('Home');
});

//Routes/classifieds
let _query_obj_from_filters = function(){
    let qo = {};
    qo.owner = {$ne: Meteor.userId()};
    //If filters exist, set them
    if(Session.get('classiFilters')){
        let filters = Session.get('classiFilters');
        //Check for filter exists
        if(filters.adType && filters.adType !== 'all'){
            if(filters.adType === 'car'){
                qo.adType = 'car';
            } else if(filters.adType === 'part'){
                qo.adType = 'part';
            } else {
                throw new Meteor.Error('Bad-Filter');
            }
        }
        //Build Price Range
        if(filters.pricemin || filters.pricemax){
            let minset = filters.pricemin !== undefined && filters.pricemin !== null && !isNaN(filters.pricemin) && filters.pricemin !== '';
            let maxset = filters.pricemax !== undefined && filters.pricemax !== null && !isNaN(filters.pricemax) && filters.pricemax !== '';
            if(minset && maxset){
                qo.asking = {$gte: filters.pricemin, $lte: filters.pricemax};
            } else if(minset && !maxset){
                qo.asking = {$gte: filters.pricemin};
            } else if(!minset && maxset) {
                qo.asking = {$lte: filters.pricemax};
            } else if(!minset && !maxset){
                qo.asking = {$ne: null};
            } else {
                throw new Meteor.Error('Bad-filter');
            }
        }

        //build keywords

        if(filters.keywords && filters.keywords.length > 1){
            qo.title = {$regex: '.*' + filters.keywords + '.*', $options: 'i'};
        }

        //hide/show accepted offers

        if(!filters.showAcceptedOffers){
            qo.hasAcceptedOffers = {$ne: true};
        }
    }
    console.log(qo);
    return qo;
};

Router.route('/classifieds/', function(){
    this.render('allClassifieds', {
        data:{
            classifieds: function() {
                return Classifieds.find(
                    {
                        owner: {$ne: Meteor.userId()},
                        hasAcceptedOffers: {$ne: true}
                    },
                    {sort: {createdAt: -1}});
            }
        }
    });
},{
    name: 'classifieds'
});

Router.route('/classifieds/mine', function(){
    this.render('ClassifiedsMine',{
        data: {
            classifieds: function(){
                return Classifieds.find({owner: Meteor.userId()}, {sort: {createdAt: -1}});
            }
        }
    });
},{
    name: 'classifieds.mine'
});

Router.route('/classifieds/new', function() {
    this.render('ClassifiedNew');
},{
    name: 'classified.new'
});

Router.route('/classified/:_id', function(){
    var classId = this.params._id;
    this.layout('ApplicationLayout');

    this.render('ClassifiedShow', {
        data:
        function(){
            return Classifieds.findOne({_id: classId});
        }
    });

},{
    name: 'classified.show'
});



Router.route('classifieds/:_id/offers/:buyerId', function() {
    this.render('BuyerOffers', {
        data: function() {
            return Offers.find({classi: this.params._id, buyer: this.params.buyerId});
        }
    });
});

Router.route('/classified/:_id/edit', function(){
    this.render('ClassifiedEdit',{
        data: function () {
            return Classifieds.findOne({_id: this.params._id});
        }
    });
},{
    name: 'classified.edit'
});

Router.route('classifieds/:_id/edit/images', function(){
    this.render('ClassifiedEditImages', {
        data: function() {
            return Classifieds.findOne({_id: this.params._id});
        }
    });
},{
    name: 'classified.edit.images'
});

Router.route('proifle/mine', function(){
   this.render('ProfileMine', {
       data: function(){
           return Meteor.user();
       }
   });
},{
    name: 'profile.mine'
});

Router.route('dashboard', function(){
   this.render('Dashboard', {
       data: {}
   });
}, {
    name: 'dashboard'
});
//Server

if (Meteor.isServer) {

    S3.config = {
        key: Meteor.settings.AWSAccessKeyId,
        secret: Meteor.settings.AWSSecretAccessKey,
        bucket: 'tbdc-photo'
    };

    //Publish Rules
    Meteor.publish('images', function() {
        return Images.find();
    });
    Meteor.publish("classifieds", function () {
        return Classifieds.find({
            $or: [
                { posted: true},
                { owner: this.userId }
            ]
        });
    });
    Meteor.publish('offers', function() {
        return Offers.find({
            $or: [
                {recipient: this.userId},
                {sender: this.userId}
            ]
        });
    });
    Meteor.publish('zipcodes', function() {
        return Zipcodes.find();
    });

    Meteor.users.before.insert(function (userId, doc) {
        let zipnum = parseInt(doc.profile.zipcode);
          let zippy = Zipcodes.findOne({zip_code: zipnum});
            if(zippy){
                          doc.profile.zipcode = zippy;
          doc.profile.loc = {
              type: "Point",
              coordinates: [
                  zippy.longitude,
                  zippy.latitude
              ]
          };
            }

    });

    //Flag the classi if it has accpeted offers
    Offers.after.update(function(userId, doc){
        if(doc.status === 'accepted'){
            Classifieds.update(doc.classi, {
                $set: {
                    hasAcceptedOffers: true
                }
            });
        }
    });
}


//Startup items
if (Meteor.isServer) {
    Meteor.startup(function () {
        // code to run on server at startup
    });
}

//Client

if (Meteor.isClient) {


    //Global Template Helpers
    Template.registerHelper('reldate', (date)=> {
        return date ? moment(date).fromNow() : '';
    });

    Template.registerHelper('semiStringSplit', function (str) {
        return str ? str.split(';') :  [];
    });
    Template.registerHelper('formatusd', (num)=> {
        return numeral(num).format('$ 0,0[.]00');
    });

    let _distance = function(pointA, pointB){
        var dx = pointB[0] - pointA[0];
        var dy = pointB[1] - pointA[1];

        var dist = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2)) * 69;

        return Math.floor(dist);
    };

    //location stuff
    let _getUserLoc = function(){
        //if user still has integer zip, grab the whole object
        if(!Meteor.user().profile.loc){
            Meteor.call('updateUserZip', Meteor.user().profile.zipcode);
        }
        return Meteor.user().profile.loc;
    };

    //uploadToAmazonS3
    let template;

    let _getFileFromInput = (event) => event.target.files;

    let _setPlaceholderText = (string = "Upload a file!") => {
        template.find(".alert span").innerText = string;
    };

    let _uploadFileToAmazonS3 = (file, parent, followup) => {
        //TODO make underscore each
        S3.upload({
            files: file,
            unique_name: true
        }, function (error, result) {
            if (error) {
                console.log('ERROR: ' + error);
            }
            console.log('it worked?' + result.url);
            Meteor.call(followup, parent, result.url);
        });
    };

    Modules.client.uploadToAmazonS3 = function (options) {
        template = options.template;


        let file = _getFileFromInput(options.event);
        _setPlaceholderText('Uploading ' + file.name + '...');

        _uploadFileToAmazonS3(file, options.parent, options.followup);

    };


    //Subscriptions
    Meteor.subscribe("classifieds");
    Meteor.subscribe('offers');
    Meteor.subscribe('images');

    //Uploader
    Template.GeneralClassiUploader.events({
        'change input[type="file"]': function (event, template) {
            Modules.client.uploadToAmazonS3({
                event: event,
                template: template,
                parent: this._id,
                followup: 'addImageToClassified'
            });
        }
    });



    let _set_classi_filter = function (k, v) {
        console.log('Filters Before: ' + Session.get('classiFilters'));
        let filters = Session.get('classiFilters');
        if (filters === undefined) {
            filters = {};
        }
        filters[k] = v;
        Session.set('classiFilters', filters);
    };

    let _set_classiFilter_debounced = _.debounce(function(k, v){
        _set_classi_filter(k,v);
    }, 300, false);

    Template.ClassifiedControl.events({
        "click .filter-type-input-all": function () {
            _set_classi_filter('adType', 'all');
        },
        "click .filter-type-input-cars": function () {
            _set_classi_filter('adType', 'car');
        },
        "click .filter-type-input-parts": function () {
            _set_classi_filter('adType', 'part');
        },
        "keyup .filter-keyword-input": function (event) {
            //todo: ESCAPE THIS SHIT
            let filterkw = event.target.value;
            _set_classi_filter('keywords', filterkw);
        },
        "keyup .filter-price-max-input": function (event) {
            //todo: ESCAPE THIS SHIT
            let pm = parseInt(event.target.value);
            _set_classi_filter('pricemax', pm);
        },
        "keyup .filter-price-min-input": function (event) {
            //todo: ESCAPE THIS SHIT
            let pm = parseInt(event.target.value);
            _set_classi_filter('pricemin', pm);
        },
        "submit .classi-filters": function (event) {
            event.preventDefault();
            Session.set('classiFilters', {adType: 'all'});
            console.log('Filters After: ' + JSON.stringify(Session.get('classiFilters')));
            event.target.keywords.value = null;
            event.target.pricemin.value = null;
            event.target.pricemax.value = null;
        },
        "click .save-filters-button": function () {
            event.preventDefault();
            let currentFilters = Session.get('classiFilters');
            if (currentFilters && currentFilters !== {}) {
                Meteor.call('saveClassiFilters', currentFilters);
            }
        },
        "click .filter-show-accepted-offers-input" : function(event){
            let showAcOff = event.target.checked;
            _set_classi_filter('showAcceptedOffers' , showAcOff);
        }
    });

    Template.MySavedFilters.events({
        "click .delete-filter-button": function (event) {
            event.preventDefault();
            let really = confirm("Are you sure you really want to delete this filter? You can't undo this.");
            if (really) {
                Meteor.call('deleteClassiFilter', this);
            }
        },
        "click .filter-select-control": function (event) {
            Session.set('classiFilters', this);
        }
    });


    Template.allClassifieds.helpers({
        filteredClassifieds: function () {
            if (Session.get('classiFilters') !== undefined) {
                return Classifieds.find(
                    _query_obj_from_filters(),
                    {sort: {createdAt: -1}});
            } else {
                return Classifieds.find(
                    {owner: {$ne: Meteor.userId()}},
                    {sort: {createdAt: -1}});
            }
        }
    });
    Template.ClassifiedFilterControls.helpers({
        selectedAdType: function (intyp) {
            //todo: define this defualt behaivor elsewhrre?
            if (Session.get('classiFilters') === undefined && intyp === 'all') {
                return 'btn-primary';
            } else if (Session.get('classiFilters') !== undefined && Session.get('classiFilters').adType === intyp) {
                return 'btn-primary';
            }
        },
        filterVal: function (filterType) {
            if(Session.get('classiFilters')){
                return Session.get('classiFilters')[filterType] || null;
            } else {
                return null;
            }
        },
        showAcceptedOffersChecked: function(){
            let rv = '';
            if(Session.get('classiFilters') && Session.get('classiFilter').showAcceptedOffers){
                rv = 'checked';
            }
            return rv;
        }
    });


    Template.MySavedFilters.helpers({
        savedFiltersForUser: function () {
            let filts = Meteor.user().profile ? Meteor.user().profile.savedClassiFilters : false;
            if (filts) {
                return _.values(filts);
            } else {
                return [];
            }
        }

    });

    let _classiHasAcceptedOffers = function(classiId){
        return Offers.find({status: 'accepted', classi: classiId}).count() > 0;
    };

    Template.Dashboard.helpers({
        openClassifiedsForUser: function () {
            let classis = Classifieds.find({owner: Meteor.userId()}, {sort: {createdAt: -1}});
            let opens = [];
            classis.forEach(function(it){
                if(!_classiHasAcceptedOffers(it._id)){
                    opens.push(it);
                }
            });
            return opens;
        },
        closedClassifiedsForUser: function(){
            let classis = Classifieds.find({owner: Meteor.userId()}, {sort: {createdAt: -1}});
            let closeds = [];
            classis.forEach(function(it){
                if(_classiHasAcceptedOffers(it._id)){
                    closeds.push(it);
                }
            });
            return closeds;
        },
        pendingOffersForUser: function(){
             return Offers.find({
                status: 'pending',
                classiOwnerId: {$ne: Meteor.userId()}
            });
        },
        declinedOffersForUser: function(){
             return Offers.find({
                status: 'declined',
                 classiOwnerId: {$ne: Meteor.userId()}
            });
        },
        acceptedOffersForUser: function(){
            return Offers.find({
                status: 'accepted',
                classiOwnerId: {$ne: Meteor.userId()}
            });
        },
        numPendingOffersForClassi: function(c){
            return Offers.find({
                classi: c._id,
                classiOwnerId: Meteor.userId(),
                status: 'pending'
            }).count();
        }
    });

    Template.DashboardOfferStub.helpers({
        classiForOffer: function(){
            return Classifieds.findOne({_id: this.classi});
        }
    });

    Template.DashboardClassiStub.events({
        "click .visit-classi-button" : function(event, tmpl) {
            Router.go('classified.show', {_id: this._id});
        }
    });

    Template.DashboardClassiStub.helpers({

    });

    //Classified Fields
    Template.ClassifiedFields.onCreated(function () {
        this.state = new ReactiveDict();
        this.state.set('willship', null);
        this.state.set('adType', null);
        this.state.set('mod', null);
        this.state.set('problem', null);
        this.state.set('mods', null);
        this.state.set('problems', null);
    });

    Template.ClassifiedFields.helpers({
        adTypeSelected: function (val, selopt) {

            return val === selopt ? {selected: 'selected'}
                : '';
        },
        isCar: function () {
            let cv = Template.instance().state.get('adType');
            return cv !== null ? cv === 'car' : this.adType === 'car';
        },
        isShippy: function () {
            let sv = Template.instance().state.get('willship');
            return sv !== null ? sv : this.willship;
        },
        modsArr: function () {
            let modsarr = Template.instance().state.get('mods');
            let prevmods = this.mods ? this.mods.split(';') : [];
            return modsarr !== null ? modsarr : prevmods;
        },
        modsStr: function () {
            let modsarr = Template.instance().state.get('mods');
            return modsarr !== null ? modsarr.join(';') : this.mods || '';
        },
        probsArr: function () {
            let probsarr = Template.instance().state.get('problems');
            let prevprobs = this.problems ? this.problems.split(';') : [];
            return probsarr !== null ? probsarr : prevprobs;
        },
        probsStr: function () {
            let probsarr = Template.instance().state.get('problems');
            return probsarr !== null ? probsarr.join(';') : this.problems || '';
        }

    });

    Template.ClassifiedFields.events({
        "change .toggle-willship": function (event, tmpl) {
            tmpl.state.set('willship', event.target.checked);
        },
        "change .adType-input": function (event, tmpl) {
            tmpl.state.set('adType', event.target.value);
        },
        "change .new-mod-input": function (event, tmpl) {
            tmpl.state.set('mod', event.target.value);
        },
        "change .new-prob-input": function (event, tmpl) {
            tmpl.state.set('problem', event.target.value);
        },
        "click .add-mod-item": function (event, tmpl) {
            event.preventDefault();
            let prevmods = this.mods ? this.mods.split(';') : [];
            let mods = tmpl.state.get('mods') || prevmods;
            let currmod = tmpl.state.get('mod');
            if (currmod && !_.contains(mods, currmod)) {
                mods.push(currmod);
                tmpl.state.set('mods', mods);
                tmpl.state.set('mod', null);
                tmpl.find('.new-mod-input').value = '';
            }
        },
        "click .remove-mod-item": function (event, tmpl) {
            //TODO: This is fucking ugly
            let assocmod = event.target.parentElement.innerText;
            let ms = tmpl.state.get('mods') || this.mods.split(';');
            ms = _.without(ms, assocmod);
            tmpl.state.set('mods', ms);
        },
        "click .add-prob-item": function (event, tmpl) {
            event.preventDefault();
            let prevprobs = this.problems ? this.problems.split(';') : [];
            let probs = tmpl.state.get('problems') || prevprobs;
            let currprob = tmpl.state.get('problem');
            if (currprob && !_.contains(probs, currprob)) {
                probs.push(currprob);
                tmpl.state.set('problems', probs);
                tmpl.state.set('problem', null);
                tmpl.find('.new-prob-input').value = '';
            }
        },
        "click .remove-prob-item": function (event, tmpl) {
            //TODO : ALSO FUCKING UGLY
            let assocprob = event.target.parentElement.innerText;
            let probs = tmpl.state.get('problems') || this.problems.split(';');
            probs = _.without(probs, assocprob);
            tmpl.state.set('problems', probs);
        }
    });

    //EditClassifiedForm
    Template.editClassifiedForm.events({

        "submit .classified-fields": function (event) {
            event.preventDefault();
            var deltaClassi = {};
            deltaClassi.make = event.target.make.value;
            deltaClassi.mdel = event.target.mdel.value;
            deltaClassi.posted = true;
            deltaClassi.asking = parseInt(event.target.asking.value);
            deltaClassi.adType = event.target.adType.value;
            deltaClassi.willship = event.target.willship.checked;
            if (event.target.willship.checked === true) {
                deltaClassi.shiprestric = event.target.shiprestric.value;
            }
            let yearstr = '';
            if (event.target.adType.value === 'car') {
                deltaClassi.problems = event.target.problems.value;
                deltaClassi.mods = event.target.mods.value;
                deltaClassi.year = parseInt(event.target.year.value);
                yearstr = event.target.year.value;
            }

            deltaClassi.title = '' + yearstr + ' ' + deltaClassi.make + ' ' + deltaClassi.mdel;
            deltaClassi.desc = event.target.desc.value;

            let filledOut = _.reduce(deltaClassi, function(memo, val){return memo && ((_.isString(val) && ! _.isEmpty(val)) || (_.isNumber(val) && !_.isNaN(val)) || (_.isBoolean(val))) ;}, true);

            if(!filledOut){
                Flash.danger('You have to fill all the fields out to post ads. If you don\'t know something, just type "I don\'t know" or "none" or something like that.');
            } else {


                Meteor.call("updateClassified", this._id, deltaClassi);
            }


        },
        "click .delete-button": function () {
            Meteor.call("deleteClassified", this._id);
        },
        "click .cancel-edit-classi-button": function () {
            Router.go('classified.show', {_id: this._id});
        }
    });

    //NewClassifiedForm
    Template.newClassifiedForm.events({
        "submit .classified-fields": function (event) {
            event.preventDefault();


                var newClassi = {};
                newClassi.posted = true;
                newClassi.adType = event.target.adType.value;
                newClassi.asking = parseInt(event.target.asking.value);
                newClassi.willship = event.target.willship.checked;
                newClassi.make = event.target.make.value;
                newClassi.mdel = event.target.mdel.value; //is model a dirty word?
                if (event.target.willship.checked === true) {
                    newClassi.shiprestric = event.target.shiprestric.value;
                }
                newClassi.desc = event.target.desc.value;
                let yearstr = '';
                if (event.target.adType.value === 'car') {
                    newClassi.problems = event.target.problems.value;
                    newClassi.mods = event.target.mods.value;
                    newClassi.year = parseInt(event.target.year.value);
                    yearstr = newClassi.year + ' ';
                }
                newClassi.title = '' + yearstr + ' ' + newClassi.make + ' ' + newClassi.mdel;

            let filledOut = _.reduce(newClassi, function(memo, val){return memo && ((_.isString(val) && ! _.isEmpty(val)) || (_.isNumber(val) && !_.isNaN(val)) || (_.isBoolean(val))) ;}, true);

            if(!filledOut){
                Flash.danger('You have to fill ALL the fields out to post ads, even mods & problems. If you don\'t know something or it does not apply, just type "I don\'t know" or something like that.');
            } else {

                Meteor.call("addClassified", newClassi);
                event.target.title.value = "";
            }
        }
    });


    //ClasssifiedEditImages
    Template.ClassifiedEditImages.events({
        "click .images-done-button": function (event) {
            Router.go('classified.show', {_id: this._id});
        }
    });

    //ClassifiedStub
    Template.ClassifiedStub.helpers({
        firstImage: function () {
            if (this.images){
                return this.images[0] || "";
            }
        },
        adTypeIcon: function () {
            if (this.adType === 'car') {
                return 'glyphicon-ice-lolly-tasted';
            } else if (this.adType === 'part') {
                return 'glyphicon-glass';
            }
        }
    });

    Template.ClassifiedStub.events({
        "click .classified-stub": function (event) {
            Router.go('classified.show', {_id: this._id});
        }
    });


    //ClassifiedDetailView
    Template.ClassifiedDetailView.helpers({
        firstImage: function () {
            return this.images ? this.images[0] : "";
        },
        distanceFromUser: function () {
            if(this.loc && this.loc.coordinates && Meteor.user().profile.loc.coordinates){
                let dist = _distance(this.loc.coordinates, Meteor.user().profile.loc.coordinates);
                console.log('dist: '+ dist);
                return dist;
            } else {
                return 0;
            }
        }

    });
    //ClassifiedShow
    Template.ClassifiedShow.helpers({
        isClassifiedOwner: function () {
            return this.owner === Meteor.userId();
        },
        offers: function () {
            //if seller
            if (this.owner === Meteor.userId()) {
                //look to see who's selected (if anyone)
                //return only offers between seller & selected

            } else {
                //else just return them all
                return Offers.find({classi: this._id});
            }
        },
        buyersWithOffersIn: function () {
            return Offers.find({classi: this._id});
        },
        okMakeNewOffer: function () {
            let okmakeoffer = false;
            okmakeoffer = this.owner !== Meteor.userId() && Meteor.userId() && Offers.find({
                    $or: [
                        {classi: this._id, status: 'accepted'},
                        {classi: this._id, createdBy: Meteor.userId(), status: 'pending'}
                    ]
                }).count() === 0;
            return okmakeoffer;
        },

    });

    Template.ClassifiedShow.events({
        "click .edit-button": function () {
            Router.go('classified.edit', {_id: this._id});
        },
        "click .edit-pics-button": function () {
            Router.go('classified.edit.images', {_id: this._id});
        },
        "click .delete-ad-button": function () {
            let deleteit = confirm("Do you really want to delete this WHOLE ad? You can't undo this.");
            if (deleteit) {
                Meteor.call('deleteClassified', this._id);
                Router.go('classifieds.mine');
            }
        }
    });


    //ClassifiedImageShow
    Template.ClassiImageShow.events({
        "click .delete-image-button": function (event) {
            let classi = Template.parentData(1)._id;
            Meteor.call('removeImageFromClassified', classi, this + '');
        }

    });

    Template.ClassiImageShow.helpers({
        imageUrlForImageId: function () {
            return this;
        }
    });

    Template.strArrayDingus.events({});

    //OfferNew
    Template.OfferNew.events({
        "submit .new-offer-form": function (event, tmpl) {
            event.preventDefault();
            var newOffer = {};
            newOffer.msg = event.target.msg.value;
            newOffer.amnt = event.target.amnt.value;
            newOffer.classi = this._id;
            tmpl.find('.offer-input-field').value = '';
            Meteor.call('addOffer', newOffer);
            return false;
            //TODO: not sure why this return false is needed here
            /* http://stackoverflow.com/questions/18605963/touchend-event-triggers-twice-using-meteor */
        }
    });


    //OfferShow
    Template.OfferShow.events({
        "submit .counter-offer-form": function (event) {
            event.preventDefault();
            var newOffer = {};
            newOffer.msg = event.target.msg.value;
            newOffer.amnt = event.target.amnt.value;
            Meteor.call('makeCounterOffer', this._id, newOffer);
        },
        "click .accept-offer-button": function (event) {
            Meteor.call('acceptOffer', this._id);
        }
    });

    Template.OfferShow.helpers({
        isSender: function () {
            return this.sender === Meteor.userId();
        },
        okToCounter: function () {
            return this.status !== 'accepted' && this.status !== 'declined';
        },
        statusClass: function () {
            let retclass = '';
            if (this.status === 'accepted') {
                retclass = 'bg-success';
            } else if (this.status === 'pending') {
                retclass = 'bg-warning';
            } else if (this.status === 'declined') {
                retclass = 'bg-danger';
            }
            return retclass;
        },
        statusMsg: function () {

            let retclass = '';
            if (this.status === 'accepted') {
                retclass = 'Accepted';
            } else if (this.status === 'pending') {
                retclass = 'Haven\'t Responded';
            } else if (this.status === 'declined') {
                retclass = 'Declined';
            }
            return retclass;

        }
    });


    //BuyerOffers View
    Template.BuyerOffers.helpers({
        offersForClassi: function () {
            return Offers.find({classi: this._id});
        }
    });

    //OffersView
    Template.OffersView.helpers({
        /*buyersFromOffers: function(){
         let offers = Offers.find({classi: this._id}).fetch();
         let buyers = _.keys(_.groupBy(offers, 'createdByUname'));
         return buyers;
         },*/
        offersThreadedByBuyer: function () {
            let offers = Offers.find({classi: this._id}).fetch();
            let buyers = _.keys(_.groupBy(_.filter(offers, function (offy) {
                return offy.sender !== offy.classiOwnerId;
            }), 'createdBy'));

            let othreads = [];
            _.each(buyers, function (el, index, list) {
                othreads[index] = {};
                othreads[index].buyer = el;
                othreads[index].offers = _.filter(offers, function (offer) {
                    return offer.sender === el || offer.recipient === el;
                });
                if (othreads[index].offers.length > 0) {
                    othreads[index].buyer = othreads[index].offers[0].createdByUname;
                }
            });
            return othreads;

        }

    });

    //OfferThread
    Template.OfferThread.helpers({
        isClassiOwner: function () {
            return this.classId === Meteor.userId();
        },
        collaspseStatus: function () {
            return Template.instance().state.get('collapsed');
        },
        numOffers: function () {
            return this.offers.length;
        }
    });

    Template.OfferThread.events({
        "click .offer-thread-heading": function (event, tmpl) {
            tmpl.state.set('collapsed', !Template.instance().state.get('collapsed'));
        }
    });
    Template.OfferThread.onCreated(function () {
        this.state = new ReactiveDict();
        this.state.set('collapsed', false);
    });

    //AccountsUI
    Accounts.ui.config({
        passwordSignupFields: "USERNAME_ONLY",
        extraSignupFields: [{
            fieldName: 'zipcode',
            fieldLabel: 'Zip Code',
            showFieldLabel: true,
            inputType: 'text',
            visible: true,
            validate: function (value, errorFunction) {
                if (!value) {
                    errorFunction('The zip is blank, how are people going to know if your stuff is too far away?');
                    return false;
                } else {
                    return true;
                }
            }
        }]
    });
    Template._loginButtonsLoggedInDropdown.events({
        'click #login-buttons-edit-profile': function(event) {
            Router.go('profile.mine');
        }
    });
    Template.ProfileMine.events({
        "submit .user-profile-form" : function(event){
            event.preventDefault();
            Meteor.call('updateUserZip', event.target.zipcode.value);
        }
    });
}
   


//Methods


Meteor.methods({

    updateUserZip: function(newZip){
      if(Meteor.userId()){
          let procop = Meteor.user().profile || {};
          let zipnum = parseInt(newZip);
          let zippy = Zipcodes.findOne({zip_code: zipnum});
          procop.zipcode = zippy;
          procop.loc = {
              type: "Point",
              coordinates: [
                  zippy.longitude,
                  zippy.latitude
              ]
          };
          Meteor.users.update(Meteor.userId(), {$set: {profile: procop}});
      }
    },
    //Images
    addImage: function(parent) {
        let imageMeta = {};
        if( !Meteor.userId() ){
            throw new Meteor.Error("not-authorized");
        }
        imageMeta.userId = Meteor.userId();
        imageMeta.createdAt = new Date();
        imageMeta.parent = parent || 'none';
        return Images.insert(imageMeta, function(){
            if(result){
                return result;
            }
        });
    },

    //SavedFilters
    saveClassiFilters: function (filterObj) {
        if(Meteor.userId()){
            //make hash of filters
            //values.flatten.concat
            let keyfil = _.reduce(_.values(filterObj), function(memo, filt){ return memo + '' + filt;}, '');



            let procop = Meteor.user().profile || {};

            //filters obj exists on profile?
            if(!procop.savedClassiFilters){
                //create filters object
                procop.savedClassiFilters = {};
            }

            //no val? great, put em in there!
            if(!procop.savedClassiFilters[keyfil]){
                procop.savedClassiFilters[keyfil] = filterObj;
                Meteor.users.update(Meteor.userId(), {
                   $set: {profile: procop}
                });
             }
       }
    },

    deleteClassiFilter: function(filterObj) {
        let keyfil = _.reduce(_.values(filterObj), function(memo, filt){ return memo + '' + filt; }, '');

        let procop = Meteor.user().profile || {};

        //filters obj exists on profile?
        if(!procop.savedClassiFilters){
            //create filters object
            procop.savedClassiFilters = {};
        }

        //no val? great, put em in there!
        if(procop.savedClassiFilters[keyfil]){
            procop.savedClassiFilters = _.omit(procop.savedClassiFilters, keyfil);
            console.log(procop);
            Meteor.users.update(Meteor.userId(), {
                $set: {profile: procop}
            });
        }
    },

    //Classifieds

    removeImageFromClassified: function(parent, img){
        //if meteoruser == classified owner
        let classi = Classifieds.findOne(parent);
        let isOwner = Meteor.userId() === classi.owner;

        if(!Meteor.userId() || !isOwner){
            throw new Meteor.Error('not-authorized');
        }
        Classifieds.update(parent, {
            $pull: {
                images: img
            }
        });
    },
    addImageToClassified: function(parent, url) {
        
        Classifieds.update(parent, {
            $addToSet: {
                images: url
            }
        },function(error, result){
            if(error){
                throw new Meteor.Error('bad-insert: ' + error);
            }
            return result;
        });
    },
    addClassified: function(classi){

        let filledOut = _.reduce(classi, function(memo, val){return memo && ((_.isString(val) && ! _.isEmpty(val)) || (_.isNumber(val) && !_.isNaN(val)) || (_.isBoolean(val))); }, true);
        if(! Meteor.userId() || !filledOut) {
            throw new Meteor.Error("not-authorized");
        }
        classi.owner = Meteor.userId();
        classi.username = Meteor.user().username;
        classi.createdAt = new Date();
        classi.zipcode = Meteor.user().profile.zipcode;
        classi.loc = Meteor.user().profile.loc;
        classi.images = [];
        Classifieds.insert(classi, function(error, result){
            if(result){
                Router.go('classified.edit.images', {_id: result});
            }
        });
    },
    acceptedOffersExistForClassi: function(classiId) {
        return Offers.find({status: 'accepted', classi: classiId}).count() > 0;
    },
    deleteClassified: function (classiId) {
        Classifieds.remove(classiId);
    },
    updateClassified: function (classiId, updateObj){
        var oldObj = Classifieds.findOne(classiId);
        let filledOut = _.reduce(updateObj, function(memo, val){return memo && ((_.isString(val) && ! _.isEmpty(val)) || (_.isNumber(val) && !_.isNaN(val)) || (_.isBoolean(val))); }, true);
        if(oldObj.owner === Meteor.userId() && filledOut) {
            //copy over hidden fields from old object
            updateObj.createdAt = oldObj.createdAt;
            updateObj.owner = oldObj.owner;
            updateObj.zipcode = Meteor.user().profile.zipcode;
            updateObj.loc = Meteor.user().profile.loc;
            updateObj.updatedAt = new Date();
            updateObj.images = oldObj.images;
            updateObj.username = oldObj.username;

            Classifieds.update(classiId, updateObj, function(error, result){
                if(result){
                    Router.go('classified.show', {_id: classiId});
                }
            });
        }
    },
    //Offers
    addOffer: function(offer){
        var relatedClassi = Classifieds.findOne(offer.classi);
        var smellsOk = false;
        if(! Meteor.userId()) {
            throw new Meteor.Error("not-logged-in");
        } else if ( Meteor.userId() !== relatedClassi.owner ){
            //if you don't own the item, you can make buy offers
            smellsOk = true;
        } else {
            throw new Meteor.Error("not-authorized");
        }

        if(smellsOk){
            Offers.insert({
                amnt: offer.amnt,
                msg: offer.msg,
                createdBy: Meteor.userId(),
                createdByUname: Meteor.user().username,
                sender: Meteor.userId(),
                recipient: relatedClassi.owner,
                classi: offer.classi,
                classiOwnerUname: relatedClassi.username,
                classiOwnerId: relatedClassi.owner,
                status: 'pending',
                createdAt: new Date()
            }, function(error, result) {
                if (result) {
                    console.log('Result: '+ result);
                }
                if (error) {
                    console.log('Error: ' + error);
                }
            });
        }
    },
    acceptOffer: function(offerId) {
        //check that the submitter is logged in
        //get old offer
        var oldOffer = Offers.findOne(offerId);
        //check if offers exist already that are accepted
        var acceptedOffersExist = Meteor.call('acceptedOffersExistForClassi', oldOffer.classi);
        //check that person updating is either
        //the seller, and the offer was created by the buyer
        var ownOfer = oldOffer.createdBy === Meteor.userId();
        //the buyer, and the offer was created by the seller
        var isRecipi = oldOffer.recipient === Meteor.userId();

        if(Meteor.userId() && !acceptedOffersExist && !ownOfer && isRecipi){
            Offers.update(offerId, {
                $set: {
                    status: 'accepted',
                    updatedAt: new Date()
                }
            }, function (error, result) {
                if(result){
                    console.log('acceptemundo');
                }
            });
        }


    },
    makeCounterOffer: function(offerId, newOffer) {
        //check that the submitter is logged in

        //get the old offer
        var oldOffer = Offers.findOne(offerId);
        //check if offers exist already that are accepted
        var acceptedOffersExist = Meteor.call('acceptedOffersExistForClassi', oldOffer.classi);
        //check that the person updating is the recipient of the original offer
        var senderOk = oldOffer.recipient === Meteor.userId();
        if(Meteor.userId() && !acceptedOffersExist && senderOk){
            //set original offer status to "declined"
            Offers.update(offerId, {
                $set: {
                    status: 'declined',
                    updatedAt: new Date()
                }
            }, function(error, result){
                //check again!
                var acceptedOffersStillExist = Meteor.call('acceptedOffersExistForClassi', oldOffer.classi);

                if(result && !acceptedOffersStillExist){
                    //create new offer from newOffer object
                    Offers.insert({
                        amnt: newOffer.amnt,
                        msg: newOffer.msg,
                        createdBy: Meteor.userId(),
                        createdByUname: Meteor.user().username,
                        sender: Meteor.userId(),
                        recipient: oldOffer.sender,
                        inResponseTo: offerId,
                        classi: oldOffer.classi,
                        classiOwnerUname: oldOffer.classiOwnerUname,
                        classiOwnerId: oldOffer.classiOwnerId,
                        createdAt: new Date(),
                        status: 'pending'
                    }, function(error, result){
                        if(result){
                            console.log('New Offer created with id: ' + result);
                        }
                    });
                }
            });
        }else {
            throw new Meteor.Error("not-authorized");
        }
    }
});
