"use strict";

var util = require('util');
var AWS = require('aws-sdk');
var sanitize = require('sanitize-filename');

module.exports = {

  // Create a snapshot of an EC2 volume and clean any 'old' snapshots
  backupVolume: function(region, volumeName, backupsToKeep, callback) {
    var EC2 = new AWS.EC2({apiVersion: '2016-09-15', region: region});
    var volume = null;
    var tags = null;

    // Get the existing snapshots by getting the Volume using its name and then
    // using the volumeId to get all of it's snapshots
    console.log('Getting volume information...');
    var snapshots = EC2.describeVolumes({
      Filters: [{Name: "tag:Name", Values: [volumeName]}]
    }).promise().then(function(result){
      if(result.Volumes.length < 1){ callback('Volume not found'); return null;}
      volume = result.Volumes[0];
      console.log('Getting snapshot information...'); 
      return EC2.describeSnapshots({
            Filters: [ {Name: "volume-id", Values:[volume.VolumeId]} ]
            }).promise().then(function(result){
              return { Snapshots: result.Snapshots }; 
            })
    });


    // Get the tags of the existing volume
    console.log('Getting tags of existing volume...'); 
    var tags = EC2.describeTags({
      Filters: [{Name: "tag:Name", Values: [volumeName]}, {Name:'resource-type', Values: ['volume']}]
    }).promise().then(function(result){
      return result.Tags; 
    });

    // After all the necessary information is gathered, create the snapshot and clean up any old items
    Promise.all([snapshots, tags]).then(function(values) {
      if (volume == null ) { return null; }
      var snapshots = values[0];
      var tags = values[1];

      // Create the new snapshot
      var date = new Date().toISOString().replace(/-/g,"").replace(/:/g,"");
      var description = sanitize(volumeName)+'-snapshot-'+date;
      var snapshot = EC2.createSnapshot({
        Description: description,
        VolumeId: volume.VolumeId
      }).promise().then(function(data){
        var newTags = tags.map(function(tag){ return {Key: tag.Key, Value: tag.Value}; }); 
        EC2.createTags({Resources: [data.SnapshotId], Tags: newTags}).promise();
        return EC2.waitFor('snapshotCompleted', { SnapshotIds: [data.SnapshotId] }).promise();

      // Clean up old snapshots
      }).then(function(data){
        var oldSnapshots = 1;
        if(oldSnapshots.length > backupsToKeep){
          console.log("Removing the oldest snapshot(s)...");

          // Remove all the old snapshots and don't wait around for results
          for(var item in oldSnapshots){
            EC2.deleteSnapshot({SnapshotId:item.snapshotId}).promise();
          }
        }
        
        callback(null);      
      });
    });
  }
}
