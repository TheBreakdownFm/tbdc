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


//Server

if (Meteor.isServer) {

  S3.config = {
    key: Meteor.settings.AWSAccessKeyId,
    secret: Meteor.settings.AWSSecretAccessKey,
    bucket: 'tbdc-photo'
  }
 
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

  //uploadToAmazonS3
  let template;
  
  
  let _addImgForClassi = ( url, parent ) => {
    
    Meteor.call('addImage', parent, function(error, result){
      if(error){
        console.log(error);
      }
      //'Reuslt should be the ID of a new image
      console.log('Result in addImageToClassified callback: ' + result);

      //Use that as the amazon url
            
    });
  }
    
  
  let _getFileFromInput = (event) => event.target.files;
  
  let _setPlaceholderText = ( string = "Upload a file!" ) => {
    template.find( ".alert span" ).innerText = string;
  }
  
  let _uploadFileToAmazonS3 = ( file, parent ) => {
     //TODO make underscore each
    S3.upload({
      files: file,
      unique_name: true
    }, function(error, result){
      if(error){
        console.log('ERROR: ' + error);
      }
      console.log('it worked?' + result.url);
      Meteor.call('addImageToClassified', parent, result.url);
    });
  }
  
  let upload = function(options) {
    template = options.template;

    
    let file = _getFileFromInput( options.event);
    _setPlaceholderText('Uploading ' + file.name + '...');

    _uploadFileToAmazonS3(file, options.classiId);

  };
  
  
  Modules.client.uploadToAmazonS3 = upload;
  
  
  //Subscriptions
  Meteor.subscribe("classifieds");
  Meteor.subscribe('offers');
  Meteor.subscribe('images');

  //Uploader
  Template.uploader.events({
    'change input[type="file"]' (event, template){
      Modules.client.uploadToAmazonS3({event: event, template: template, classiId: this._id});
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
      deltaClassi.willship = event.target.willship.checked;
      deltaClassi.shiprestric = event.target.shiprestric.value;
      deltaClassi.desc = event.target.desc.value;
      deltaClassi.problems = event.target.problems.value;
      deltaClassi.mods = event.target.mods.value;
      Meteor.call("updateClassified",this._id, deltaClassi);
    },
    "click .delete-button" : function(){
      Meteor.call("deleteClassified", this._id);
    }
  });
  
  //NewClassifiedForm
  Template.newClassifiedForm.events({
    "submit .classified-fields" : function(event){
      event.preventDefault();
      var newClassi = {};
      newClassi.title = event.target.title.value;
      newClassi.posted = event.target.posted.checked;
      newClassi.asking = event.target.asking.value;
      newClassi.willship = event.target.willship.checked;
      newClassi.shiprestric = event.target.shiprestric.value;
      newClassi.desc = event.target.desc.value;
      newClassi.problems = event.target.problems.value;
      newClassi.mods = event.target.mods.value;
      Meteor.call("addClassified", newClassi);
      event.target.title.value="";
    }

  });

  //ClassifiedShow
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


  //ClassifiedImageShow
  Template.ClassiImageShow.events({
    //handle image delete
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
      newOffer.classi =  this._id;
      Meteor.call('addOffer', newOffer);
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
  });

  //OffersView
  Template.OffersView.helpers({
    offersForClassi: function(){
      console.log(this._id);
      return Offers.find({classi: this._id});
    }
  });

  //OfferThread
  Template.OfferThread.helpers({
    isClassiOwner: function() {
      return this.classId === Meteor.userId();
    }
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
        Router.go('classified.show', {_id: result});
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
      console.log(updateObj);
      //copy over hidden fields from old object
      updateObj.createdAt = oldObj.createdAt;
      updateObj.owner = oldObj.owner;
      updateObj.updatedAt = new Date();
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
