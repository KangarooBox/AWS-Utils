// 
// This module contains various tools that are used in multiple places
//

module.exports = function() {
  this.cleanupTags = function(tag) {
    // Tags that begin with "aws:" & "rds:" are restricted and can't be created manually
    return ("aws:" != tag.Key.substring(0,4) && "rds:" != tag.Key.substring(0,4));
  }
}