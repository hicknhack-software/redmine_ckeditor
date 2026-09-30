# frozen_string_literal: true

require 'json'
require 'pathname'
require 'yaml'

module RedmineCkeditor
  class << self
    def root
      @root ||= Pathname(__dir__).join('..').expand_path
    end

    def assets_root
      "#{Redmine::Utils.relative_url_root}/plugin_assets/redmine_ckeditor"
    end

    def allowed_protocols
      Array(ckeditor_config[:allowedProtocols]).presence || %w[
        http https ftp mailto callto ssh sftp news nntp tel urn webcal xmpp
      ]
    end

    def allowed_tags
      Array(ckeditor_config[:allowedTags]).presence || %w[
        a abbr address article aside b blockquote br caption cite code col colgroup
        dd del div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i
        iframe img ins kbd li main mark nav ol p pre s samp section small span strike
        strong sub sup table tbody td tfoot th thead tr tt u ul var
      ]
    end

    def allowed_attributes
      Array(ckeditor_config[:allowedAttributes]).presence || %w[
        abbr align alt border cellpadding cellspacing cite class colspan datetime dir
        height href id name rel reversed role rowspan scope sizes src srcset start style
        target title valign width xml:lang
      ]
    end

    def default_toolbar
      %w[
        heading | bold italic underline strikethrough subscript superscript code |
        fontFamily fontSize
        fontColor fontBackgroundColor | bulletedList numberedList todoList | outdent
        indent alignment blockQuote codeBlock | link uploadImage mediaEmbed insertTable
        horizontalLine specialCharacters highlight | findAndReplace removeFormat
        showBlocks sourceEditing | undo redo
      ].join(',')
    end

    def ckeditor_config
      @ckeditor_config ||= begin
        config = {}
        path = Rails.root.join('config', 'ckeditor.yml')
        if path.file?
          parsed = YAML.safe_load_file(path, permitted_classes: [], aliases: false) || {}
          config = parsed.deep_symbolize_keys
        end
        config
      end
    end

    def options(upload_url: nil, preview_url: nil)
      editor_config = ckeditor_config.except(:allowedProtocols, :allowedTags, :allowedAttributes)
      defaults = {
        licenseKey: 'GPL',
        toolbar: {
          items: RedmineCkeditorSetting.toolbar,
          shouldNotGroupWhenFull: !RedmineCkeditorSetting.group_toolbar_items?
        },
        heading: {
          options: [
            {model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph'},
            {model: 'heading1', view: 'h1', title: 'Heading 1', class: 'ck-heading_heading1'},
            {model: 'heading2', view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2'},
            {model: 'heading3', view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3'}
          ]
        },
        htmlSupport: {
          allow: [{name: '$all', attributes: true, classes: true, styles: true}]
        },
        image: {
          toolbar: %w[imageTextAlternative toggleImageCaption imageStyle:inline imageStyle:block imageStyle:side resizeImage]
        },
        table: {
          contentToolbar: %w[tableColumn tableRow mergeTableCells tableProperties tableCellProperties toggleTableCaption]
        },
        link: {
          addTargetToExternalLinks: true,
          defaultProtocol: 'https://'
        },
        mediaEmbed: {previewsInData: true},
        style: {definitions: []},
        redmineUpload: {uploadUrl: upload_url},
        redminePreviewUrl: preview_url,
        redmineHeight: RedmineCkeditorSetting.height,
        redmineWidth: RedmineCkeditorSetting.width,
        redmineUiColor: RedmineCkeditorSetting.ui_color,
        redmineShowBlocks: RedmineCkeditorSetting.show_blocks?
      }
      defaults.deep_merge(editor_config)
    end

    def enabled?
      Setting.text_formatting == 'CKEditor'
    end

    def apply_patch
      ApplicationController.helper(ApplicationHelperPatch)
      JournalsController.prepend(JournalsControllerPatch) unless JournalsController < JournalsControllerPatch
      MailHandler.prepend(MailHandlerPatch) unless MailHandler < MailHandlerPatch
      MessagesController.prepend(MessagesControllerPatch) unless MessagesController < MessagesControllerPatch
      QueriesHelper.prepend(QueriesHelperPatch) unless QueriesHelper < QueriesHelperPatch
    end
  end
end

require_relative 'redmine_ckeditor/helper'
require_relative 'redmine_ckeditor/application_helper_patch'
require_relative 'redmine_ckeditor/queries_helper_patch'
require_relative 'redmine_ckeditor/journals_controller_patch'
require_relative 'redmine_ckeditor/messages_controller_patch'
require_relative 'redmine_ckeditor/mail_handler_patch'
require_relative 'redmine_ckeditor/legacy_migration'
