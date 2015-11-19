Classifieds = new Mongo.Collection("classifieds");
Offers = new Mongo.Collection("Offers");


//Router
Router.configure({
    layoutTemplate: 'ApplicationLayout'
});


Router.route('/', function() {
    this.render('Home');
});

//Classifieds Routes
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
    this.render('ClassifiedEdit',
        {
            data: function () {
                    return Classifieds.findOne({_id: this.params._id})
            }
        });
},{
    name: 'classified.edit'
});



//Server

if (Meteor.isServer) {
    // This code only runs on the server
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
if (Meteor.isServer) {
    Meteor.startup(function () {
        // code to run on server at startup
    });
}

//Client

if (Meteor.isClient) {

    Meteor.subscribe("classifieds");
    Meteor.subscribe('offers');

    Template.editClassifiedForm.events({
      "submit .classified-fields": function(event) {
          event.preventDefault();
          var deltaClassi = {};
          deltaClassi.title = event.target.title.value;
          deltaClassi.posted = event.target.posted.checked;
          Meteor.call("updateClassified",this._id, deltaClassi);
    },
    "click .delete-button" : function(){
      Meteor.call("deleteClassified", this._id);
    }
  });


    Template.newClassifiedForm.events({
        "submit .classified-fields" : function(event){
            event.preventDefault();
            var newClassi = {};
            newClassi.title = event.target.title.value;
            newClassi.posted = event.target.posted.checked;
            Meteor.call("addClassified", newClassi);
            event.target.title.value="";
        }

    });
    Template.ClassifiedShow.helpers({
        isClassifiedOwner: function () {
            console.log('isLCassifedOwner value: ' + this.owner);
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
            return Meteor.userId() && Offers.find({
                    $or: [
                        {classi: this._id, status: 'accpeted'},
                        {classi: this._id, createdBy: Meteor.userId()}
                    ]
                }).count() == 0;

        }


    });


    Template.ClassifiedShow.events({
        "click .edit-button": function () {
            Router.go('classified.edit', {_id: this._id});
        }
    });



    Template.OfferNew.events({
        "submit .new-offer-form" : function(event) {
            event.preventDefault();
            var newOffer = {};
            newOffer.msg = event.target.msg.value;
            newOffer.amnt = event.target.amnt.value;
            newOffer.classi =  this._id;
            Meteor.call('addOffer', newOffer);
        }
    });

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
    Template.OfferThread.helpers({
        isClassiOwner: function() {
            return this.classId === Meteor.userId();
        }
    });

    Template.OfferShow.helpers({
        isSender: function () {
            return this.sender === Meteor.userId();
        }
        ,okToCounter: function() {
            return this.status !== 'accepted' && this.status !== 'declined';
        }
    });

    Template.OffersView.helpers({
        offersForClassi: function(){
            console.log(this._id);
            return Offers.find({classi: this._id});
        }
    });


    Accounts.ui.config({
        passwordSignupFields: "USERNAME_ONLY"
    });

}

//Methods

Meteor.methods({
    addClassified: function(classi){
        if(! Meteor.userId()) {
            throw new Meteor.Error("not-authorized");
        }
        Classifieds.insert({
            title: classi.title,
            posted: classi.posted,
            owner: Meteor.userId(),
            username: Meteor.user().username,
            createdAt: new Date()
        }, function(error, result){
            if(result){
                Router.go('classified.show', {_id: result});
            }
        });
    },
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
    },
    acceptedOffersExistForClassi: function(classiId) {
        return Offers.find({status: 'accepted', classi: classiId}).count() > 0;
    },
    deleteClassified: function (classiId) {
        Classifieds.remove(classiId);
    },
    updateClassified: function (classiId, updateObj){
        var oldObj = Classifieds.findOne(classiId);
        if(oldObj.owner == Meteor.userId()) {
            console.log(updateObj);
            Classifieds.update(classiId, {
                $set: {title: updateObj.title,
                    posted: updateObj.posted},
            }, function(error, result){
                if(result){
                    Router.go('classified.show', {_id: classiId});
                }
            });
        }
    }
});

