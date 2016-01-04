//Mongo Collections

Classifieds = new Mongo.Collection("classifieds");
Offers = new Mongo.Collection("Offers");
Images = new Mongo.Collection("Images");

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

Router.route('/classifieds/', function(){
    this.render('allClassifieds', {
        data:{
            classifieds: function() {
                return Classifieds.find({owner: {$ne: Meteor.userId()}}, {sort: {createdAt: -1}})
            }
        }
    });
},{
    name: 'classifieds'
});

Router.route('/classifieds/cars', function(){
    this.render('CarClassifieds', {
        data: {
            classifieds: function(){
                return Classifieds.find({owner: {$ne: Meteor.userId()}, adType: 'car'}, {sort: {createdAt: -1}})
            }
        }
    });
},{
    name: 'classifieds.cars'
});


Router.route('/classifieds/parts', function(){
    this.render('PartClassifieds', {
        data: {
            classifieds: function(){
                return Classifieds.find({owner: {$ne: Meteor.userId()}, adType: 'part'}, {sort: {createdAt: -1}})
            }
        }
    });
},{
    name: 'classifieds.parts'
});

Router.route('/classifieds/mine', function(){
    this.render('ClassifiedsMine',{
        data: {
            classifieds: function(){
                return Classifieds.find({owner: Meteor.userId()}, {sort: {createdAt: -1}})
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
            return Classifieds.findOne({_id: classId})
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
    })
});

Router.route('/classified/:_id/edit', function(){
    this.render('ClassifiedEdit',{
        data: function () {
            return Classifieds.findOne({_id: this.params._id})
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
    Template.registerHelper('reldate', (date)=>{
        return moment(date).fromNow(); 
    });

    Template.registerHelper('formatusd', (num)=>{
        return numeral(num).format('$ 0,0[.]00');
    });
    //uploadToAmazonS3
    let template;

    let _getFileFromInput = (event) => event.target.files;

    let _setPlaceholderText = ( string = "Upload a file!" ) => {
        template.find( ".alert span" ).innerText = string;
    };
    
    let _uploadFileToAmazonS3 = ( file, parent, followup ) => {
        //TODO make underscore each
        S3.upload({
            files: file,
            unique_name: true
        }, function(error, result){
            if(error){
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
        'change input[type="file"]' : function(event, template){
            Modules.client.uploadToAmazonS3({event: event, template: template, parent: this._id, followup:  'addImageToClassified'});
        }
    });




    
    //Classified Fields
    Template.ClassifiedFields.onCreated(function(){
        this.state = new ReactiveDict();
        this.state.set('willship', null);
        this.state.set('adtype', null);
    });

    Template.ClassifiedFields.helpers({
        adTypeSelected: function(val, selopt){

            return val === selopt ? {selected: 'selected'}
            : '' ;
        }
        ,isCar: function(){
            let cv = Template.instance().state.get('adtype');
            return cv != null ? cv === 'car' : this.adtype === 'car' || true;
        }
        ,isShippy: function() {
            let sv = Template.instance().state.get('willship');
            return sv != null ? sv : this.willship ;
        }
      
    });

    Template.ClassifiedFields.events({
        "change .toggle-willship" : function(event, tmpl){
            tmpl.state.set('willship', event.target.checked);
        },
        "change .adtype-input" : function(event, tmpl){
            tmpl.state.set('adtype', event.target.value);
        }
    });

    //EditClassifiedForm
    Template.editClassifiedForm.events({

        "submit .classified-fields": function(event) {
            event.preventDefault();
            var deltaClassi = {};
            deltaClassi.title = event.target.title.value;
            deltaClassi.posted = event.target.posted.checked;
            deltaClassi.asking = event.target.asking.value;
            deltaClassi.adType = event.target.adType.value;
            deltaClassi.willship = event.target.willship.checked;
            if(event.target.willship.checked === true){
                deltaClassi.shiprestric = event.target.shiprestric.value;
            }
            if(event.target.adType.value === 'car'){
                deltaClassi.problems = event.target.problems.value;
                deltaClassi.mods = event.target.mods.value;

            }
            deltaClassi.desc = event.target.desc.value;
            Meteor.call("updateClassified",this._id, deltaClassi);
        },
        "click .delete-button" : function(){
            Meteor.call("deleteClassified", this._id);
        }
        ,"click .cancel-edit-classi-button" : function(){
            Router.go('classified.show', {_id: this._id});
        }
    });

    //NewClassifiedForm
    Template.newClassifiedForm.events({
        "submit .classified-fields" : function(event){
            event.preventDefault();
            var newClassi = {};
            newClassi.title = event.target.title.value;
            newClassi.posted = event.target.posted.checked;
            newClassi.adType = event.target.adType.value;
            newClassi.asking = event.target.asking.value;
            newClassi.willship = event.target.willship.checked;
            if(event.target.willship.checked === true){
                newClassi.shiprestric = event.target.shiprestric.value;
            }
            newClassi.desc = event.target.desc.value;
            if(event.target.adType.value === 'car'){
                newClassi.problems = event.target.problems.value;
                newClassi.mods = event.target.mods.value;
            }
            Meteor.call("addClassified", newClassi);
            event.target.title.value="";
        }
    });
                                      
                                      



    //ClasssifiedEditImages
    Template.ClassifiedEditImages.events({
        "click .images-done-button" : function(event){
            Router.go('classified.show', {_id: this._id});
        }
    });

    //ClassifiedStub
    Template.ClassifiedStub.helpers({
        firstImage: function(){
            return this.images[0] || "";
        }
    });

    Template.ClassifiedStub.events({
        "click .classified-stub" : function(event) {
            Router.go('classified.show', {_id: this._id});
        }
    });
                                   
                                   

    //ClassifiedDetailView
    Template.ClassifiedDetailView.helpers({
        firstImage: function(){
            return this.images ? this.images[0] : "";
        }
    });
    //ClassifiedShow
    Template.ClassifiedShow.helpers({
        isClassifiedOwner: function () {
            return this.owner === Meteor.userId();
        }
        ,offers : function() {
            //if seller
            if(this.owner === Meteor.userId()){
                //look to see who's selected (if anyone)
                //return only offers between seller & selected

            } else {
                //else just return them all
                return Offers.find({classi: this._id});
            }
        }
        ,buyersWithOffersIn: function(){
            return Offers.find({classi: this._id,});
        }
        ,okMakeNewOffer : function() {
            let okmakeoffer = false;
            okmakeoffer = this.owner !== Meteor.userId() && Meteor.userId() && Offers.find({
                $or: [
                    {classi: this._id, status: 'accepted'},
                    {classi: this._id, createdBy: Meteor.userId(), status: 'pending'}
                ]
            }).count() == 0;
            return okmakeoffer;
        }
    });

    Template.ClassifiedShow.events({
        "click .edit-button": function () {
            Router.go('classified.edit', {_id: this._id});
        }
    });


    //ClassifiedImageShow
    Template.ClassiImageShow.events({
        "click .delete-image-button" : function(event){
            let classi = Template.parentData(1)._id;
            Meteor.call('removeImageFromClassified', classi, this + '');
        }

    });

    Template.ClassiImageShow.helpers({
        imageUrlForImageId: function(){
            return this;
        }
    });



    //OfferNew
    Template.OfferNew.events({
        "submit .new-offer-form" : function(event) {
            event.preventDefault();
            var newOffer = {};
            newOffer.msg = event.target.msg.value;
            newOffer.amnt = event.target.amnt.value;
            newOffer.classi = this._id;
            Meteor.call('addOffer', newOffer);
            return false;
            //TODO: not sure why this return false is needed here
            /* http://stackoverflow.com/questions/18605963/touchend-event-triggers-twice-using-meteor */
        }
    });


    //OfferShow
    Template.OfferShow.events({
        "submit .counter-offer-form" : function(event) {
            event.preventDefault();
            var newOffer = {};
            newOffer.msg = event.target.msg.value;
            newOffer.amnt = event.target.amnt.value;
            Meteor.call('makeCounterOffer', this._id, newOffer);
        }
        ,"click .accept-offer-button" : function(event) {
            Meteor.call('acceptOffer', this._id);
        }
    });

    Template.OfferShow.helpers({
        isSender: function () {
            return this.sender === Meteor.userId();
        }
        ,okToCounter: function() {
            return this.status !== 'accepted' && this.status !== 'declined';
        }
        ,statusClass: function() {
            let retclass = '';
            if(this.status === 'accepted'){
                retclass = 'bg-success';
            } else if(this.status === 'pending') {
                retclass = 'bg-warning';
            } else if(this.status === 'declined') {
                retclass = 'bg-danger';
            }
            return retclass; 
        }
        ,statusMsg: function() {

            let retclass = '';
            if(this.status === 'accepted'){
                retclass = 'Accepted';
            } else if(this.status === 'pending') {
                retclass = 'Haven\'t Responded';
            } else if(this.status === 'declined') {
                retclass = 'Declined';
            }
            return retclass; 

        }
    });



    //BuyerOffers View
    Template.BuyerOffers.helpers({
        offersForClassi: function() {
            return Offers.find({classi: this._id});
        }
    })

    //OffersView
    Template.OffersView.helpers({
        /*buyersFromOffers: function(){
            let offers = Offers.find({classi: this._id}).fetch();
            let buyers = _.keys(_.groupBy(offers, 'createdByUname'));
            return buyers;
        },*/
        offersThreadedByBuyer: function(){
            let offers = Offers.find( {classi: this._id} ).fetch();
            let buyers = _.keys(_.groupBy(_.filter(offers, function (offy){
                return offy.sender !== offy.classiOwnerId;
            }), 'createdBy'));

            console.log('Buyers: ' + buyers);
            console.log('Offers: ' + offers);
            let othreads = [];
            _.each(buyers, function(el, index, list){
                othreads[index] = {}
                othreads[index].buyer = el;
                othreads[index].offers = _.filter(offers, function(offer){
                    return offer.sender === el || offer.recipient === el;
                });
                if(othreads[index].offers.length > 0){
                    othreads[index].buyer = othreads[index].offers[0].createdByUname;
                }
            });
            console.log('Threads: ' + othreads);
            return othreads;

        }

    });

    //OfferThread
    Template.OfferThread.helpers({
        isClassiOwner: function() {
            return this.classId === Meteor.userId();
        }
        ,collaspseStatus: function () {
            return Template.instance().state.get('collapsed');
        }
        ,numOffers : function(){
            return this.offers.length;
        }
    });

    Template.OfferThread.events({
        "click .offer-thread-heading" : function(event, tmpl){
            console.log('CLicked');
            tmpl.state.set('collapsed', !Template.instance().state.get('collapsed'));
        }
    });
    Template.OfferThread.onCreated(function() {
        this.state = new ReactiveDict();
        this.state.set('collapsed', false);
    });

    //AccountsUI
    Accounts.ui.config({
        passwordSignupFields: "USERNAME_ONLY"
    });}
   


//Methods

Meteor.methods({


    //Images
    addImage: function(parent) {
        let imageMeta = {};
        if( !Meteor.userId() ){
            throw new Meteor.Error("not-authorized");
        }
        imageMeta.userId = Meteor.userId();
        imageMeta.createdAt = new Date();
        imageMeta.parent = parent || 'none';
        return Images.insert(imageMeta, function(error, result){
            if(result){
                return result;
            }
        });
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
                throw new Meteor.Error('bad-insert');
            }
            return result;
        });
    },
    addClassified: function(classi){
        if(! Meteor.userId()) {
            throw new Meteor.Error("not-authorized");
        }
        classi.owner = Meteor.userId();
        classi.username = Meteor.user().username;
        classi.createdAt = new Date();
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
        if(oldObj.owner === Meteor.userId()) {
            //copy over hidden fields from old object
            updateObj.createdAt = oldObj.createdAt;
            updateObj.owner = oldObj.owner;
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
                    })
                }
            });
        }else {
            throw new Meteor.Error("not-authorized");
        }
    }
});
