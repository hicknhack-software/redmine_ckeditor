require 'redmine'
require_relative 'lib/redmine_ckeditor'

ActiveSupport::Reloader.to_prepare do
  RedmineCkeditor.apply_patch
end

Redmine::Plugin.register :redmine_ckeditor do
  name 'Redmine CKEditor plugin'
  author 'HicknHack Software GmbH'
  author_url 'http://www.hicknhack-software.com'
  description 'This is a CKEditor plugin for Redmine'
  version '2.0.1'
  requires_redmine :version_or_higher => '6.1.0'
  url 'https://github.com/hicknhack-software/redmine_ckeditor'

  settings(:partial => 'settings/ckeditor')

  wiki_format_provider 'CKEditor', RedmineCkeditor::WikiFormatting::Formatter,
    RedmineCkeditor::WikiFormatting::Helper
end
