# frozen_string_literal: true

module RedmineCkeditor::WikiFormatting
  module Helper
    include RedmineCkeditor::Helper

    def wikitoolbar_for(field_id, _preview_url = preview_text_path)
      heads_for_wiki_formatter
      options = RedmineCkeditor.options(upload_url: redmine_ckeditor_uploads_path)
      javascript_tag("RedmineCKEditor.replace(#{field_id.to_json}, #{options.to_json});")
    end

    def initial_page_content(page)
      "<h1>#{ERB::Util.html_escape(page.pretty_title)}</h1>"
    end

    def heads_for_wiki_formatter
      return if @heads_for_wiki_formatter_included

      content_for :header_tags do
        ckeditor_javascripts +
          stylesheet_link_tag('ckeditor5', plugin: 'redmine_ckeditor') +
          stylesheet_link_tag('editor', plugin: 'redmine_ckeditor')
      end
      @heads_for_wiki_formatter_included = true
    end
  end
end
