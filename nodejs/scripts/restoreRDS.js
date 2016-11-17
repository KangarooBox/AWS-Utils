#!/usr/bin/env node
"use strict";

var RDS = require("../lib/RDS");
var destination = process.argv[2];
var source = process.argv[3];
var region = process.argv[4];
var instanceClass = process.argv[5];

RDS.restoreSnapshot(source, destination, region, instanceClass, function(err) {
  if (err) { console.error(err); return; }
  console.log("Done.");
});