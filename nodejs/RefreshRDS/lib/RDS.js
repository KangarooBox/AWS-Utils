"use strict";

var util = require('util');
var AWS = require('aws-sdk');

module.exports = {

  // Replace an existing RDS instance with a snapshot of another instance
  restoreSnapshot: function(source, destination, region, instanceClass, callback) {
    var RDS = new AWS.RDS({apiVersion: '2014-10-01', region: 'us-east-1'});

    // Get all of the existing snapshots for the source RDS instance
    var rdsSnapshots = RDS.describeDBSnapshots({"DBInstanceIdentifier" : source})
        .promise().then(function(result){
        return new Promise(function (fulfill, reject){
          if(result.DBSnapshots.length < 1) reject(new Error("no snapshot found for '"+ source +"'"));
          else fulfill(result.DBSnapshots);
        });
    });

    // Get the existing destination instance
    var existingDestination = RDS.describeDBInstances({"DBInstanceIdentifier" : destination})
        .promise().then(function(result){
        return new Promise(function (fulfill, reject){
          if(result.DBInstances.length < 1) reject();
          else {
            RDS.listTagsForResource({"ResourceName" : result.DBInstances[0].DBInstanceArn}, function(err, data){
              if(err) reject(err);
              else {
                // Tags that begin with "aws:" & "rds:" are restricted and can't be created manually
                var tags = data.TagList.filter(function(tag){
                  return ("aws:" != tag.Key.substring(0,4) && "rds:" != tag.Key.substring(0,4));
                });
                result.DBInstances[0].Tags = tags;
                fulfill(result.DBInstances[0]);
              }
            });
          }
        });
    });

    // Process the results
    Promise.all([rdsSnapshots, existingDestination]).then(function(values) {
      var snapshots = values[0];
      var oldInstance = values[1];
      var tempDBInstanceId = oldInstance.DBInstanceIdentifier.substring(0,5) + new Date().getTime();
      var renamedDBInstanceId = "old" + oldInstance.DBInstanceIdentifier;

      // Find the latest Snapshot
      var snapshot = snapshots.sort(function(a,b){
        if(a.SnapshotCreateTime > b.SnapshotCreateTime){return 1;}
        if(a.SnapshotCreateTime < b.SnapshotCreateTime){return -1;}
        return 0;
      })[snapshots.length-1];

      // You can't specify all the necessary parameters when you restore an RDS instance
      //  from a snapshot, so you have to do it in 2 steps: restore then modify

      // Step 1: Restore the RDS instance from a snapshot
      console.log("Creating a new instance from a snapshot...");
      var params = {};
      params.DBInstanceIdentifier = tempDBInstanceId;
      params.DBSnapshotIdentifier = snapshot.DBSnapshotIdentifier;
      params.DBInstanceClass = instanceClass;
      params.CopyTagsToSnapshot = oldInstance.CopyTagsToSnapshot;
      params.DBSubnetGroupName = oldInstance.DBSubnetGroup.DBSubnetGroupName;
      params.PubliclyAccessible = oldInstance.PubliclyAccessible;
      var newPromise = RDS.restoreDBInstanceFromDBSnapshot(params).promise();

      // Step 2: Rename the old instance to something else
      console.log("Renaming the old instance...");
      var renamePromise = RDS.modifyDBInstance({
            DBInstanceIdentifier: oldInstance.DBInstanceIdentifier,
            NewDBInstanceIdentifier: renamedDBInstanceId,
            ApplyImmediately: true}).promise();
      newPromise.then(function(data){
        return RDS.waitFor('dBInstanceAvailable', { DBInstanceIdentifier: tempDBInstanceId }).promise();

      // Step 3: Modify the new instance to match the old instance (security groups, etc.)
      }).then(function(data){
        console.log("Modifying new instance to match old instance...");
        var params = {};
        params.DBInstanceIdentifier = tempDBInstanceId;
        params.NewDBInstanceIdentifier = oldInstance.DBInstanceIdentifier;
        params.ApplyImmediately = true;
        params.BackupRetentionPeriod = oldInstance.BackupRetentionPeriod;
        // Only include "active" security groups
        params.VpcSecurityGroupIds = oldInstance.VpcSecurityGroups.map(function(obj){
          if("active" == obj.Status) return obj.VpcSecurityGroupId;
        }).filter(function(obj){
          if(obj) return true;
        });
        return RDS.modifyDBInstance(params).promise();
      }).then(function(data){
        return RDS.waitFor('dBInstanceAvailable', {DBInstanceIdentifier:tempDBInstanceId}).promise();

      // Step 4: Remove the old instance and we're done
      }).then(function(data){
        console.log("Removing the old instance...");
        return RDS.deleteDBInstance({
          DBInstanceIdentifier: renamedDBInstanceId,
          SkipFinalSnapshot: true
        }).promise();
      }).then(function(data){
        return RDS.waitFor('dBInstanceDeleted', {DBInstanceIdentifier:renamedDBInstanceId}).promise();

      }).then(function(data){ callback(null); return });

    }).catch(function(error){ callback(error); return; });

    console.log("Restoring latest snapshot from '%s' to '%s'...", source, destination);
  }
}
