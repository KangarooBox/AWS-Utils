#!/usr/bin/env ruby
require File.expand_path("../../lib/environment", __FILE__)

##############################################################
# This script will replace an existing RDS instance (DESTRDS)
# with the latest snapshot of another RDS instance (SRCRDS).
# This is usually used to refresh DEV/STAGE RDS instances with
# the latest LIVE data/schema.
#
# Environment Variables
#  - REGION : AWS Region that houses the RDS instances (us-west-2, us-east-1, etc.)
#  - CLASS : RDS Instance Class for the new RDS instance (db.t2.medium, db.r3.large, etc.)
#  - SOURCE : RDS Instance to use as the source of the snapshot
#  - DESTINATION : RDS Instance to be replaced by the new snapshot
##############################################################


CLASS   = ENV['CLASS']
REGION  = ENV['REGION']
SRCRDS  = ENV['SOURCE']
DESTRDS = ENV['DESTINATION']
CLIENT  = Aws::RDS::Client.new(region: REGION)

# Rename an RDS instance
def rename_rds_instance(old_instance_id, new_instance_id)
  options = {
    db_instance_identifier:     old_instance_id,
    new_db_instance_identifier: new_instance_id,
    apply_immediately:          true
  }
  info "renaming instance '#{options[:db_instance_identifier]}' to '#{options[:new_db_instance_identifier]}'..."
  resp = CLIENT.modify_db_instance(options).db_instance
end


# Find correct snapshot from SRCRDS
resp = CLIENT.describe_db_snapshots({ db_instance_identifier: SRCRDS })
snapshot = resp.db_snapshots.sort{|x,y| x.snapshot_create_time <=> y.snapshot_create_time}.last

# Get DESTRDS details
existing_instance = CLIENT.describe_db_instances({ db_instance_identifier: DESTRDS }).db_instances.first
existing_tags     = CLIENT.list_tags_for_resource({resource_name: "arn:aws:rds:#{REGION}:039125873943:db:#{existing_instance.db_instance_identifier}"}).tag_list

# Massage the existing tags
existing_tags.delete_if{|i| "Origin" == i[:key]}                                # Replace the ORIGIN tag
existing_tags.select {|i| i[:key] = "X#{i[:key]}" if i[:key][0..3] == 'aws:' }  # Rename "aws:" tags

# Create new RDS instance with temp name
options = {
  db_instance_identifier: "Z#{Time.new.to_i}#{DESTRDS}".truncate(15, omission: ''),
  db_snapshot_identifier: snapshot.db_snapshot_identifier,
  db_instance_class: CLASS,
  tags: [{ key: 'Origin', value: "Restored from snapshot: #{snapshot.db_snapshot_identifier}" }] + existing_tags
}
if existing_instance.db_subnet_group && 'Complete' == existing_instance.db_subnet_group[:subnet_group_status]
  options[:db_subnet_group_name]  = existing_instance.db_subnet_group[:db_subnet_group_name]
end

info "restoring instance to '#{options[:db_instance_identifier]}' from snapshot '#{options[:db_snapshot_identifier]}'"
new_instance = CLIENT.restore_db_instance_from_db_snapshot(options).db_instance
CLIENT.wait_until(:db_instance_available, {db_instance_identifier: options[:db_instance_identifier]}) do |w|
  # Since it takes a while to rename an RDS instance, well start the rename process before
  # the new instance gets finished being created.  This cuts down on a race condition where
  # the old instance hasn't finished being renamed and the new instance want's to take its name.
  rename_rds_instance(existing_instance.db_instance_identifier, "#{existing_instance.db_instance_identifier}-old")

  w.before_attempt do |n|
    info "waiting for the new instance '#{options[:db_instance_identifier]}' to be created..."
  end
end


# Modify the new RDS instance
options = {
  db_instance_identifier:   new_instance.db_instance_identifier,
  db_security_groups:       existing_instance.db_security_groups.map{|i| i.db_security_group_name if 'active'==i.status},
  db_parameter_group_name:  existing_instance.db_parameter_groups.map{|i| i.db_parameter_group_name if 'in-sync'==i.parameter_apply_status}.first,
  option_group_name:        existing_instance.option_group_memberships.map{|i| i.option_group_name if 'in-sync'==i.status}.first,
  publicly_accessible:      existing_instance.publicly_accessible,
  backup_retention_period:  0,
  apply_immediately:        true
}
options[:vpc_security_group_ids]  = existing_instance.vpc_security_groups.map{|i| i.vpc_security_group_id} if existing_instance.vpc_security_groups
resp = CLIENT.modify_db_instance(options)
CLIENT.wait_until(:db_instance_available, {db_instance_identifier: options[:db_instance_identifier]}) do |w|
  w.before_attempt do |n|
    info "waiting for the new instance '#{options[:db_instance_identifier]}' to become available..."
  end
end

# Rename new RDS instance to DESTRDS
rename_rds_instance(new_instance.db_instance_identifier, existing_instance.db_instance_identifier)


# Delete the old RDS instance
options = {
  db_instance_identifier:   "#{existing_instance.db_instance_identifier}-old",
  skip_final_snapshot:      true
}
info "deleting instance '#{options[:db_instance_identifier]}'..."
resp = CLIENT.delete_db_instance(options).db_instance
CLIENT.wait_until(:db_instance_deleted, {db_instance_identifier: options[:db_instance_identifier]}) do |w|
  w.before_attempt do |n|
    info "waiting for instance '#{options[:db_instance_identifier]}' to be deleted..."
  end
end

info "done"