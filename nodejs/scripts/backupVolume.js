#!/usr/bin/env node
"use strict";

var EC2 = require("../lib/EC2");
var region = process.argv[2];
var volumeName = process.argv[3];
var backupsToKeep = parseInt(process.argv[4]);

EC2.backupVolume(region, volumeName, backupsToKeep, function(err) {
  if (err) { console.error(err); return; }
  console.log("Done.");
});