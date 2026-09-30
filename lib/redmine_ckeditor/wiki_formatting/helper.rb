# frozen_string_literal: true

module RedmineCkeditor::WikiFormatting
  module Helper
    include RedmineCkeditor::Helper

    def wikitoolbar_for(field_id, preview_url = preview_text_path)
      heads_for_wiki_formatter
      options = RedmineCkeditor.options(
        upload_url: redmine_ckeditor_uploads_path,
        preview_url: preview_url
      )
      javascript_tag("RedmineCKEditor.replace(#{field_id.to_json}, #{options.to_json});")
    end

    def initial_page_content(page)
      "<h1>#{ERB::Util.html_escape(page.pretty_title)}</h1>"
    end

    def heads_for_wiki_formatter
      return if @heads_for_wiki_formatter_included

      content_for :header_tags do
        javascript_include_tag('jstoolbar/jstoolbar') +
          javascript_include_tag("jstoolbar/lang/jstoolbar-#{current_language.to_s.downcase}") +
          stylesheet_link_tag('jstoolbar') +
          ckeditor_javascripts +
          stylesheet_link_tag('ckeditor5', plugin: 'redmine_ckeditor') +
          stylesheet_link_tag('editor', plugin: 'redmine_ckeditor')
      end
      @heads_for_wiki_formatter_included = true
    end
  end
end
