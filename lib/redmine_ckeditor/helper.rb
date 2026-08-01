# frozen_string_literal: true

module RedmineCkeditor
  module Helper
    def ckeditor_javascripts
      javascript_include_tag('ckeditor5', plugin: 'redmine_ckeditor') +
        javascript_include_tag('integration', plugin: 'redmine_ckeditor')
    end
  end
end
