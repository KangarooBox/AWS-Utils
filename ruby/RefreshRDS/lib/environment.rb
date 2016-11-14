# Set up the environment
require 'yaml'
require 'json'
ENVIRONMENT = (ENV['RAILS_ENV'] ||= 'development').to_sym

SCRIPT_NAME = File.basename($0, '.*').to_sym
CONFIG_PATH = File.expand_path("../../config/main.yml", __FILE__)
CONFIG      = File.exists?(CONFIG_PATH) ? YAML.load_file(CONFIG_PATH)[ENVIRONMENT] : {}

# Require everything we need
require 'bundler'
require 'logger'
Bundler.require(:default, ENVIRONMENT) if defined?(Bundler)
I18n.enforce_available_locales = false

# Instantiate AWS
Aws.config

# Add some friendly logging support
LOG = Logger.new(STDOUT)
LOG.formatter = Logger::Formatter.new
LOG.level = CONFIG[:debug] ? Logger::DEBUG : Logger::WARN if CONFIG
def debug(msg="");  LOG.debug msg; end
def info(msg="");   LOG.info  msg; end
def error(msg="")
  LOG.error msg
end
def fatal(msg="")
  LOG.fatal msg
end

# Load the remaining libraries
# Dir['./lib/*.rb'].each{ |f| require f }
info "running in '#{ENVIRONMENT}' environment"
