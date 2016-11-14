ENV['RAILS_ENV'] = 'test'

$LOAD_PATH.unshift(File.expand_path('../../lib', __FILE__))
require File.expand_path("../../lib/environment", __FILE__)
require 'minitest/autorun'
require 'minitest/pride'

def fake_order_repository(orders)
  def orders.pending
    self
  end
  def in_production
    self
  end
  orders
end

def fake_order_details_repository
  order_details_repository = []
  def order_details_repository.save(order_details)
    self << order_details
  end
  order_details_repository
end

def fake_oms_client
  oms_client = []
  def oms_client.insert_order(order)
    self << order
  end
  def oms_client.update_order_status(order)
    order.items.each do |item|
      item.status = ORDER_DETAILS_STATUS_SHIPPED
    end
  end
  oms_client
end

def sample_order
  Order.new({items: []})
end

def cod_order(has_cod_item = true)
  o = sample_order
  def o.has_cod_items_for_production?
    true
  end
  def o.has_cod_items_in_production?
    true
  end
  od = sample_item(has_cod_item)
  o.define_singleton_method(:items) { [od] }
  o
end

def sample_item(is_cod)
  od = OrderDetails.new({ 'status' => { 'id' => ORDER_DETAILS_STATUS_IN_PRODUCTION } })
  od.define_singleton_method(:produce_at_cod?) { is_cod }
  od
end
