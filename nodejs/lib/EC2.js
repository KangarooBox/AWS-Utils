"use strict";

require('../lib/tools')();
var AWS = require('aws-sdk');
var slug = require('slug');

module.exports = {

  // Create a snapshot of an EC2 volume and clean any 'old' snapshots
  backupVolume: function(region, volumeName, backupsToKeep, callback) {
    var EC2 = new AWS.EC2({apiVersion: '2016-09-15', region: region});
    var snapshots = null;

    // Get the existing snapshots by getting the Volume using its name and then
    // using the volumeId to get all of it's snapshots
    console.log('Getting volume information...');
    EC2.describeVolumes({
      Filters: [{Name: "tag:Name", Values: [volumeName]}]
    }).promise().then(function(result){      
      if(result.Volumes.length < 1){ callback('Volume not found'); return null;}

      var volume = result.Volumes[0];
      var snapshotPromise = EC2.describeSnapshots({
            Filters: [{Name: "volume-id", Values:[volume.VolumeId]}]
            }).promise().then(function(result){
              console.log(' - got snapshot information'); 
              return result.Snapshots; 
            })

      var tagPromise = EC2.describeTags({
        Filters: [{Name: "resource-id", Values: [volume.VolumeId]}, {Name:'resource-type', Values: ['volume']}]
      }).promise().then(function(result){
        console.log(' - got existing volume tags'); 
        return result.Tags; 
      });

      // After all the necessary information is gathered, create the snapshot and clean up any old items
      Promise.all([snapshotPromise, tagPromise]).then(function(values) {
        snapshots = values[0];
        var tags = values[1].map(function(tag){ return {Key: tag.Key, Value: tag.Value}; }).filter(cleanupTags);

        // Create the new snapshot
        var date = new Date().toISOString().replace(/-/g,"").replace(/:/g,"");
        var description = slug(volumeName+'-snapshot-'+date, {lower:true});
        console.log("Creating new snapshot: '%s'", description);
        EC2.createSnapshot({
          Description: description,
          VolumeId: volume.VolumeId
        }).promise().then(function(data){
          EC2.createTags({Resources: [data.SnapshotId], Tags: tags}).promise();
          return EC2.waitFor('snapshotCompleted', { SnapshotIds: [data.SnapshotId] }).promise();

        // Clean up old snapshots
        }).then(function(data){
          if(snapshots.length > backupsToKeep){
            console.log('Removing the oldest snapshot(s)...');

            var oldSnapshots = snapshots.sort(function(a,b){
              if(a.SnapshotCreateTime > b.SnapshotCreateTime){return 1;}
              if(a.SnapshotCreateTime < b.SnapshotCreateTime){return -1;}
              return 0;
            }).splice(backupsToKeep, snapshots.length-backupsToKeep);

            // Remove all the old snapshots and don't wait around for results
            oldSnapshots.forEach(function(snapshot){
              console.log(" - deleting '%s'...", snapshot.SnapshotId);
              EC2.deleteSnapshot({SnapshotId:snapshot.SnapshotId}).promise();
            });
          }
          
          callback(null);      
        });
      });
    });
  }
}
