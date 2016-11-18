#!/usr/bin/env node
"use strict";

var EC2 = require("../lib/EC2");
var program = require('commander');

program
  .version('0.0.1')
  .description('Create a snapshot of an AWS EC2 volume')
  .option('-r, --region <string>', 'AWS Region')
  .option('-v, --volume <string>', 'Name of the volume to backup')
  .option('-k, --keep <n>', 'Number of backups to keep', parseInt)
  .parse(process.argv);

  if(4 != process.argv.slice(4).length){
    program.outputHelp();
    process.exit(1);
  }

EC2.backupVolume(program.region, program.volume, program.keep, function(err) {
  if (err) { console.error(err); return; }
  console.log("Done.");
});